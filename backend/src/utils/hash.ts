import crypto from 'crypto';

/**
 * Compute SHA-256 hash of a buffer or string
 * @param data 
 * @returns hex hash
 */
export function computeHash(data: crypto.BinaryLike): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Validate that a string is a valid SHA-256 hex hash
 * @param hash 
 * @returns boolean
 */
export function isValidHash(hash: string): boolean {
  return /^[a-f0-9]{64}$/i.test(hash);
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
