import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js'

/**
 * Supported wallets — these are detected from window object
 * No WalletConnect required; uses browser-injected adapters directly
 */
const SUPPORTED_WALLETS = [
  {
    id: 'phantom',
    name: 'Phantom',
    icon: 'https://phantom.app/img/phantom-logo.png',
    detectFn: () => window?.phantom?.solana?.isPhantom === true,
    getAdapter: () => window.phantom.solana,
    installUrl: 'https://phantom.app/',
  },
  {
    id: 'solflare',
    name: 'Solflare',
    icon: 'https://solflare.com/assets/logo.svg',
    detectFn: () => !!window?.solflare?.isSolflare,
    getAdapter: () => window.solflare,
    installUrl: 'https://solflare.com/',
  },
  {
    id: 'backpack',
    name: 'Backpack',
    icon: 'https://backpack.app/favicon.ico',
    detectFn: () => !!window?.backpack?.isBackpack,
    getAdapter: () => window.backpack,
    installUrl: 'https://backpack.app/',
  },
  {
    id: 'solana_generic',
    name: 'Solana Wallet',
    icon: null,
    detectFn: () => !!window?.solana && !window?.phantom?.solana && !window?.solflare,
    getAdapter: () => window.solana,
    installUrl: null,
  },
]

const WalletContext = createContext(null)

export function WalletProvider({ children }) {
  const [connected, setConnected] = useState(false)
  const [publicKey, setPublicKey] = useState(null)
  const [walletName, setWalletName] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [detectedWallets, setDetectedWallets] = useState([])
  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed')

  // Detect installed wallets on mount (wait a tick for injected scripts)
  useEffect(() => {
    const detect = () => {
      const found = SUPPORTED_WALLETS.filter(w => {
        try { return w.detectFn() } catch { return false }
      })
      setDetectedWallets(found)
    }
    // Wallets inject after DOMContentLoaded, give them 500ms
    const timer = setTimeout(detect, 500)
    return () => clearTimeout(timer)
  }, [])

  // Auto reconnect if wallet is already connected (e.g. trusted app)
  useEffect(() => {
    const savedWalletId = localStorage.getItem('dataprove_wallet')
    if (!savedWalletId) return
    const w = SUPPORTED_WALLETS.find(w => w.id === savedWalletId)
    if (!w) return
    try {
      if (w.detectFn()) {
        const adapter = w.getAdapter()
        // Eagerly connect (only works if previously trusted)
        adapter.connect({ onlyIfTrusted: true }).then(() => {
          setPublicKey(adapter.publicKey.toBase58())
          setWalletName(w.name)
          setConnected(true)
        }).catch(() => { /* not trusted yet, ignore */ })
      }
    } catch {}
  }, [])

  const connect = useCallback(async (walletId) => {
    const w = SUPPORTED_WALLETS.find(w => w.id === walletId)
    if (!w) return

    try {
      const adapter = w.getAdapter()
      const response = await adapter.connect()
      const pk = response?.publicKey || adapter.publicKey
      setPublicKey(pk.toBase58())
      setWalletName(w.name)
      setConnected(true)
      setModalOpen(false)
      localStorage.setItem('dataprove_wallet', walletId)

      // Listen for disconnect
      adapter.on?.('disconnect', () => {
        setConnected(false)
        setPublicKey(null)
        setWalletName(null)
        localStorage.removeItem('dataprove_wallet')
      })
    } catch (err) {
      console.error('Wallet connect error:', err)
      throw err
    }
  }, [])

  const disconnect = useCallback(async () => {
    const savedId = localStorage.getItem('dataprove_wallet')
    const w = SUPPORTED_WALLETS.find(w => w.id === savedId)
    try { await w?.getAdapter()?.disconnect() } catch {}
    setConnected(false)
    setPublicKey(null)
    setWalletName(null)
    localStorage.removeItem('dataprove_wallet')
  }, [])

  return (
    <WalletContext.Provider value={{
      connected, publicKey, walletName,
      modalOpen, setModalOpen,
      detectedWallets, SUPPORTED_WALLETS,
      connect, disconnect, connection,
    }}>
      {children}
    </WalletContext.Provider>
  )
}

export function useWallet() {
  return useContext(WalletContext)
}
