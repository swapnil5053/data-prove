/**
 * ─── Program address derivation ──────────────────────────────────────────────
 *
 * Split out of solana.js so it can be imported and checked by plain Node with no
 * Anchor, no IDL and no `import.meta.env` in the way — see scripts/verify/pda.mjs.
 * These four lines decide whether every dataset already anchored on devnet stays
 * reachable, so they get to be verifiable on their own.
 *
 * Nothing here may grow a dependency. Pure input -> address.
 *
 * The seeds are load-bearing and specific to this deployment:
 *   dataset  ->  ["dataset", datasetId, authority]     (two arguments, authority included)
 *   version  ->  ["version", datasetId, u32 LE]
 *
 * Other builds of this project seed the dataset PDA on the id alone. Changing the
 * seeds here does not fail loudly — it silently derives a different address, and
 * every existing record becomes unreachable. scripts/verify/pda.mjs pins all 45
 * derivations against a golden file for exactly that reason.
 */

import { PublicKey } from '@solana/web3.js';

/**
 * The deployed program. Not read from the IDL: solana.js asserts at module load
 * that `idl.address` agrees with this, so a stale IDL cannot redirect the client
 * at a different program.
 */
export const PROGRAM_ID = new PublicKey('FkZMTjPTBGEWUE2dRbdjLBjMPE4gwt1ME5G3qg3xbXwK');

/**
 * @param {string} datasetId
 * @param {PublicKey} authorityPubkey
 * @returns {PublicKey}
 */
export function getDatasetPda(datasetId, authorityPubkey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('dataset'), Buffer.from(datasetId), authorityPubkey.toBuffer()],
    PROGRAM_ID,
  )[0];
}

/**
 * @param {string} datasetId
 * @param {number} versionNumber
 * @returns {PublicKey}
 */
export function getVersionPda(datasetId, versionNumber) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(versionNumber, 0);
  return PublicKey.findProgramAddressSync(
    [Buffer.from('version'), Buffer.from(datasetId), buf],
    PROGRAM_ID,
  )[0];
}
