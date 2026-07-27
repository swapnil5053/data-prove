/**
 * ─── The RPC connection ──────────────────────────────────────────────────────
 *
 * One Connection for the whole app, built from config.js.
 *
 * Two reasons this is its own module rather than living in solana.js.
 *
 * It was previously constructed in two places. WalletContext.jsx built a fresh
 * `new Connection(clusterApiUrl('devnet'), 'confirmed')` on *every render* of the
 * provider -- a new socket-capable client per render, and a second, independent
 * answer to "which chain is this?". Two sources of truth for the cluster is the
 * exact ambiguity config.js exists to remove, so there is now one object and
 * everything imports it.
 *
 * And it carries no Anchor. WalletContext needs a connection but has no business
 * pulling the IDL and the whole Anchor runtime into its module graph to get one.
 * Same reasoning as pda.js: the pure pieces stay importable on their own.
 */

import { Connection, clusterApiUrl } from '@solana/web3.js';
import { SOLANA_CLUSTER, SOLANA_RPC_URL } from '../config.js';

export const connection = new Connection(
  SOLANA_RPC_URL || clusterApiUrl(SOLANA_CLUSTER),
  'confirmed',
);
