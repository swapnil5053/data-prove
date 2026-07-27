import crypto from 'crypto';
import bs58 from 'bs58';

/**
 * Compute SHA-256 hash of a buffer or string
 * @param data 
 * @returns hex hash
 */
export function computeHash(data: crypto.BinaryLike): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Validate that a string is a valid SHA-256 hex hash.
 *
 * Lowercase only, not case-insensitive: every error message that references this
 * check says "lowercase hex characters", and currentHash/fileHash equality lookups
 * in db.ts are plain string comparisons. A hash that passed a case-insensitive
 * check here but was submitted in a different case than what's stored would silently
 * fail to match in verifyHash, which is the one guarantee this product exists to keep.
 */
export function isValidHash(hash: string): boolean {
  return /^[a-f0-9]{64}$/.test(hash);
}

/**
 * Validate a client-minted dataset id.
 *
 * 32 lowercase hex characters, matching frontend/src/services/id.js. The length is not
 * cosmetic: the id is a PDA seed and Solana caps a seed at 32 bytes, while the program's
 * own require!(dataset_id.len() <= 64) would happily accept more. Anything longer passes
 * the on-chain check and then fails in findProgramAddressSync on the client.
 */
export function isValidDatasetId(id: unknown): id is string {
  return typeof id === 'string' && /^[a-f0-9]{32}$/.test(id);
}

/**
 * Validate a Solana transaction signature: base58, 64 bytes, so 86-88 characters.
 * Excludes 0, O, I and l, which are not in the base58 alphabet.
 *
 * Shape only. Proof that the signature exists and commits to this hash is the job of
 * the BullMQ verifier worker, which resolves it against the cluster. This guard exists
 * so an unanchored row cannot be created in the first place.
 */
export function isValidTxSignature(sig: unknown): sig is string {
  return typeof sig === 'string' && /^[1-9A-HJ-NP-Za-km-z]{86,88}$/.test(sig);
}

/**
 * Generate a unique dataset ID
 * @param name
 * @param authorWallet
 * @returns string
 */
export function generateDatasetId(name: string, authorWallet: string): string {
  const input = `${name}-${authorWallet}-${Date.now()}`;
  return computeHash(input).substring(0, 32);
}

/**
 * Validate a Solana public key: base58-decodes to exactly 32 bytes.
 *
 * Used to guard /transfer's newAuthority before it's written as a dataset's
 * authority -- without this, a malformed value passes the route's truthy check,
 * gets stored, and the dataset becomes unrecoverable by anyone (no wallet can ever
 * sign as an address that was never a valid key in the first place).
 */
export function isValidPubkey(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;
  try {
    return bs58.decode(value).length === 32;
  } catch {
    return false;
  }
}
