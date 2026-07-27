import { useEffect, useRef } from 'react'
import { useWallet } from '../context/WalletContext'
import { motion, AnimatePresence } from 'framer-motion'
import './WalletModal.css'
import { Icon } from './icons'
import { SOLANA_CLUSTER } from '../config'

export default function WalletModal() {
  const { modalOpen, setModalOpen, detectedWallets, SUPPORTED_WALLETS, connect } = useWallet()
  const panelRef = useRef(null)
  const openerRef = useRef(null)

  /**
   * Escape closes, focus moves in on open and returns to whatever opened it on
   * close, and Tab is trapped inside the panel. A dialog that leaves focus
   * behind it strands keyboard and screen-reader users on a page they cannot
   * see, which is worse than the dialog not opening at all.
   */
  useEffect(() => {
    if (!modalOpen) return

    openerRef.current = document.activeElement
    const panel = panelRef.current
    panel?.focus()

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setModalOpen(false)
        return
      }
      if (e.key !== 'Tab' || !panel) return

      const focusable = panel.querySelectorAll(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
      openerRef.current?.focus?.()
    }
  }, [modalOpen, setModalOpen])

  const handleConnect = async (walletId) => {
    try {
      await connect(walletId)
    } catch (err) {
      // Error already logged in context
    }
  }

  const handleInstall = (url) => {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  if (!modalOpen) return null

  // Separate detected vs not-detected
  const available = detectedWallets
  const notInstalled = SUPPORTED_WALLETS.filter(
    w => w.installUrl && !detectedWallets.find(d => d.id === w.id)
  )

  /*
   * The panel is nested inside the backdrop so the backdrop's place-items:center
   * actually centres it. They used to be siblings, and the panel had no position
   * of its own, so it sat in normal flow and was then translated -50%/-50% --
   * straight off the top-left of the viewport. That was the "connect wallet
   * doesn't work" bug: the dialog opened every time, just mostly off-screen.
   */
  return (
    <AnimatePresence>
      {modalOpen && (
        <motion.div
          className="wallet-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setModalOpen(false)}
        >
          <motion.div
            className="wallet-modal"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="wallet-modal-title"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.3, 1] }}
          >
            {/* Header */}
            <div className="wallet-modal-header">
              <div>
                <h2 className="wallet-modal-title" id="wallet-modal-title">Connect Wallet</h2>
                <p className="wallet-modal-subtitle">
                  Connect your Solana wallet to register and manage research datasets.
                </p>
              </div>
              <button className="wallet-modal-close" onClick={() => setModalOpen(false)} aria-label="Close">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            {/* Detected / Available wallets */}
            {available.length > 0 && (
              <div className="wallet-modal-section">
                <div className="wallet-modal-section-label">Detected Wallets</div>
                <div className="wallet-list">
                  {available.map(w => (
                    <motion.button
                      key={w.id}
                      className="wallet-item wallet-item-available"
                      onClick={() => handleConnect(w.id)}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className="wallet-item-icon">
                        {w.icon
                          ? <img src={w.icon} alt={w.name} onError={e => e.target.style.display='none'} />
                          : <Icon name="wallet" />}
                      </div>
                      <div className="wallet-item-info">
                        <div className="wallet-item-name">{w.name}</div>
                        <div className="wallet-item-status">Ready to connect</div>
                      </div>
                      <div className="wallet-item-arrow">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M5 12h14M12 5l7 7-7 7"/>
                        </svg>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>
            )}

            {/* No wallets detected */}
            {available.length === 0 && (
              <div className="wallet-modal-no-wallets">
                <Icon name="search" size={28} className="wallet-modal-no-icon" />
                <p>No Solana wallet detected in your browser.</p>
                <p className="wallet-modal-no-sub">Install one of the wallets below to get started.</p>
              </div>
            )}

            {/* Install prompts */}
            {notInstalled.length > 0 && (
              <div className="wallet-modal-section">
                <div className="wallet-modal-section-label">
                  {available.length > 0 ? 'Other Wallets' : 'Install a Wallet'}
                </div>
                <div className="wallet-list">
                  {notInstalled.map(w => (
                    <motion.button
                      key={w.id}
                      className="wallet-item wallet-item-install"
                      onClick={() => handleInstall(w.installUrl)}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className="wallet-item-icon wallet-item-icon-dim">
                        {w.icon
                          ? <img src={w.icon} alt={w.name} onError={e => e.target.style.display='none'} />
                          : <Icon name="wallet" />}
                      </div>
                      <div className="wallet-item-info">
                        <div className="wallet-item-name">{w.name}</div>
                        <div className="wallet-item-status wallet-item-install-label">
                          Not installed — Click to install
                        </div>
                      </div>
                      <div className="wallet-item-arrow" style={{ opacity: 0.4 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
                          <polyline points="15,3 21,3 21,9"/>
                          <line x1="10" y1="14" x2="21" y2="3"/>
                        </svg>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>
            )}

            {/* Footer note */}
            <div className="wallet-modal-footer">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {`Connecting on Solana ${SOLANA_CLUSTER}. Your funds are safe.`}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
