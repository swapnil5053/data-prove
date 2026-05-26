import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useWallet } from '../context/WalletContext'
import { updateDatasetOnChain, transferOwnershipOnChain, deactivateDatasetOnChain, getExplorerUrl } from '../services/solana'

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
  const { connected, publicKey, setModalOpen } = useWallet()

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
    let txSig = null

    try {
      // Register updated version with backend
      setUpdateStep('Saving new version...')
      const res = await fetch('/api/datasets/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          datasetId: id,
          newFileHash,
          changeDescription: changeDesc,
          authority: publicKey,
        }),
      })
      const data = await res.json()
      if (!data.success) {
        addToast(data.error || 'Update failed', 'error')
        return
      }

      // Sign transaction via connected wallet
      if (connected && publicKey) {
        try {
          setUpdateStep('Waiting for wallet approval...')
          const savedId = localStorage.getItem('dataprove_wallet')
          let walletAdapter =
            savedId === 'phantom'  ? window?.phantom?.solana :
            savedId === 'solflare' ? window?.solflare :
            savedId === 'backpack' ? window?.backpack :
            window?.solana

          if (walletAdapter) {
            setUpdateStep('Sign the transaction in your wallet...')
            const { signature } = await updateDatasetOnChain(
              walletAdapter,
              publicKey,
              { datasetId: id, newFileHash, versionNumber: data.versionRecord.versionNumber }
            )
            txSig = signature
            setTxSignature(signature)
            setUpdateStep('Transaction confirmed!')
          }
        } catch (walletErr) {
          if (walletErr.message?.includes('rejected') || walletErr.code === 4001) {
            addToast('Transaction rejected by wallet', 'error')
          } else {
            addToast(`On-chain signing failed: ${walletErr.message}`, 'error')
          }
        }
      }

      // Refresh client state
      addToast(txSig
        ? `Version ${data.versionRecord.versionNumber} signed & recorded on Solana! 🎉`
        : `Version ${data.versionRecord.versionNumber} saved successfully!`
      )
      // Reset form + reload data
      setNewFileHash('')
      setNewFileName('')
      setChangeDesc('')
      if (!txSig) setShowUpdate(false)
      loadData()

    } catch (err) {
      addToast('Error: ' + err.message, 'error')
    } finally {
      if (!txSig) setUpdating(false)
      setUpdateStep('')
    }
  }

  const handleTransfer = async (e) => {
    e.preventDefault()
    if (!newAuthority.trim()) return

    setTransferring(true)
    let txSig = null

    try {
      const res = await fetch('/api/datasets/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          datasetId: id,
          newAuthority: newAuthority.trim(),
          authority: publicKey,
        }),
      })
      const data = await res.json()
      if (!data.success) {
        addToast(data.error || 'Transfer failed', 'error')
        return
      }

      if (connected && publicKey) {
        try {
          const savedId = localStorage.getItem('dataprove_wallet')
          let walletAdapter =
            savedId === 'phantom'  ? window?.phantom?.solana :
            savedId === 'solflare' ? window?.solflare :
            savedId === 'backpack' ? window?.backpack :
            window?.solana

          if (walletAdapter) {
            const { signature } = await transferOwnershipOnChain(
              walletAdapter,
              publicKey,
              { datasetId: id, newAuthority: newAuthority.trim() }
            )
            txSig = signature
          }
        } catch (walletErr) {
          addToast(`On-chain signing failed: ${walletErr.message}`, 'error')
        }
      }

      addToast(txSig
        ? `Ownership transferred and confirmed on Solana! 🎉`
        : `Ownership transferred successfully!`
      )
      setNewAuthority('')
      setShowTransfer(false)
      loadData()
    } catch (err) {
      addToast('Error: ' + err.message, 'error')
    } finally {
      setTransferring(false)
    }
  }

  const handleDeactivate = async () => {
    if (!confirm("Are you sure you want to deactivate this dataset? This action cannot be undone.")) return;
    setDeactivating(true)
    let txSig = null

    try {
      const res = await fetch('/api/datasets/deactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          datasetId: id,
          authority: publicKey,
        }),
      })
      const data = await res.json()
      if (!data.success) {
        addToast(data.error || 'Deactivation failed', 'error')
        return
      }

      if (connected && publicKey) {
        try {
          const savedId = localStorage.getItem('dataprove_wallet')
          let walletAdapter =
            savedId === 'phantom'  ? window?.phantom?.solana :
            savedId === 'solflare' ? window?.solflare :
            savedId === 'backpack' ? window?.backpack :
            window?.solana

          if (walletAdapter) {
            const { signature } = await deactivateDatasetOnChain(
              walletAdapter,
              publicKey,
              { datasetId: id }
            )
            txSig = signature
          }
        } catch (walletErr) {
          addToast(`On-chain signing failed: ${walletErr.message}`, 'error')
        }
      }

      addToast(txSig
        ? `Dataset deactivated and confirmed on Solana!`
        : `Dataset deactivated successfully!`
      )
      loadData()
    } catch (err) {
      addToast('Error: ' + err.message, 'error')
    } finally {
      setDeactivating(false)
    }
  }

  // ── Loading / Not Found states ─────────────────────────────────────────────
  if (loading) {
    return (
      <div className="page-container">
        <div className="loading-container">
          <div className="spinner"></div>
          <span style={{ color: 'var(--text-secondary)' }}>Loading dataset...</span>
        </div>
      </div>
    )
  }

  if (!dataset) {
    return (
      <div className="page-container">
        <div className="empty-state">
          <div className="empty-state-icon">❌</div>
          <h3>Dataset Not Found</h3>
          <p>The dataset ID "{id}" does not exist on-chain.</p>
          <Link to="/dashboard" className="btn btn-primary">Back to Dashboard</Link>
        </div>
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

      {/* ── Header Card ─────────────────────────────────────────── */}
      <motion.div
        className="glass-card detail-header"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ flex: 1 }}>
            <h1 className="detail-title">{dataset.name}</h1>
            <div className="detail-authority">👤 {dataset.authority}</div>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginTop: '12px' }}>
              {dataset.description}
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
            <span className={`dataset-card-badge ${dataset.isActive ? 'badge-active' : ''}`} style={{ fontSize: '0.8rem', padding: '6px 14px', background: !dataset.isActive ? 'rgba(255,107,53,0.1)' : undefined, color: !dataset.isActive ? '#ff6b35' : undefined, border: !dataset.isActive ? '1px solid rgba(255,107,53,0.2)' : undefined }}>
              {dataset.isActive ? '● Active' : '● Inactive'}
            </span>
            {/* ── Action Buttons (Owner Only) ── */}
            {isOwner && dataset.isActive && (
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button
                   className="btn btn-primary btn-sm"
                   onClick={() => { setShowUpdate(v => !v); setShowTransfer(false); setTxSignature(null) }}
                   style={{ fontSize: '0.82rem' }}
                 >
                   {showUpdate ? '✕ Cancel Update' : '↑ Update'}
                 </button>
                 <button
                   className="btn btn-secondary btn-sm"
                   onClick={() => { setShowTransfer(v => !v); setShowUpdate(false); setTxSignature(null) }}
                   style={{ fontSize: '0.82rem' }}
                 >
                   {showTransfer ? '✕ Cancel Transfer' : '🔄 Transfer'}
                 </button>
                 <button
                   className="btn btn-ghost btn-sm"
                   onClick={handleDeactivate}
                   disabled={deactivating}
                   style={{ fontSize: '0.82rem', color: '#ff6b35', border: '1px solid rgba(255, 107, 53, 0.3)' }}
                 >
                   {deactivating ? '...' : '🛑 Deactivate'}
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
            <div className="glass-card" style={{
              border: '1px solid rgba(0,229,160,0.25)',
              marginBottom: 'var(--space-xl)',
              padding: 'var(--space-xl)',
            }}>
              <h3 style={{ fontWeight: 700, marginBottom: 'var(--space-lg)', color: 'var(--accent-green)' }}>
                ↑ Publish New Version — v{dataset.versionCount + 1}
              </h3>

              <form onSubmit={handleUpdate}>
                {/* File drop */}
                <div className="input-group" style={{ marginBottom: 'var(--space-lg)' }}>
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
                    <div className="drop-icon" style={{ fontSize: '1.8rem', marginBottom: '8px' }}>📂</div>
                    <p style={{ margin: 0 }}>
                      {newFileName ? `Selected: ${newFileName}` : 'Drag & drop updated file, or click to browse'}
                    </p>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                      File is hashed locally — it never leaves your machine
                    </p>
                  </div>
                  {newFileHash && (
                    <motion.div
                      className="hash-display"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      style={{ marginTop: '8px' }}
                    >
                      <strong>New SHA-256:</strong> {newFileHash}
                    </motion.div>
                  )}
                </div>

                {/* Change description */}
                <div className="input-group" style={{ marginBottom: 'var(--space-lg)' }}>
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
                <div style={{
                  padding: '10px 14px',
                  background: connected ? 'rgba(0,229,160,0.05)' : 'rgba(255,107,53,0.05)',
                  border: `1px solid ${connected ? 'rgba(0,229,160,0.2)' : 'rgba(255,107,53,0.2)'}`,
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.83rem',
                  color: connected ? 'var(--accent-green)' : '#ff9966',
                  marginBottom: 'var(--space-lg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  {connected
                    ? `✅ Wallet: ${publicKey?.slice(0,8)}...${publicKey?.slice(-4)}`
                    : '⚠️ No wallet — version will save in demo mode only'
                  }
                  {!connected && (
                    <button type="button" className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--accent-cyan)' }}
                      onClick={() => setModalOpen(true)}
                    >
                      Connect Wallet →
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
                      style={{
                        marginTop: 'var(--space-lg)',
                        padding: '14px 18px',
                        background: 'rgba(0,229,160,0.07)',
                        border: '1px solid rgba(0,229,160,0.25)',
                        borderRadius: 'var(--radius-md)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '1.2rem' }}>✅</span>
                        <strong style={{ color: 'var(--accent-green)' }}>Confirmed on Solana !</strong>
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)', wordBreak: 'break-all', marginBottom: '10px' }}>
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
            <div className="glass-card" style={{
              border: '1px solid rgba(0,183,255,0.25)',
              marginBottom: 'var(--space-xl)',
              padding: 'var(--space-xl)',
            }}>
              <h3 style={{ fontWeight: 700, marginBottom: '12px', color: 'var(--accent-cyan)' }}>
                🔄 Transfer Dataset Ownership
              </h3>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-lg)', fontSize: '0.9rem' }}>
                Transferring ownership grants full control (including updates and deactivation) to the new wallet address. You will lose access to administrative functions for this dataset.
              </p>

              <form onSubmit={handleTransfer}>
                <div className="input-group" style={{ marginBottom: 'var(--space-lg)' }}>
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
                    className="btn btn-secondary"
                    disabled={transferring || !newAuthority}
                    style={{ background: 'var(--accent-cyan)', color: '#000' }}
                  >
                    {transferring ? (
                      <><div className="spinner" style={{ width: 16, height: 16, filter: 'invert(1)' }}></div> Processing...</>
                    ) : 'Confirm Transfer 🔄'}
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
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 'var(--space-xl)' }}>
          <span className="gradient-text">Version History</span>
          <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.9rem', marginLeft: '12px' }}>
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
                  <span className="version-hash" title={v.fileHash}>
                    Hash: {v.fileHash.slice(0, 16)}...{v.fileHash.slice(-8)}
                  </span>
                  {v.previousHash && (
                    <span className="version-hash" style={{ color: 'var(--text-muted)', opacity: 0.6 }} title={v.previousHash}>
                      Prev: {v.previousHash.slice(0, 12)}...
                    </span>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="glass-card" style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--text-secondary)' }}>
            No version history available.
          </div>
        )}
      </motion.div>
    </div>
  )
}
