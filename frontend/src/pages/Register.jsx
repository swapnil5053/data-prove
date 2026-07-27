import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useWallet } from '../context/WalletContext'
import { registerDatasetOnChain, getExplorerUrl } from '../services/solana'
import { mintDatasetId } from '../services/id'
import { enqueue as enqueuePendingSync } from '../services/pendingSync'
import { classifyChainError, classifyApiError, walletDisconnected } from '../services/errors'
import HashRibbon from '../components/HashRibbon'
import './Register.css'

/**
 * Registration is chain-first.
 *
 * The old order was: POST to the backend, then sign if a wallet happened to be
 * connected, then swallow any signing failure and navigate to the dataset page anyway.
 * Combined with the backend's `txSignature || ''`, that let a dataset exist in Mongo
 * with no on-chain anchor and nothing to distinguish it from a real one. The mutable
 * database was the source of truth and the chain was decorative.
 *
 * The order below is the product's claim, enforced:
 *
 *   1. a wallet is a precondition, not an enhancement
 *   2. hash locally, and show the user what they are about to attest to
 *   3. send and confirm on-chain
 *   4. only then tell the backend, with the signature
 *   5. chain accepted but backend unreachable is a sync problem, not a failure
 */
export default function Register({ addToast }) {
  const navigate = useNavigate()
  const { connected, publicKey, setModalOpen, getAdapter } = useWallet()

  const [form, setForm] = useState({ name: '', description: '', ipfsCid: '', metadataUri: '' })
  const [fileHash, setFileHash] = useState('')
  const [fileName, setFileName] = useState('')
  const [fileSize, setFileSize] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [submitStep, setSubmitStep] = useState('')
  const [txSignature, setTxSignature] = useState(null)
  const [registeredId, setRegisteredId] = useState(null)
  const [syncPending, setSyncPending] = useState(false)
  const [error, setError] = useState(null)

  // Minted once and held in a ref, not state: a re-render between signing and POSTing
  // must not be able to lose it, or the row would reference a different id than the PDA
  // that has just been paid rent on.
  //
  // Retrying after a failure reuses the same id on purpose. If the earlier attempt
  // actually did confirm and the UI lost track of it, the retry collides with the
  // existing PDA and fails loudly, instead of quietly anchoring the same dataset twice.
  // Cleared whenever the name or the file changes, since that is a different dataset.
  const datasetIdRef = useRef(null)

  const handleChange = (e) => {
    if (e.target.name === 'name') datasetIdRef.current = null
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleFileDrop = async (e) => {
    e.preventDefault()
    const file = e.target.files?.[0] || e.dataTransfer?.files?.[0]
    if (!file) return
    setFileName(file.name)
    setFileSize(file.size)
    setError(null)
    datasetIdRef.current = null
    const buffer = await file.arrayBuffer()
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
    const hash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
    setFileHash(hash)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    // ── 1. Wallet is a precondition ──────────────────────────────────────────
    if (!connected || !publicKey) {
      setError(walletDisconnected())
      setModalOpen(true)
      return
    }
    if (!form.name.trim() || !fileHash) {
      setError(classifyApiError({ status: 400 }, {
        error: 'A dataset name and a file are both required before anything can be anchored.',
      }))
      return
    }

    setSubmitting(true)
    setTxSignature(null)
    setSyncPending(false)

    // ── 2. The user has seen the hash. Mint the id it will be filed under. ───
    let datasetId
    let signature
    try {
      datasetIdRef.current ??= await mintDatasetId(form.name.trim(), publicKey)
      datasetId = datasetIdRef.current
    } catch (err) {
      setError(classifyChainError(err))
      setSubmitting(false)
      return
    }

    // ── 3. Chain first. Nothing is persisted until this returns a signature. ─
    try {
      setSubmitStep('Waiting for your signature')
      const adapter = getAdapter()
      setSubmitStep('Confirming on-chain')
      const result = await registerDatasetOnChain(adapter, publicKey, {
        datasetId,
        name: form.name.trim(),
        fileHash,
        description: form.description,
        ipfsCid: form.ipfsCid,
        metadataUri: form.metadataUri,
      })
      signature = result.signature
      setTxSignature(signature)
    } catch (err) {
      // Typed, never swallowed. Nothing was written anywhere, and the message says so.
      setError(classifyChainError(err))
      setSubmitting(false)
      setSubmitStep('')
      return
    }

    // ── 4. Confirmed. Now tell the backend, with the signature. ──────────────
    const body = {
      datasetId,
      name: form.name.trim(),
      description: form.description,
      ipfsCid: form.ipfsCid,
      metadataUri: form.metadataUri,
      fileHash,
      authority: publicKey,
      txSignature: signature,
    }

    setSubmitStep('Recording')
    try {
      const res = await fetch('/api/datasets/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => undefined)

      if (!res.ok || !data?.success) {
        // ── 5. The anchor exists. A sync problem, not a failed registration. ──
        enqueuePendingSync({ endpoint: '/api/datasets/register', body, signature })
        setSyncPending(true)
        setRegisteredId(datasetId)
        addToast('Recorded on-chain. Sync pending.')
      } else {
        setRegisteredId(data.datasetId ?? datasetId)
        datasetIdRef.current = null
        addToast('Dataset anchored on-chain.')
      }
    } catch {
      // Network failure reaching our own API. Same reasoning: the chain accepted it.
      enqueuePendingSync({ endpoint: '/api/datasets/register', body, signature })
      setSyncPending(true)
      setRegisteredId(datasetId)
      addToast('Recorded on-chain. Sync pending.')
    } finally {
      setSubmitStep('')
      setSubmitting(false)
    }
  }

  const walletReady = connected && publicKey
  const canSubmit = walletReady && !!fileHash && !!form.name.trim() && !submitting

  return (
    <div className="page-container">
      <motion.div
        className="page-header"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="page-title">
          Register Dataset
        </h1>
        <p className="page-subtitle">
          Anchor your dataset's SHA-256 hash on Solana. The hash is computed here and
          signed by you before anything is recorded.
        </p>
      </motion.div>

      <motion.div
        className="register-form"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5 }}
      >
        <div className="register-main">
        <form onSubmit={handleSubmit} className="glass-card form-card">
          {/* File */}
          <div className="input-group" style={{ marginBottom: 'var(--space-6)' }}>
            <label htmlFor="file-input">Dataset File</label>
            <div
              className="file-drop-zone"
              onDragOver={e => e.preventDefault()}
              onDrop={handleFileDrop}
              onClick={() => document.getElementById('file-input').click()}
            >
              <input
                id="file-input"
                type="file"
                style={{ display: 'none' }}
                onChange={handleFileDrop}
              />
              <p>
                {fileName
                  ? `Selected: ${fileName}`
                  : 'Drag and drop your dataset file, or click to browse'}
              </p>
              <p style={{ fontSize: '0.8rem', color: 'var(--fg-subtle)', marginTop: '8px' }}>
                File is hashed locally. It never leaves your machine.
              </p>
            </div>

            {/* What is being attested to, shown at full weight before the wallet
                ever opens. This is the one moment the user can still check the
                value against their own copy, so it gets the ribbon, not a pill. */}
            {fileHash && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <HashRibbon value={fileHash} announce={addToast} />
                <p className="ribbon-note">
                  This is the value that will be written on-chain
                  {fileSize ? ` for ${fileName} (${fileSize.toLocaleString()} bytes)` : ''}.
                  Nothing is recorded until you sign it.
                </p>
              </motion.div>
            )}
          </div>

          {/* Name & IPFS CID */}
          <div className="form-row" style={{ marginBottom: 'var(--space-6)' }}>
            <div className="input-group">
              <label htmlFor="ds-name">Dataset Name *</label>
              <input
                id="ds-name"
                className="input-field"
                name="name"
                placeholder="e.g., Genome Variant Analysis 2024"
                value={form.name}
                onChange={handleChange}
                required
              />
            </div>
            <div className="input-group">
              <label htmlFor="ds-cid">IPFS CID (Optional)</label>
              <input
                id="ds-cid"
                className="input-field"
                name="ipfsCid"
                placeholder="Qm..."
                value={form.ipfsCid}
                onChange={handleChange}
              />
            </div>
          </div>

          {/* Description */}
          <div className="input-group" style={{ marginBottom: 'var(--space-6)' }}>
            <label htmlFor="ds-desc">Description</label>
            <textarea
              id="ds-desc"
              className="input-field"
              name="description"
              placeholder="Describe your dataset, methodology, and key characteristics..."
              value={form.description}
              onChange={handleChange}
              rows={4}
            />
          </div>

          {/* Metadata URI */}
          <div className="input-group" style={{ marginBottom: 'var(--space-6)' }}>
            <label htmlFor="ds-meta">Metadata URI (Optional)</label>
            <input
              id="ds-meta"
              className="input-field"
              name="metadataUri"
              placeholder="https://research.example.com/dataset/..."
              value={form.metadataUri}
              onChange={handleChange}
            />
          </div>

          {/* Wallet precondition. Not advisory — there is no unsigned path. */}
          {!walletReady && (
            <div className="wallet-precondition" style={{ marginBottom: 'var(--space-6)' }}>
              <p>
                Registration writes to Solana before it writes anywhere else, so a
                connected wallet is required.
              </p>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setModalOpen(true)}>
                Connect wallet
              </button>
            </div>
          )}

          {/* Typed failure, with its own recovery action */}
          {error && (
            <div className="form-error" role="alert" style={{ marginBottom: 'var(--space-6)' }}>
              <p>{error.message}</p>
              {error.detail && (
                <pre style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', whiteSpace: 'pre-wrap' }}>
                  {error.detail}
                </pre>
              )}
              {error.action?.kind === 'link' && error.action.href && (
                <a className="btn btn-secondary btn-sm" href={error.action.href} target="_blank" rel="noopener noreferrer">
                  {error.action.label}
                </a>
              )}
            </div>
          )}

          {/* Submit */}
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => navigate('/dashboard')} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
              {submitting ? (submitStep || 'Working') : 'Sign and anchor this hash'}
            </button>
          </div>

          {/* Result */}
          <AnimatePresence>
            {txSignature && (
              <motion.div
                className={syncPending ? 'tx-result tx-result-pending' : 'tx-result'}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <strong>
                  {syncPending ? 'Recorded on-chain · sync pending' : 'Anchored on Solana'}
                </strong>
                {syncPending && (
                  <p style={{ fontSize: '0.82rem' }}>
                    The transaction is confirmed and the anchor exists. Our index has not
                    caught up and will retry on your next visit. Nothing is lost.
                  </p>
                )}
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', wordBreak: 'break-all', margin: '10px 0' }}>
                  {txSignature}
                </div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <a
                    href={getExplorerUrl(txSignature)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary btn-sm"
                  >
                    View on Solana Explorer
                  </a>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => navigate(`/dataset/${registeredId}`)}
                  >
                    View dataset
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </form>

        {/* The ordering is the product claim, so it is stated on the page where
            it happens rather than buried in a docs site nobody opens. */}
        <aside className="verifier-aside">
          <section className="aside-block">
            <h2 className="aside-title">Order of operations</h2>
            <ol className="aside-steps">
              <li>The file is hashed in your browser.</li>
              <li>You see the digest before anything is signed.</li>
              <li>You sign, and the chain confirms.</li>
              <li>Only then does our database hear about it.</li>
            </ol>
          </section>

          <section className="aside-block">
            <h2 className="aside-title">Why that order</h2>
            <p>
              Writing to the database first would let a dataset exist here with no
              anchor behind it, which would make this registry the source of truth
              and the chain decorative. Nothing is recorded until a signature
              confirms.
            </p>
          </section>

          <section className="aside-block">
            <h2 className="aside-title">If the sync fails</h2>
            <p>
              A confirmed transaction is not undone by our server being
              unreachable. The anchor exists, the record is queued locally and
              retried, and you are told it is pending rather than failed.
            </p>
          </section>
        </aside>
        </div>
      </motion.div>
    </div>
  )
}
