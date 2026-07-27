import { PROGRAM_ID } from '../services/pda'
import { SOLANA_CLUSTER } from '../config'
import './Footer.css'

/**
 * Built inside the component, not at module scope. PROGRAM_ID.toBase58() can
 * throw if the program address env var is ever misconfigured, and Footer
 * renders on every page -- a throw at module load time would take down the
 * whole app, not just this one link. A failed link is a much smaller failure
 * than a blank screen everywhere.
 */
function getExplorerAddressUrl() {
  try {
    return `https://explorer.solana.com/address/${PROGRAM_ID.toBase58()}?cluster=${SOLANA_CLUSTER}`
  } catch {
    return null
  }
}

export default function Footer() {
  const explorerAddressUrl = getExplorerAddressUrl()

  return (
    <footer className="footer">
      <p>
        Built on <a href="https://solana.com" target="_blank" rel="noreferrer">Solana</a> ·{' '}
        DataProve © {new Date().getFullYear()} · Ensuring Research Data Integrity
      </p>
      <p className="footer-verify">
        <a href="https://github.com/swapnil5053/data-prove" target="_blank" rel="noreferrer">
          Source
        </a>
        {explorerAddressUrl && (
          <>
            {' · '}
            <a href={explorerAddressUrl} target="_blank" rel="noreferrer">
              View program on Solana Explorer
            </a>
          </>
        )}
      </p>
    </footer>
  )
}
