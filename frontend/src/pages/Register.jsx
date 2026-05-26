import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useWallet } from '../context/WalletContext'
import { registerDatasetOnChain, getExplorerUrl } from '../services/solana'

export default function Register({ addToast }) {
  const navigate = useNavigate()
  const { connected, publicKey, setModalOpen } = useWallet()

  const [form, setForm] = useState({
    name: '',
    description: '',
    ipfsCid: '',
    metadataUri: '',
  })
  const [fileHash, setFileHash] = useState('')
  const [fileName, setFileName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitStep, setSubmitStep] = useState('') // status label shown during submission
  const [txSignature, setTxSignature] = useState(null)
  const [registeredId, setRegisteredId] = useState(null)

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleFileDrop = async (e) => {
    e.preventDefault()
    const file = e.target.files?.[0] || e.dataTransfer?.files?.[0]
    if (!file) return
    setFileName(file.name)
    const buffer = await file.arrayBuffer()
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    setFileHash(hash)
    addToast(`Hash computed for ${file.name}`)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name || !fileHash) {
      addToast('Please fill in the name and upload a file', 'error')
      return
    }

    setSubmitting(true)
    setTxSignature(null)
    let txSig = null

    try {
      // Register dataset record with backend
      setSubmitStep('Registering dataset...')
      const res = await fetch('/api/datasets/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          fileHash,
          authority: publicKey || 'DemoWallet' + Date.now(),
        }),
      })
      const data = await res.json()
      if (!data.success) {
        addToast(data.error || 'Registration failed', 'error')
        return
      }

      setRegisteredId(data.datasetId)

      // Request wallet signature for on-chain registry if connected
      if (connected && publicKey) {
        setSubmitStep('Waiting for wallet approval...')
        try {
          // Get the connected wallet adapter from the window object
          const savedId = localStorage.getItem('dataprove_wallet')
          let walletAdapter = null
          if (savedId === 'phantom') walletAdapter = window?.phantom?.solana
          else if (savedId === 'solflare') walletAdapter = window?.solflare
          else if (savedId === 'backpack') walletAdapter = window?.backpack
          else walletAdapter = window?.solana

          if (walletAdapter) {
            setSubmitStep('Sign the transaction in your wallet...')
            const { signature } = await registerDatasetOnChain(
              walletAdapter,
              publicKey,
              { 
                datasetId: data.datasetId, 
                name: form.name, 
                fileHash,
                description: form.description,
                ipfsCid: form.ipfsCid,
                metadataUri: form.metadataUri
              }
            )
            txSig = signature
            setTxSignature(signature)
            setSubmitStep('Transaction confirmed!')
          }
        } catch (walletErr) {
          // User rejected or network error — still saved off-chain
          if (walletErr.message?.includes('rejected') || walletErr.code === 4001) {
            addToast('Transaction rejected by wallet', 'error')
          } else {
            addToast(`On-chain signing failed: ${walletErr.message}`, 'error')
          }
          // Still navigate — off-chain record was saved
          navigate(`/dataset/${data.datasetId}`)
          return
        }
      }

      // Verification workflow complete
      if (txSig) {
        addToast('Dataset signed & recorded on Solana Devnet! 🎉')
      } else {
        addToast('Dataset registered in demo mode (connect wallet for on-chain signing)')
        navigate(`/dataset/${data.datasetId}`)
      }
    } catch (err) {
      addToast('Error: ' + err.message, 'error')
    } finally {
      if (!txSig) setSubmitting(false)
      setSubmitStep('')
    }
  }

  return (
    <div className="page-container">
      <motion.div
        className="page-header"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="page-title">
          Register <span className="gradient-text">Dataset</span>
        </h1>
        <p className="page-subtitle">
          Record your dataset's SHA-256 hash immutably on the Solana blockchain.
        </p>
      </motion.div>

      <motion.div
        className="register-form"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5 }}
      >
        <form onSubmit={handleSubmit} className="glass-card form-card">
          {/* File Upload */}
          <div className="input-group" style={{ marginBottom: 'var(--space-xl)' }}>
            <label>Dataset File</label>
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
              <div className="drop-icon">📁</div>
              <p>
                {fileName
                  ? `Selected: ${fileName}`
                  : 'Drag & drop your dataset file, or click to browse'
                }
              </p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                File is hashed locally — it never leaves your machine
              </p>
            </div>
            {fileHash && (
              <motion.div
                className="hash-display"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
              >
                <strong>SHA-256:</strong> {fileHash}
              </motion.div>
            )}
          </div>

          {/* Name & IPFS CID */}
          <div className="form-row" style={{ marginBottom: 'var(--space-xl)' }}>
            <div className="input-group">
              <label>Dataset Name *</label>
              <input
                className="input-field"
                name="name"
                placeholder="e.g., Genome Variant Analysis 2024"
                value={form.name}
                onChange={handleChange}
                required
              />
            </div>
            <div className="input-group">
              <label>IPFS CID (Optional)</label>
              <input
                className="input-field"
                name="ipfsCid"
                placeholder="Qm..."
                value={form.ipfsCid}
                onChange={handleChange}
              />
            </div>
          </div>

          {/* Description */}
          <div className="input-group" style={{ marginBottom: 'var(--space-xl)' }}>
            <label>Description</label>
            <textarea
              className="input-field"
              name="description"
              placeholder="Describe your dataset, methodology, and key characteristics..."
              value={form.description}
              onChange={handleChange}
              rows={4}
            />
          </div>

          {/* Metadata URI */}
          <div className="input-group" style={{ marginBottom: 'var(--space-xl)' }}>
            <label>Metadata URI (Optional)</label>
            <input
              className="input-field"
              name="metadataUri"
              placeholder="https://research.example.com/dataset/..."
              value={form.metadataUri}
              onChange={handleChange}
            />
          </div>

          {/* Wallet Status */}
          <div style={{
            padding: '12px 16px',
            background: connected ? 'rgba(0,229,160,0.05)' : 'rgba(255,107,53,0.05)',
            border: `1px solid ${connected ? 'rgba(0,229,160,0.2)' : 'rgba(255,107,53,0.2)'}`,
            borderRadius: 'var(--radius-md)',
            fontSize: '0.85rem',
            color: connected ? 'var(--accent-green)' : '#ff9966',
            marginBottom: 'var(--space-xl)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            {connected
              ? `✅ Wallet: ${publicKey?.slice(0,8)}...${publicKey?.slice(-4)}`
              : '⚠️ No wallet connected — transaction will use demo mode'
            }
            {!connected && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--accent-cyan)' }}
                onClick={() => setModalOpen(true)}
              >
                Connect Wallet →
              </button>
            )}
          </div>

          {/* Submit */}
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => navigate('/dashboard')} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting || !fileHash}>
              {submitting ? (
                <>
                  <div className="spinner" style={{ width: 18, height: 18 }}></div>
                  {submitStep || 'Processing...'}
                </>
              ) : (
                <>
                  {connected ? 'Sign & Register on Solana' : 'Register Dataset'}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </>
              )}
            </button>
          </div>

          {/* Transaction Success Banner */}
          <AnimatePresence>
            {txSignature && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  marginTop: 'var(--space-xl)',
                  padding: '16px 20px',
                  background: 'rgba(0,229,160,0.07)',
                  border: '1px solid rgba(0,229,160,0.25)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <span style={{ fontSize: '1.3rem' }}>✅</span>
                  <strong style={{ color: 'var(--accent-green)' }}>Transaction confirmed on Solana Devnet!</strong>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', wordBreak: 'break-all', marginBottom: '12px' }}>
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
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
                      <polyline points="15,3 21,3 21,9"/>
                      <line x1="10" y1="14" x2="21" y2="3"/>
                    </svg>
                  </a>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => navigate(`/dataset/${registeredId}`)}
                  >
                    View Dataset →
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </form>
      </motion.div>
    </div>
  )
}
