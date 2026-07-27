import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useWallet } from '../context/WalletContext'
import {
  updateDatasetOnChain, transferOwnershipOnChain, deactivateDatasetOnChain,
  getNextVersionNumber, getExplorerUrl,
} from '../services/solana'
import { enqueue as enqueuePendingSync } from '../services/pendingSync'
import { classifyChainError, walletDisconnected } from '../services/errors'
import './DatasetDetail.css'
import { Icon } from '../components/icons'
import HashRibbon from '../components/HashRibbon'
import HashCell from '../components/HashCell'

function formatDate(ts) {
  return new Date(ts * 1000).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

function timeAgo(ts) {
  const diff = Math.floor(Date.now() / 1000) - ts
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`
  return `${Math.floor(diff / 86400)} days ago`
}

export default function DatasetDetail({ addToast }) {
  const { id } = useParams()
  const { connected, publicKey, setModalOpen, getAdapter } = useWallet()

  const [dataset, setDataset]   = useState(null)
  const [versions, setVersions] = useState([])
  const [loading, setLoading]   = useState(true)

  // Update panel state
  const [showUpdate, setShowUpdate]       = useState(false)
  const [newFileHash, setNewFileHash]     = useState('')
  const [newFileName, setNewFileName]     = useState('')
  const [changeDesc, setChangeDesc]       = useState('')
  const [updating, setUpdating]           = useState(false)
  const [updateStep, setUpdateStep]       = useState('')
  const [txSignature, setTxSignature]     = useState(null)

  // Transfer & Deactivate state
  const [showTransfer, setShowTransfer]   = useState(false)
  const [newAuthority, setNewAuthority]   = useState('')
  const [transferring, setTransferring]   = useState(false)
  const [deactivating, setDeactivating]   = useState(false)

  const [error, setError]                 = useState(null)
  const [syncPending, setSyncPending]     = useState(false)

  /**
   * Sign on-chain, then record. Used by transfer and deactivate, which have the same
   * shape as update but no version number to resolve first.
   *
   * All three previously wrote to the backend first and treated a signing failure as a
   * warning to toast past, so ownership could change in Mongo while the chain still
   * named the old authority. The ordering is the whole fix.
   *
   * @returns {Promise<boolean>} whether the chain accepted it
   */
  const signThenRecord = useCallback(async ({ sign, endpoint, buildBody, done, deferred }) => {
    setError(null)
    if (!connected || !publicKey) {
      setError(walletDisconnected())
      setModalOpen(true)
      return false
    }

    let signature
    try {
      const result = await sign()
      signature = result.signature
    } catch (err) {
      setError(classifyChainError(err))
      return false
    }

    const body = buildBody(signature)
    let pending = false
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => undefined)
      if (!res.ok || !data?.success) pending = true
    } catch {
      pending = true
    }

    if (pending) {
      enqueuePendingSync({ endpoint, body, signature })
      setSyncPending(true)
      addToast(deferred)
    } else {
      addToast(done)
    }
    return true
  }, [connected, publicKey, setModalOpen, addToast])

  const loadData = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch(`/api/datasets/${id}`).then(r => r.json()),
      fetch(`/api/datasets/${id}/versions`).then(r => r.json()),
    ]).then(([dsRes, verRes]) => {
      setDataset(dsRes.data || null)
      setVersions((verRes.data || []).reverse())
    }).catch(() => {
      addToast('Failed to load dataset', 'error')
    }).finally(() => setLoading(false))
  }, [id])

  useEffect(() => { loadData() }, [loadData])

  // Compute SHA-256 from a dropped/selected file
  const handleFileDrop = async (e) => {
    const file = e.target.files?.[0] || e.dataTransfer?.files?.[0]
    if (!file) return
    setNewFileName(file.name)
    const buffer = await file.arrayBuffer()
    const hashBuf = await crypto.subtle.digest('SHA-256', buffer)
    const hash = Array.from(new Uint8Array(hashBuf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
    setNewFileHash(hash)
    addToast(`Hash computed for ${file.name}`)
  }

  const handleUpdate = async (e) => {
    e.preventDefault()
    if (!newFileHash) {
      addToast('Please drop the updated dataset file first', 'error')
      return
    }
    if (!changeDesc.trim()) {
      addToast('Please describe what changed in this version', 'error')
      return
    }
    // ── Guard: same file = same hash = no real change ──────────────
    if (newFileHash === dataset.currentHash) {
      addToast('This file is identical to the current version — no change detected. Upload a modified file to create a new version.', 'error')
      return
    }

    setUpdating(true)
    setTxSignature(null)
    setError(null)

    // ── 1. Wallet is a precondition ──────────────────────────────────────────
    if (!connected || !publicKey) {
      setError(walletDisconnected())
      setModalOpen(true)
      setUpdating(false)
      return
    }

    // ── 2. The next version number comes from the chain, not from Mongo ──────
    // Mongo is a cache written after the fact by the verifier worker, so
    // dataset.versionCount can lag. Signing against a stale value produces a
    // transaction the program rejects with InvalidVersionNumber, after the user
    // has already waited for their wallet. The fetch doubles as an existence and
    // ownership check.
    let versionNumber
    let signature
    try {
      setUpdateStep('Reading the current version from the chain')
      versionNumber = await getNextVersionNumber(getAdapter(), publicKey, id)
    } catch (err) {
      setError(classifyChainError(err))
      setUpdating(false)
      setUpdateStep('')
      return
    }

    // ── 3. Chain first ───────────────────────────────────────────────────────
    try {
      setUpdateStep('Waiting for your signature')
      const result = await updateDatasetOnChain(getAdapter(), publicKey, {
        datasetId: id,
        newFileHash,
        versionNumber,
        changeDescription: changeDesc,
      })
      signature = result.signature
      setTxSignature(signature)
    } catch (err) {
      setError(classifyChainError(err))
      setUpdating(false)
      setUpdateStep('')
      return
    }

    // ── 4. Confirmed. Now record it. ─────────────────────────────────────────
    const body = {
      datasetId: id,
      newFileHash,
      versionNumber,
      changeDescription: changeDesc,
      authority: publicKey,
      txSignature: signature,
    }

    setUpdateStep('Recording')
    let pending = false
    try {
      const res = await fetch('/api/datasets/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => undefined)
      if (!res.ok || !data?.success) pending = true
    } catch {
      pending = true
    }

    // ── 5. The anchor exists either way. Never reported as a failure. ────────
    if (pending) {
      enqueuePendingSync({ endpoint: '/api/datasets/update', body, signature })
      setSyncPending(true)
      addToast(`Version ${versionNumber} recorded on-chain. Sync pending.`)
    } else {
      addToast(`Version ${versionNumber} anchored on-chain.`)
    }

    setNewFileHash('')
    setNewFileName('')
    setChangeDesc('')
    setUpdateStep('')
    setUpdating(false)
    loadData()
  }

  const handleTransfer = async (e) => {
    e.preventDefault()
    if (!newAuthority.trim()) return

    setTransferring(true)
    const ok = await signThenRecord({
      sign: () => transferOwnershipOnChain(getAdapter(), publicKey, {
        datasetId: id, newAuthority: newAuthority.trim(),
      }),
      endpoint: '/api/datasets/transfer',
      buildBody: (signature) => ({
        datasetId: id,
        newAuthority: newAuthority.trim(),
        authority: publicKey,
        txSignature: signature,
      }),
      done: 'Ownership transferred on-chain.',
      deferred: 'Ownership transferred on-chain. Sync pending.',
    })
    setTransferring(false)
    if (ok) {
      setNewAuthority('')
      setShowTransfer(false)
      loadData()
    }
  }

  const handleDeactivate = async () => {
    if (!confirm("Are you sure you want to deactivate this dataset? This action cannot be undone.")) return;
    setDeactivating(true)
    const ok = await signThenRecord({
      sign: () => deactivateDatasetOnChain(getAdapter(), publicKey, { datasetId: id }),
      endpoint: '/api/datasets/deactivate',
      buildBody: (signature) => ({
        datasetId: id,
        authority: publicKey,
        txSignature: signature,
      }),
      done: 'Dataset deactivated on-chain.',
      deferred: 'Dataset deactivated on-chain. Sync pending.',
    })
    setDeactivating(false)
    if (ok) loadData()
  }

  // ── Loading / Not Found states ─────────────────────────────────────────────
  // Each early return is its own mount, not a sibling swap within one tree, so
  // a true crossfade between them isn't available cheaply here (unlike
  // Dashboard's loading/grid/empty, which share one parent). Fading each one
  // in on its own mount still replaces the instant materialization with
  // something that arrives, rather than simply appearing.
  if (loading) {
    return (
      <div className="page-container">
        <motion.div
          className="loading-container"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          <div className="spinner"></div>
          <span style={{ color: 'var(--fg-muted)' }}>Loading dataset...</span>
        </motion.div>
      </div>
    )
  }

  if (!dataset) {
    return (
      <div className="page-container">
        <motion.div
          className="empty-state"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          <Icon name="alert-triangle" size={28} className="empty-state-icon" />
          <h3>Dataset Not Found</h3>
          <p>The dataset ID "{id}" does not exist on-chain.</p>
          <Link to="/dashboard" className="btn btn-primary">Back to Dashboard</Link>
        </motion.div>
      </div>
    )
  }

  const isOwner = connected && publicKey === dataset.authority;

  // ── Main render ─────────────────────────────────────────────────────────────
  return (
    <div className="page-container">
      <Link to="/dashboard" className="back-link">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        Back to Dashboard
      </Link>

      {/* Main content sits on an opaque surface so the canvas's drafting-grid
          texture stops showing through dense text (the spec grid, hash
          values, version timeline) -- mirrors the same deliberate .panel use
          on Dashboard; the back-link above stays on canvas. */}
      <div className="panel panel-padded">

      {/* ── Header Card ─────────────────────────────────────────── */}
      <motion.div
        className="glass-card detail-header"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ flex: 1 }}>
            <h1 className="detail-title">{dataset.name}</h1>
            <div className="detail-authority">{dataset.authority}</div>
            <p style={{ color: 'var(--fg-muted)', lineHeight: 1.7, marginTop: '12px' }}>
              {dataset.description}
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
            <span className={`badge ${dataset.isActive ? 'badge-ok' : 'badge-warn'}`}>
              {dataset.isActive ? 'Active' : 'Inactive'}
            </span>
            {/* ── Action Buttons (Owner Only) ── */}
            {isOwner && dataset.isActive && (
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button
                   className="btn btn-primary btn-sm"
                   onClick={() => { setShowUpdate(v => !v); setShowTransfer(false); setTxSignature(null) }}
                   style={{ fontSize: '0.82rem' }}
                 >
                   {showUpdate ? 'Cancel' : 'Publish new version'}
                 </button>
                 <button
                   className="btn btn-secondary btn-sm"
                   onClick={() => { setShowTransfer(v => !v); setShowUpdate(false); setTxSignature(null) }}
                   style={{ fontSize: '0.82rem' }}
                 >
                   {showTransfer ? 'Cancel' : 'Transfer ownership'}
                 </button>
                 <button
                   className="btn btn-ghost btn-sm"
                   onClick={handleDeactivate}
                   disabled={deactivating}
                   style={{ color: 'var(--danger)' }}
                 >
                   {deactivating ? 'Deactivating' : 'Deactivate'}
                 </button>
              </div>
            )}
          </div>
        </div>

        <div className="detail-info-grid">
          <div className="detail-info-item">
            <div className="detail-info-label">Dataset ID</div>
            <div className="detail-info-value mono">{dataset.datasetId}</div>
          </div>
          <div className="detail-info-item">
            <div className="detail-info-label">Current Hash (SHA-256)</div>
            <div className="detail-info-value mono">{dataset.currentHash}</div>
          </div>
          <div className="detail-info-item">
            <div className="detail-info-label">Version</div>
            <div className="detail-info-value">v{dataset.versionCount}</div>
          </div>
          <div className="detail-info-item">
            <div className="detail-info-label">Created</div>
            <div className="detail-info-value">{formatDate(dataset.createdAt)}</div>
          </div>
          <div className="detail-info-item">
            <div className="detail-info-label">Last Updated</div>
            <div className="detail-info-value">{timeAgo(dataset.updatedAt)}</div>
          </div>
          <div className="detail-info-item">
            <div className="detail-info-label">IPFS CID</div>
            <div className="detail-info-value mono">{dataset.ipfsCid || 'N/A'}</div>
          </div>
        </div>
      </motion.div>

      {/* ── Update Version Panel ─────────────────────────────────── */}
      <AnimatePresence>
        {showUpdate && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -10 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -10 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div className="card card-padded" style={{ marginBottom: 'var(--space-6)' }}>
              <h3 style={{ marginBottom: 'var(--space-5)' }}>
                Publish new version — v{dataset.versionCount + 1}
              </h3>

              {/* Scoped to the region that failed, with the recovery action the
                  taxonomy assigned to it. Never a full-page takeover, and never a
                  toast alone. */}
              {error && (
                <div className="form-error" role="alert" style={{ marginBottom: 'var(--space-5)' }}>
                  <p>{error.message}</p>
                  {error.detail && (
                    <pre style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', whiteSpace: 'pre-wrap' }}>
                      {error.detail}
                    </pre>
                  )}
                  {error.action?.kind === 'reload' && (
                    <button type="button" className="btn btn-secondary btn-sm"
                            onClick={() => { setError(null); loadData() }}>
                      {error.action.label}
                    </button>
                  )}
                  {error.action?.kind === 'link' && error.action.href && (
                    <a className="btn btn-secondary btn-sm" href={error.action.href}
                       target="_blank" rel="noopener noreferrer">
                      {error.action.label}
                    </a>
                  )}
                </div>
              )}

              {syncPending && (
                <div className="sync-pending" role="status" style={{ marginBottom: 'var(--space-5)' }}>
                  Recorded on-chain · sync pending. The anchor exists; our index will
                  catch up and retries automatically.
                </div>
              )}

              <form onSubmit={handleUpdate}>
                {/* File drop */}
                <div className="input-group" style={{ marginBottom: 'var(--space-5)' }}>
                  <label>Updated Dataset File *</label>
                  <div
                    className="file-drop-zone"
                    style={{ padding: '24px', minHeight: 'unset' }}
                    onDragOver={e => e.preventDefault()}
                    onDrop={handleFileDrop}
                    onClick={() => document.getElementById('update-file-input').click()}
                  >
                    <input
                      id="update-file-input"
                      type="file"
                      style={{ display: 'none' }}
                      onChange={handleFileDrop}
                    />
                    <Icon name="upload" size={24} />
                    <p style={{ margin: 0 }}>
                      {newFileName ? `Selected: ${newFileName}` : 'Drag & drop updated file, or click to browse'}
                    </p>
                    <p style={{ fontSize: '0.78rem', color: 'var(--fg-subtle)', marginTop: '6px' }}>
                      File is hashed locally — it never leaves your machine
                    </p>
                  </div>
                  {newFileHash && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                      <HashRibbon
                        value={newFileHash}
                        label="New SHA-256"
                        announce={addToast}
                      />
                    </motion.div>
                  )}
                </div>

                {/* Change description */}
                <div className="input-group" style={{ marginBottom: 'var(--space-5)' }}>
                  <label>What changed in this version? *</label>
                  <textarea
                    className="input-field"
                    placeholder="e.g., Added Q1 2025 data, corrected outliers in columns 4-7, expanded sample size..."
                    value={changeDesc}
                    onChange={e => setChangeDesc(e.target.value)}
                    rows={3}
                    required
                  />
                </div>

                {/* Wallet status */}
                <div className="wallet-precondition" style={{ marginBottom: 'var(--space-5)' }}>
                  {connected
                    ? `Signing as ${publicKey?.slice(0, 8)}...${publicKey?.slice(-4)}`
                    : 'A new version is anchored on-chain before it is recorded, so a connected wallet is required.'
                  }
                  {!connected && (
                    <button type="button" className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--accent)' }}
                      onClick={() => setModalOpen(true)}
                    >
                      Connect wallet
                    </button>
                  )}
                </div>

                {/* Action buttons */}
                <div className="form-actions">
                  <button type="button" className="btn btn-ghost"
                    onClick={() => { setShowUpdate(false); setNewFileHash(''); setNewFileName(''); setChangeDesc('') }}
                    disabled={updating}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={updating || !newFileHash}
                  >
                    {updating ? (
                      <>
                        <div className="spinner" style={{ width: 16, height: 16 }}></div>
                        {updateStep || 'Processing...'}
                      </>
                    ) : (
                      <>
                        {connected ? 'Sign & Publish v' : 'Publish v'}{dataset.versionCount + 1}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M5 12h14M12 5l7 7-7 7"/>
                        </svg>
                      </>
                    )}
                  </button>
                </div>

                {/* Tx success banner */}
                <AnimatePresence>
                  {txSignature && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="tx-result"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <Icon name="check" />
                        <strong style={{ color: 'var(--ok)' }}>Confirmed on Solana !</strong>
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--fg-subtle)', wordBreak: 'break-all', marginBottom: '10px' }}>
                        {txSignature}
                      </div>
                      <a href={getExplorerUrl(txSignature)} target="_blank" rel="noopener noreferrer"
                        className="btn btn-secondary btn-sm">
                        View on Solana Explorer ↗
                      </a>
                    </motion.div>
                  )}
                </AnimatePresence>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Transfer Ownership Panel ─────────────────────────────────── */}
      <AnimatePresence>
        {showTransfer && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -10 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -10 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div className="card card-padded" style={{
              marginBottom: 'var(--space-6)',
              padding: 'var(--space-6)',
            }}>
              <h3 style={{ fontWeight: 700, marginBottom: '12px', color: 'var(--accent)' }}>
                Transfer dataset ownership
              </h3>
              <p style={{ color: 'var(--fg-muted)', marginBottom: 'var(--space-5)', fontSize: '0.9rem' }}>
                Transferring ownership grants full control (including updates and deactivation) to the new wallet address. You will lose access to administrative functions for this dataset.
              </p>

              <form onSubmit={handleTransfer}>
                <div className="input-group" style={{ marginBottom: 'var(--space-5)' }}>
                  <label>New Owner Wallet Address *</label>
                  <input
                    type="text"
                    className="input-field mono"
                    placeholder="e.g. 7xKXtg2CW..."
                    value={newAuthority}
                    onChange={e => setNewAuthority(e.target.value)}
                    required
                  />
                </div>

                <div className="form-actions">
                  <button type="button" className="btn btn-ghost"
                    onClick={() => setShowTransfer(false)}
                    disabled={transferring}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={transferring || !newAuthority}
                  >
                    {transferring ? 'Transferring' : 'Confirm transfer'}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Version Timeline ─────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 'var(--space-6)' }}>
          Version History
          <span style={{ color: 'var(--fg-subtle)', fontWeight: 400, fontSize: '0.9rem', marginLeft: '12px' }}>
            ({versions.length} version{versions.length !== 1 ? 's' : ''})
          </span>
        </h2>

        {versions.length > 0 ? (
          <div className="version-timeline">
            {versions.map((v, i) => (
              <motion.div
                key={v.versionNumber}
                className="glass-card version-item"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08, duration: 0.4 }}
              >
                <div className="version-header">
                  <div className="version-number">
                    <span>Version {v.versionNumber}</span>
                    {i === 0 && (
                      <span className="dataset-card-badge badge-version" style={{ marginLeft: '8px', fontSize: '0.65rem' }}>
                        LATEST
                      </span>
                    )}
                  </div>
                  <div className="version-time">{formatDate(v.timestamp)}</div>
                </div>
                <div className="version-desc">{v.changeDescription}</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <span className="version-hash">
                    Hash: <HashCell value={v.fileHash} />
                  </span>
                  {v.previousHash && (
                    <span className="version-hash" style={{ color: 'var(--fg-subtle)', opacity: 0.6 }}>
                      Prev: <HashCell value={v.previousHash} />
                    </span>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="glass-card" style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--fg-muted)' }}>
            No version history available.
          </div>
        )}
      </motion.div>
      </div>
    </div>
  )
}
