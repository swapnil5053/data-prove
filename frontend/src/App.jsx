import { Routes, Route } from 'react-router-dom'
import { useState } from 'react'
import { WalletProvider } from './context/WalletContext'
import Navbar from './components/Navbar'
import AuroraBackground from './components/AuroraBackground'
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

  return (
    <>
      <AuroraBackground />
      <Navbar addToast={addToast} />
      <WalletModal />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/dashboard" element={<Dashboard addToast={addToast} />} />
        <Route path="/register" element={<Register addToast={addToast} />} />
        <Route path="/dataset/:id" element={<DatasetDetail addToast={addToast} />} />
        <Route path="/verify" element={<Verify addToast={addToast} />} />
      </Routes>
      <Footer />
      <Toast toasts={toasts} />
    </>
  )
}

function App() {
  return (
    <WalletProvider>
      <AppShell />
    </WalletProvider>
  )
}

export default App
