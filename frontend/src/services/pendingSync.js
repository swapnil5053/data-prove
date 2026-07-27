/**
 * ─── Pending sync queue ──────────────────────────────────────────────────────
 *
 * Section 2, step 5. Once the cluster has confirmed the transaction, the anchor exists
 * and the registration has succeeded. If the POST to our own backend then fails, that is
 * a recoverable inconsistency between the chain and a cache of it — not a failed
 * registration, and it must never be shown as one. The old code reported the whole
 * operation as an error in that case, which told the user the opposite of the truth.
 *
 * So the payload is parked in localStorage under `dataprove:pending_sync`, the user is
 * told "Recorded on-chain, sync pending", and retry happens on the next load.
 *
 * The signature is the idempotency key: the backend queues verification by signature, so
 * replaying the same entry cannot create a second dataset.
 */

const KEY = 'dataprove:pending_sync';
const MAX_ATTEMPTS = 8;
/** Entries older than this are dropped. The chain still has the record either way. */
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 14;

/** @returns {Array<{id: string, endpoint: string, body: any, signature: string, queuedAt: number, attempts: number}>} */
export function readQueue() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Corrupt or unavailable storage must not take the page down with it.
    return [];
  }
}

function writeQueue(entries) {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    /* quota or private mode; the chain is still the record of truth */
  }
}

/**
 * Park a confirmed-on-chain write whose backend sync failed.
 * @param {{endpoint: string, body: any, signature: string}} entry
 */
export function enqueue({ endpoint, body, signature }) {
  const entries = readQueue().filter((e) => e.signature !== signature);
  entries.push({
    id: `${signature}:${endpoint}`,
    endpoint, body, signature,
    queuedAt: Date.now(),
    attempts: 0,
  });
  writeQueue(entries);
}

export function remove(signature) {
  writeQueue(readQueue().filter((e) => e.signature !== signature));
}

export const pendingCount = () => readQueue().length;

/** Is this dataset waiting to sync? Drives the "sync pending" badge. */
export const isPending = (datasetId) =>
  readQueue().some((e) => e.body?.datasetId === datasetId);

/**
 * Retry every parked entry once. Safe to call on every app load.
 *
 * @param {(entry: object) => void} [onSynced] called per entry that lands
 * @returns {Promise<{ synced: number, remaining: number }>}
 */
export async function flushQueue(onSynced) {
  const entries = readQueue();
  if (entries.length === 0) return { synced: 0, remaining: 0 };

  const now = Date.now();
  const keep = [];
  let synced = 0;

  for (const entry of entries) {
    if (now - entry.queuedAt > MAX_AGE_MS || entry.attempts >= MAX_ATTEMPTS) continue;

    let ok = false;
    try {
      const res = await fetch(entry.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry.body),
      });
      // 409 means the row already exists — an earlier attempt landed after all, or the
      // verifier worker reconciled it. Either way this entry is done, not failed.
      ok = res.ok || res.status === 409;
    } catch {
      ok = false;
    }

    if (ok) { synced++; onSynced?.(entry); }
    else keep.push({ ...entry, attempts: entry.attempts + 1 });
  }

  writeQueue(keep);
  return { synced, remaining: keep.length };
}
