import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'

function formatDate(ts) {
  return new Date(ts * 1000).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric'
  })
}

export default function Verify({ addToast }) {
  const [hash, setHash] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  const handleVerify = async () => {
    if (!hash || hash.length !== 64) {
      addToast('Please enter a valid 64-character SHA-256 hash', 'error')
      return
    }

    setLoading(true)
    setSearched(false)
    try {
      const res = await fetch(`/api/datasets/verify/${hash}`)
      const data = await res.json()
      setResult(data)
      setSearched(true)
      if (data.found) {
        addToast('Hash verified successfully! ✅')
      } else {
        addToast('Hash not found on-chain', 'error')
      }
    } catch {
      addToast('Verification failed', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleFileHash = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const buffer = await file.arrayBuffer()
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const h = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    setHash(h)
    addToast(`Hash computed from ${file.name}`)
  }

  // Demo hashes for quick testing — these are real SHA-256 values in the database
  const demoHashes = [
    { label: 'Genomics Dataset (v3 — current)', hash: '9a03d9a8541f506e746dceb2c645785581d8e9d1cbc38061d6357cf626698c32' },
    { label: 'Genomics Dataset (v1 — historical)', hash: '045894df0a46ebac58f3bb5a10f28bc469968ddb08054b31b1917acb6cbc0be0' },
    { label: 'Climate Model (v2 — current)', hash: '5c632ae82555b705d9771f573d54644436337ac63aaf435782a2b64c20f9ea20' },
  ]

  return (
    <div className="page-container">
      <motion.div
        className="page-header"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="page-title">
          Verify <span className="gradient-text">Dataset Hash</span>
        </h1>
        <p className="page-subtitle">
          Paste a SHA-256 hash to verify if it matches any dataset registered on the Solana blockchain.
        </p>
      </motion.div>

      <motion.div
        className="verifier-container"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="glass-card verifier-box">
          {/* Hash Input */}
          <div className="verifier-input-row">
            <input
              className="input-field"
              placeholder="Enter SHA-256 hash (64 hex characters)..."
              value={hash}
              onChange={e => setHash(e.target.value.toLowerCase())}
              maxLength={64}
            />
            <button
              className="btn btn-primary"
              onClick={handleVerify}
              disabled={loading || hash.length !== 64}
            >
              {loading ? (
                <div className="spinner" style={{ width: 18, height: 18 }}></div>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"/>
                    <path d="M21 21l-4.35-4.35"/>
                  </svg>
                  Verify
                </>
              )}
            </button>
          </div>

          {/* File hash option */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: 'var(--space-xl)' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>or</span>
            <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
              <input type="file" style={{ display: 'none' }} onChange={handleFileHash} />
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="17,8 12,3 7,8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              Hash a file
            </label>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              {hash.length}/64 characters
            </span>
          </div>

          {/* Demo Hashes */}
          <div style={{ marginBottom: 'var(--space-xl)' }}>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
              Quick test with demo hashes:
            </p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {demoHashes.map(dh => (
                <button
                  key={dh.hash}
                  className="btn btn-ghost btn-sm"
                  onClick={() => setHash(dh.hash)}
                  style={{ fontSize: '0.75rem' }}
                >
                  {dh.label}
                </button>
              ))}
            </div>
          </div>

          {/* Results */}
          <AnimatePresence>
            {searched && result && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                {result.found ? (
                  <div className="verify-result success">
                    <div className="verify-result-header">
                      <div className="verify-icon success-icon">✅</div>
                      <div>
                        <h3 style={{ color: 'var(--accent-green)' }}>Hash Verified!</h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                          This hash matches {result.isCurrent ? 'the current version' : `version ${result.versionNumber}`} of a registered dataset.
                        </p>
                      </div>
                    </div>
                    <div style={{ marginTop: '16px' }}>
                      <div className="verify-detail">
                        <strong>Dataset:</strong>
                        <Link to={`/dataset/${result.dataset.datasetId}`}>
                          {result.dataset.name}
                        </Link>
                      </div>
                      <div className="verify-detail">
                        <strong>Version:</strong>
                        <span>v{result.versionNumber} {result.isCurrent ? '(current)' : '(historical)'}</span>
                      </div>
                      <div className="verify-detail">
                        <strong>Researcher:</strong>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                          {result.dataset.authority}
                        </span>
                      </div>
                      <div className="verify-detail">
                        <strong>Registered:</strong>
                        <span>{formatDate(result.dataset.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="verify-result not-found">
                    <div className="verify-result-header">
                      <div className="verify-icon fail-icon">❌</div>
                      <div>
                        <h3 style={{ color: 'var(--accent-orange)' }}>Hash Not Found</h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                          This hash does not match any registered dataset on-chain. The data may have been tampered with or was never registered.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  )
}
