import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.15, duration: 0.6, ease: [0.22, 1, 0.36, 1] }
  })
}

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.15 } }
}

function AnimatedCounter({ target, suffix = '' }) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    let start = 0
    const duration = 2000
    const step = target / (duration / 16)
    const timer = setInterval(() => {
      start += step
      if (start >= target) { setCount(target); clearInterval(timer) }
      else setCount(Math.floor(start))
    }, 16)
    return () => clearInterval(timer)
  }, [target])
  return <>{count.toLocaleString()}{suffix}</>
}

export default function Home() {
  return (
    <>
      {/* ─── Hero ─────────────────────────────────────── */}
      <section className="hero">
        <motion.div
          className="hero-content"
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
        >
          <motion.div className="hero-badge" variants={fadeUp} custom={0}>
            <span className="pulse-dot"></span>
            Powered by Solana Blockchain
          </motion.div>

          <motion.h1 variants={fadeUp} custom={1}>
            Immutable Research<br />
            <span className="gradient-text">Data Provenance</span>
          </motion.h1>

          <motion.p variants={fadeUp} custom={2}>
            Track, verify, and authenticate scientific research datasets with
            blockchain-backed transparency. Every dataset hash, every version,
            every modification — permanently recorded on Solana.
          </motion.p>

          <motion.div className="hero-actions" variants={fadeUp} custom={3}>
            <Link to="/register" className="btn btn-primary btn-lg">
              Register Dataset
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </Link>
            <Link to="/verify" className="btn btn-secondary btn-lg">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 12l2 2 4-4"/>
                <circle cx="12" cy="12" r="10"/>
              </svg>
              Verify Hash
            </Link>
          </motion.div>

          <motion.div className="hero-stats" variants={fadeUp} custom={4}>
            <div className="hero-stat">
              <div className="hero-stat-value"><AnimatedCounter target={1284} /></div>
              <div className="hero-stat-label">Datasets Tracked</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-value"><AnimatedCounter target={3847} /></div>
              <div className="hero-stat-label">Versions Recorded</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-value"><AnimatedCounter target={567} /></div>
              <div className="hero-stat-label">Researchers</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-value"><AnimatedCounter target={99} suffix="%" /></div>
              <div className="hero-stat-label">Uptime</div>
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* ─── Features ─────────────────────────────────── */}
      <section className="features-section">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-50px' }}
          variants={staggerContainer}
        >
          <motion.h2 className="section-title" variants={fadeUp}>
            Why <span className="gradient-text">DataProve</span>?
          </motion.h2>
          <motion.p className="section-subtitle" variants={fadeUp}>
            Built for researchers who demand data integrity, transparency, and reproducibility.
          </motion.p>

          <div className="features-grid">
            <motion.div className="glass-card feature-card" variants={fadeUp} custom={0}>
              <div className="feature-icon">🔗</div>
              <h3>Immutable Records</h3>
              <p>Every dataset registration creates a permanent, tamper-proof record on Solana. SHA-256 hashes ensure data integrity that cannot be altered or deleted.</p>
            </motion.div>

            <motion.div className="glass-card feature-card" variants={fadeUp} custom={1}>
              <div className="feature-icon">📊</div>
              <h3>Version Tracking</h3>
              <p>Full version history with linked hash chains. Every modification creates a new version record, building a complete provenance trail from origin to current state.</p>
            </motion.div>

            <motion.div className="glass-card feature-card" variants={fadeUp} custom={2}>
              <div className="feature-icon">✅</div>
              <h3>Instant Verification</h3>
              <p>Any researcher can verify dataset authenticity by comparing SHA-256 hashes on-chain. No trust required — cryptographic proof guarantees data hasn't been tampered with.</p>
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* ─── How It Works ─────────────────────────────── */}
      <section className="hiw-section">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-50px' }}
          variants={staggerContainer}
        >
          <motion.h2 className="section-title" variants={fadeUp}>
            How It Works
          </motion.h2>
          <motion.p className="section-subtitle" variants={fadeUp}>
            Four simple steps to ensure your research data's integrity forever.
          </motion.p>

          <div className="hiw-steps">
            <motion.div className="glass-card hiw-step" variants={fadeUp} custom={0}>
              <div className="hiw-step-number">1</div>
              <div>
                <h4>Upload & Hash</h4>
                <p>Upload your dataset file. We compute its SHA-256 hash locally — your data never leaves your machine. Only the hash goes on-chain.</p>
              </div>
            </motion.div>

            <motion.div className="glass-card hiw-step" variants={fadeUp} custom={1}>
              <div className="hiw-step-number">2</div>
              <div>
                <h4>Register On-Chain</h4>
                <p>The dataset hash, your researcher identity (wallet), metadata, and IPFS CID are recorded as a Solana on-chain account via our Anchor program.</p>
              </div>
            </motion.div>

            <motion.div className="glass-card hiw-step" variants={fadeUp} custom={2}>
              <div className="hiw-step-number">3</div>
              <div>
                <h4>Track Versions</h4>
                <p>When you modify the dataset, update the record. A new version is created with the previous hash linked, building an immutable modification chain.</p>
              </div>
            </motion.div>

            <motion.div className="glass-card hiw-step" variants={fadeUp} custom={3}>
              <div className="hiw-step-number">4</div>
              <div>
                <h4>Verify Anytime</h4>
                <p>Anyone can paste a hash and instantly verify if it matches a registered dataset. The blockchain proves authenticity without trusting any central authority.</p>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* ─── CTA ──────────────────────────────────────── */}
      <motion.section
        style={{ position: 'relative', zIndex: 1, padding: '80px 32px', textAlign: 'center' }}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        variants={staggerContainer}
      >
        <motion.h2 className="section-title" variants={fadeUp}>
          Ready to Prove Your Data?
        </motion.h2>
        <motion.p className="section-subtitle" variants={fadeUp}>
          Join hundreds of researchers securing their datasets on Solana.
        </motion.p>
        <motion.div variants={fadeUp} style={{ marginTop: '32px' }}>
          <Link to="/register" className="btn btn-primary btn-lg">
            Get Started Free
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </Link>
        </motion.div>
      </motion.section>
    </>
  )
}
