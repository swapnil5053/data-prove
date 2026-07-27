/**
 * ─── Runtime configuration ───────────────────────────────────────────────────
 *
 * One place that knows which chain this build talks to.
 *
 * There used to be three, none of which agreed by construction: a
 * clusterApiUrl('devnet') in solana.js, a second one in WalletContext.jsx that
 * built a fresh Connection on every render, and a `cluster = 'devnet'` default
 * parameter on getExplorerUrl. Any of them could be changed without the others,
 * and the default parameter in particular would have shipped to mainnet
 * unnoticed -- the explorer link would quietly point at devnet while the
 * transaction was real.
 *
 * Ambiguity about which chain you are looking at destroys trust silently, which
 * is the one failure this product cannot afford. So: one env var, no default
 * that is a real cluster, and a navbar badge that always says which.
 */

const VALID = ['devnet', 'testnet', 'mainnet-beta', 'localnet'];

const raw = import.meta.env.VITE_SOLANA_CLUSTER;

if (raw && !VALID.includes(raw)) {
  throw new Error(
    `VITE_SOLANA_CLUSTER is "${raw}", which is not one of: ${VALID.join(', ')}.`,
  );
}

/** @type {'devnet'|'testnet'|'mainnet-beta'|'localnet'} */
export const SOLANA_CLUSTER = raw || 'devnet';

/**
 * Whether the cluster was chosen or fallen back to. The navbar badge uses this
 * to mark an unconfigured build, so "we forgot to set it" is visible rather
 * than indistinguishable from "we meant devnet".
 */
export const CLUSTER_IS_DEFAULT = !raw;

/** Explicit override for a private or local RPC. Empty means use the public one. */
export const SOLANA_RPC_URL = import.meta.env.VITE_SOLANA_RPC_URL || '';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
