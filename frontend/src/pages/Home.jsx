import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import './Home.css'
import { Icon } from '../components/icons'
import SplineHero from '../components/SplineHero'
import HashRibbon from '../components/HashRibbon'
import { API_BASE_URL } from '../config'

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.08, duration: 0.4, ease: [0.2, 0.8, 0.3, 1] }
  })
}

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } }
}

/**
 * The specimen is a real registration, not a placeholder. `undefined` while the
 * request is in flight, `null` once it's resolved and found nothing verified.
 * Filtered to `verificationStatus === 'verified'` on purpose: `demo` and
 * `pending` rows exist in Mongo (see docs/audit-baseline.md §6) and showing one
 * of those as the front page's proof-of-concept would be the exact overclaim
 * PRODUCT.md's fourth design principle rules out. An empty result says so
 * plainly instead of inventing a number to fill the space.
 */
function useLatestVerifiedSpecimen() {
  const [specimen, setSpecimen] = useState(undefined)

  useEffect(() => {
    let cancelled = false
    fetch(`${API_BASE_URL}/api/datasets`)
      .then(r => r.json())
      .then(res => {
        if (cancelled) return
        const verified = (res.data || []).find(d => d.verificationStatus === 'verified')
        setSpecimen(verified || null)
      })
      .catch(() => { if (!cancelled) setSpecimen(null) })
    return () => { cancelled = true }
  }, [])

  return specimen
}

export default function Home() {
  const specimen = useLatestVerifiedSpecimen()

  return (
    <div className="page-container">
      {/* ─── Hero ───────────────────────────────────────────────────────── */}
      <section className="hero">
        <motion.div
          className="hero-content"
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
        >
          <motion.div className="masthead-rule" variants={fadeUp} custom={0}>
            <span className="section-index">REGISTRY</span>
            <span className="masthead-issuer">Powered by Solana</span>
          </motion.div>

          <motion.h1 variants={fadeUp} custom={1}>
            Immutable Research Data Provenance
          </motion.h1>

          <motion.p variants={fadeUp} custom={2}>
            Track, verify, and authenticate scientific research datasets with
            blockchain-backed transparency. Every dataset hash, every version,
            every modification — permanently recorded on Solana.
          </motion.p>

          <motion.div className="hero-actions" variants={fadeUp} custom={3}>
            <Link to="/register" className="btn btn-primary btn-lg">
              Register Dataset
              <Icon name="chevron-right" size={18} />
            </Link>
            <Link to="/verify" className="btn btn-secondary btn-lg">
              <Icon name="search" size={18} />
              Verify Hash
            </Link>
          </motion.div>
        </motion.div>

        <SplineHero />
      </section>

      {/* ─── Specimen ───────────────────────────────────────────────────────
           Renders only once a real verified record exists. An empty-state
           apology ("nothing anchored yet") is worse on a first impression than
           simply not claiming the section at all -- the moment a dataset
           clears verification, this appears on its own with no further work. */}
      {specimen && (
        <div className="specimen">
          <div className="specimen-head">
            <span className="t-eyebrow">Latest verified record</span>
            <Link to={`/dataset/${specimen.datasetId}`} className="specimen-note">
              {specimen.name} — view record
            </Link>
          </div>
          <HashRibbon value={specimen.currentHash} copyable={false} />
          <p className="specimen-note">
            Anchored on-chain for {specimen.name}. Verified by the background
            worker against Solana directly, not asserted by this page.
          </p>
        </div>
      )}

      {/* ─── Why ────────────────────────────────────────────────────────── */}
      {/* A section heading is one statement, not a sequence -- it gets one plain
          fade, not the hero's per-line stagger. The stagger is reserved for the
          spec-list rows below, where three related items are genuinely
          revealing as a set. Repeating the hero's full choreography here is the
          "uniform reflex" a system this deliberate about ruled sections
          shouldn't also apply to its motion.

          Mount-triggered (`animate`), not `whileInView` -- `whileInView` gates
          the section's only visible content on a scroll-driven intersection
          firing, and on anything that renders the page without a real scroll
          pass (a full-page screenshot, print/PDF, an OG-preview crawler) that
          intersection never happens and the section ships blank. The hero
          already animates on mount; matching that here makes every section
          visible by default, motion or not. */}
      <section className="features-section">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.2, 0.8, 0.3, 1] }}
        >
          <h2 className="section-title">Why DataProve?</h2>
          <p className="section-subtitle">
            Built for researchers who demand data integrity, transparency, and reproducibility.
          </p>
        </motion.div>

        <motion.dl
          className="spec-list"
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
        >
          <motion.div className="spec-row" variants={fadeUp} custom={0}>
            <dt>
              <span className="section-index">01</span>
              <span className="spec-term">No Trusted Operator</span>
            </dt>
            <dd>
              A private ledger or notarization service asks you to trust whoever runs
              it. Anchoring on Solana asks you to trust arithmetic and a public chain
              instead — nobody at DataProve can alter or revoke a record.
            </dd>
          </motion.div>

          <motion.div className="spec-row" variants={fadeUp} custom={1}>
            <dt>
              <span className="section-index">02</span>
              <span className="spec-term">Verifiable By Anyone</span>
            </dt>
            <dd>
              Checking a hash needs no account, no subscription, and no DataProve
              server staying online. The record lives on Solana, independent of this
              product continuing to exist.
            </dd>
          </motion.div>

          <motion.div className="spec-row" variants={fadeUp} custom={2}>
            <dt>
              <span className="section-index">03</span>
              <span className="spec-term">Content Never Uploaded</span>
            </dt>
            <dd>
              Hashing happens in your browser before anything is transmitted.
              DataProve never receives, stores, or can leak the dataset itself — only
              its digest ever leaves your machine, unless you opt into the optional
              IPFS backup described in step 2 below.
            </dd>
          </motion.div>
        </motion.dl>
      </section>

      {/* ─── How it works ───────────────────────────────────────────────── */}
      <section className="hiw-section">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.2, 0.8, 0.3, 1] }}
        >
          <h2 className="section-title">How It Works</h2>
          <p className="section-subtitle">
            Four simple steps to ensure your research data&rsquo;s integrity forever.
          </p>
        </motion.div>

        <motion.ol
          className="steps"
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
        >
          <motion.li className="step" variants={fadeUp} custom={0}>
            <span className="step-n">1</span>
            <h3>Upload &amp; Hash</h3>
            <p>
              Upload your dataset file. We compute its SHA-256 hash locally — your data
              never leaves your machine. Only the hash goes on-chain.
            </p>
          </motion.li>

          <motion.li className="step" variants={fadeUp} custom={1}>
            <span className="step-n">2</span>
            <h3>Register On-Chain</h3>
            <p>
              The hash, your researcher identity (wallet), and descriptive metadata are
              recorded as a Solana account. An IPFS CID can be added too, for an optional
              off-chain file backup — the hash alone is what proves integrity.
            </p>
          </motion.li>

          <motion.li className="step" variants={fadeUp} custom={2}>
            <span className="step-n">3</span>
            <h3>Track Versions</h3>
            <p>
              When you modify the dataset, update the record. A new version is created
              with the previous hash linked, building an immutable modification chain.
            </p>
          </motion.li>

          <motion.li className="step" variants={fadeUp} custom={3}>
            <span className="step-n">4</span>
            <h3>Verify Anytime</h3>
            <p>
              Anyone can paste a hash and instantly verify if it matches a registered
              dataset. The blockchain proves authenticity without trusting any central
              authority.
            </p>
          </motion.li>
        </motion.ol>
      </section>

      {/* ─── Closing ────────────────────────────────────────────────────── */}
      <section className="closing">
        <div>
          <h2 className="section-title">Ready to Prove Your Data?</h2>
          <p className="section-subtitle">
            Hash it, anchor it, and it's checkable by anyone from here on.
          </p>
        </div>
        <Link to="/register" className="btn btn-primary btn-lg">
          Register Dataset
          <Icon name="chevron-right" size={18} />
        </Link>
      </section>
    </div>
  )
}
