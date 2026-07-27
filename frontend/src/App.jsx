import { Routes, Route } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { MotionConfig } from 'framer-motion'
import { flushQueue } from './services/pendingSync'
import { WalletProvider } from './context/WalletContext'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Toast from './components/Toast'
import WalletModal from './components/WalletModal'
import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import Register from './pages/Register'
import DatasetDetail from './pages/DatasetDetail'
import Verify from './pages/Verify'

function AppShell() {
  const [toasts, setToasts] = useState([])

  const addToast = (message, type = 'success') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 4000)
  }

  // Anything confirmed on-chain whose backend sync failed is parked in localStorage
  // and replayed here. The signature is the idempotency key, so a replay cannot
  // duplicate a dataset. Silent on success — the user was already told it was
  // recorded, because it was.
  useEffect(() => {
    flushQueue().then(({ synced }) => {
      if (synced > 0) {
        addToast(synced === 1
          ? 'A pending record finished syncing.'
          : `${synced} pending records finished syncing.`)
      }
    })
  }, [])

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <Navbar addToast={addToast} />
      <WalletModal />
      <main id="main" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/dashboard" element={<Dashboard addToast={addToast} />} />
          <Route path="/register" element={<Register addToast={addToast} />} />
          <Route path="/dataset/:id" element={<DatasetDetail addToast={addToast} />} />
          <Route path="/verify" element={<Verify addToast={addToast} />} />
        </Routes>
      </main>
      <Footer />
      <Toast toasts={toasts} />
    </>
  )
}

function App() {
  return (
    // `reducedMotion="user"` covers every framer-motion animation, transition
    // and whileInView reveal in the app -- the CSS `prefers-reduced-motion`
    // guard in reset.css only zeroes CSS animation/transition durations, and
    // has no reach into framer-motion's JS-driven `animate` calls.
    <MotionConfig reducedMotion="user">
      <WalletProvider>
        <AppShell />
      </WalletProvider>
    </MotionConfig>
  )
}

export default App
