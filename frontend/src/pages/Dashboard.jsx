import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import './Dashboard.css'
import { Icon } from '../components/icons'
import HashCell from '../components/HashCell'

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

/**
 * A JS-truncated string on a plain `display: block` element, not
 * `-webkit-line-clamp` (which requires `display: -webkit-box`). That legacy
 * box model is the one thing that reproducibly breaks this element's cursor
 * (confirmed: an isolated test page with the same link-wrapped-text shape but
 * without `-webkit-box` rendered correctly; only the line-clamped description
 * painted an I-beam despite `cursor: pointer` correctly resolving). Trades
 * exact two-line-box precision for a display mode that doesn't have that
 * failure mode. 78 was bisected against the actual rendered line count (not
 * estimated from single-line character width, which undercounts how much
 * less a word-wrapped second line holds) at the grid's narrowest column
 * (320px); wider columns just leave a little more headroom rather than risk
 * a third line, since that's what broke row alignment at the first attempt.
 */
function truncateDesc(text, max = 78) {
  if (!text || text.length <= max) return text
  return `${text.slice(0, max).trimEnd()}…`
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
          Dashboard
        </h1>
        <p className="page-subtitle">
          Browse and monitor all registered research datasets on the Solana blockchain.
        </p>
      </motion.div>

      {/* Main content sits on an opaque surface so the canvas's drafting-grid
          texture stops showing through dense text (stat figures, hash cells,
          card meta) -- the one deliberate use of .panel on this page, not a
          reflex; the page header above stays on canvas like every other
          page's does. */}
      <div className="panel panel-padded">
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
          <Icon name="search" size={18} className="search-icon" />
          <label className="sr-only" htmlFor="dataset-search">Search datasets</label>
          <input
            id="dataset-search"
            className="input-field"
            type="search"
            placeholder="Search datasets..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Loading / grid / empty are mutually exclusive views of the same
            data, not independent sections -- AnimatePresence crossfades
            between them so switching feels like one continuous state change
            instead of one tree vanishing and another snapping in. */}
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="loading"
              className="loading-container"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="spinner"></div>
              <span style={{ color: 'var(--fg-muted)' }}>Loading datasets from Solana...</span>
            </motion.div>
          ) : filtered.length > 0 ? (
            <motion.div
              key="grid"
              className="dashboard-grid"
              initial="hidden"
              animate="visible"
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
            >
              {filtered.map((ds, i) => (
                <motion.div key={ds.datasetId} variants={fadeUp} custom={i}>
                  {/* The whole card is the clickable region, but the hash cell's
                      copy button is a real <button> -- nesting a button inside
                      an <a> is invalid HTML and behaves unpredictably across
                      browsers/screen readers (flagged by CodeRabbit). Standard
                      fix: the card itself is the container, the title's <Link>
                      is stretched over the full card via ::after (see
                      .dataset-card-title-link in Dashboard.css), and the copy
                      button sits as a sibling with its own stacking context so
                      it stays independently clickable on top of the overlay. */}
                  <div className="glass-card dataset-card">
                    <div className="dataset-card-header">
                      <Link
                        to={`/dataset/${ds.datasetId}`}
                        className="dataset-card-title dataset-card-title-link"
                      >
                        {ds.name}
                      </Link>
                      <span className="dataset-card-badge badge-active">Active</span>
                    </div>
                    <div className="dataset-card-desc">{truncateDesc(ds.description)}</div>
                    <div className="dataset-card-meta">
                      <div className="dataset-meta-item">
                        <Icon name="clock" size={14} />
                        {formatDate(ds.createdAt)}
                      </div>
                      <span className="dataset-card-badge badge-version">
                        v{ds.versionCount}
                      </span>
                    </div>
                    <div className="dataset-card-hash">
                      <HashCell value={ds.currentHash} copyable announce={addToast} />
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              className="empty-state"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Icon name="file" size={28} className="empty-state-icon" />
              <h3>No Datasets Found</h3>
              <p>
                {search ? `No results for "${search}".` : 'Register your first dataset to get started.'}
              </p>
              <Link to="/register" className="btn btn-primary">Register Dataset</Link>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
