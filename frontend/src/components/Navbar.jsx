import { Link, useLocation } from 'react-router-dom'
import { useWallet } from '../context/WalletContext'
import ThemeToggle from './ThemeToggle'
import './Navbar.css'

export default function Navbar({ addToast }) {
  const location = useLocation()
  const { connected, publicKey, walletName, setModalOpen, disconnect } = useWallet()

  const isActive = (path) => location.pathname === path ? 'active' : ''

  const handleDisconnect = async () => {
    await disconnect()
    addToast('Wallet disconnected', 'error')
  }

  return (
    <nav className="navbar">
      <Link to="/" className="navbar-brand">
        {/* A seal: outer bezel, inner witness mark. currentColor throughout, so it
            inverts with the theme instead of carrying its own two-stop gradient. */}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2.75" y="2.75" width="18.5" height="18.5" rx="3" />
          <path d="M7.5 12.25 10.5 15.25 16.5 8.75" />
        </svg>
        <span>DataProve</span>
      </Link>

      <ul className="navbar-links">
        <li><Link to="/" className={isActive('/')}>Home</Link></li>
        <li><Link to="/dashboard" className={isActive('/dashboard')}>Dashboard</Link></li>
        <li><Link to="/register" className={isActive('/register')}>Register</Link></li>
        <li><Link to="/verify" className={isActive('/verify')}>Verify</Link></li>
      </ul>

      <ThemeToggle />

      {connected && publicKey ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div className="wallet-btn is-connected">
            <span className="wallet-dot"></span>
            <span style={{ fontSize: '0.75rem', color: 'var(--fg-subtle)' }}>{walletName}</span>
            <span>{publicKey.slice(0, 4)}...{publicKey.slice(-4)}</span>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleDisconnect}
            aria-label="Disconnect wallet"
            title="Disconnect wallet"
            style={{ padding: '8px', borderRadius: '50%' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
              <polyline points="16,17 21,12 16,7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      ) : (
        <button className="wallet-btn" onClick={() => setModalOpen(true)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="2" y="6" width="20" height="14" rx="2"/>
            <path d="M2 10h20"/>
            <circle cx="18" cy="16" r="1"/>
          </svg>
          Connect Wallet
        </button>
      )}
    </nav>
  )
}
