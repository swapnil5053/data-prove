/**
 * ─── Dataset id minting ──────────────────────────────────────────────────────
 *
 * The id has to exist before the wallet opens, because the dataset PDA is seeded on
 * it: ["dataset", datasetId, authority]. The server used to mint it inside
 * POST /register, which is precisely why the old flow had to write the database row
 * before asking for a signature — the chain-first ordering in section 2 is impossible
 * while the id only comes back in a response.
 *
 * So the client mints it and threads the same value through both the transaction and
 * the POST. The backend now accepts it and validates the shape.
 */

/**
 * Mint a dataset id.
 *
 * Call this EXACTLY ONCE per registration and hold the result — in a ref, not state,
 * so a re-render cannot lose it. Two calls return two different ids, and the second
 * one produces a database row that does not match the PDA you have already paid rent
 * on: an orphaned account, on-chain, permanently, with nothing pointing at it.
 *
 * @param {string} name
 * @param {string} authority base58 pubkey
 * @returns {Promise<string>} 32 lowercase hex characters
 */
export async function mintDatasetId(name, authority) {
  const raw = `${name}-${authority}-${Date.now()}-${crypto.randomUUID()}`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  const id = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);

  // The length is load-bearing and the two limits disagree. Solana caps a PDA seed at
  // 32 bytes, but the program's require!(dataset_id.len() <= 64) accepts up to 64. An
  // id of 33-64 characters therefore passes the on-chain check and then throws inside
  // findProgramAddressSync on the client — a confusing failure a long way from its cause.
  // Fail here instead, where the cause is obvious.
  if (id.length !== 32) {
    throw new Error(`mintDatasetId produced a ${id.length}-character id; PDA seeds are capped at 32 bytes.`);
  }
  return id;
}

/** The shape the backend validates against. Exported so both ends agree in one place. */
export const DATASET_ID_PATTERN = /^[a-f0-9]{32}$/;
