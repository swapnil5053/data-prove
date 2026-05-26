import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'

const API = '/api/datasets'

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }
  })
}

function formatDate(ts) {
  return new Date(ts * 1000).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric'
  })
}

export default function Dashboard({ addToast }) {
  const [datasets, setDatasets] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    Promise.all([
      fetch(API).then(r => r.json()),
      fetch(`${API}/stats`).then(r => r.json()),
    ]).then(([dsRes, statsRes]) => {
      setDatasets(dsRes.data || [])
      setStats(statsRes.data || null)
    }).catch(() => {
      addToast('Failed to load datasets', 'error')
    }).finally(() => setLoading(false))
  }, [])

  const filtered = datasets.filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    d.description.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="page-container">
      <motion.div
        className="page-header"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="page-title">
          <span className="gradient-text">Dashboard</span>
        </h1>
        <p className="page-subtitle">
          Browse and monitor all registered research datasets on the Solana blockchain.
        </p>
      </motion.div>

      {/* Stats Bar */}
      {stats && (
        <motion.div
          className="stats-bar"
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
        >
          {[
            { value: stats.totalDatasets, label: 'Datasets' },
            { value: stats.totalVersions, label: 'Versions' },
            { value: stats.totalResearchers, label: 'Researchers' },
            { value: stats.totalVerifications, label: 'Verifications' },
          ].map((s, i) => (
            <motion.div key={i} className="glass-card stat-item" variants={fadeUp} custom={i}>
              <div className="stat-value">{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Search */}
      <div className="search-bar">
        <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/>
          <path d="M21 21l-4.35-4.35"/>
        </svg>
        <input
          className="input-field"
          type="text"
          placeholder="Search datasets..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Loading */}
      {loading && (
        <div className="loading-container">
          <div className="spinner"></div>
          <span style={{ color: 'var(--text-secondary)' }}>Loading datasets from Solana...</span>
        </div>
      )}

      {/* Dataset Grid */}
      {!loading && filtered.length > 0 && (
        <motion.div
          className="dashboard-grid"
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
        >
          {filtered.map((ds, i) => (
            <motion.div key={ds.datasetId} variants={fadeUp} custom={i}>
              <Link to={`/dataset/${ds.datasetId}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="glass-card dataset-card">
                  <div className="dataset-card-header">
                    <div className="dataset-card-title">{ds.name}</div>
                    <span className="dataset-card-badge badge-active">Active</span>
                  </div>
                  <div className="dataset-card-desc">{ds.description}</div>
                  <div className="dataset-card-meta">
                    <div className="dataset-meta-item">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 8v4l3 3"/>
                        <circle cx="12" cy="12" r="10"/>
                      </svg>
                      {formatDate(ds.createdAt)}
                    </div>
                    <div className="dataset-meta-item">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/>
                        <polyline points="16,6 12,2 8,6"/>
                        <line x1="12" y1="2" x2="12" y2="15"/>
                      </svg>
                      v{ds.versionCount}
                    </div>
                    <div className="dataset-meta-item">
                      <span className="dataset-card-badge badge-version">
                        v{ds.versionCount}
                      </span>
                    </div>
                  </div>
                  <div className="dataset-card-hash" title={ds.currentHash}>
                    🔒 {ds.currentHash}
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Empty State */}
      {!loading && filtered.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">📭</div>
          <h3>No Datasets Found</h3>
          <p>
            {search ? `No results for "${search}".` : 'Register your first dataset to get started.'}
          </p>
          <Link to="/register" className="btn btn-primary">Register Dataset</Link>
        </div>
      )}
    </div>
  )
}
