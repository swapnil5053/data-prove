/**
 * ─── Error taxonomy ──────────────────────────────────────────────────────────
 *
 * Section 4.4. Every failure the chain-first flow can produce gets its own message and
 * its own recovery action. The thing being replaced was a single
 * `addToast('Error: ' + err.message)`, which told the user that something involving
 * "0x1771" had happened and gave them nowhere to go.
 *
 * Two rules hold everywhere:
 *   - No bare catch. A catch either produces a DataProveError or rethrows.
 *   - Messages say what happened and what to do. They do not apologise and are never
 *     vague. "Something went wrong" is not a failure mode, it is a refusal to say which.
 */

/**
 * @typedef {{ kind: 'retry'|'link'|'reload'|'wait'|'none', label: string, href?: string }} Action
 */

export class DataProveError extends Error {
  /**
   * @param {string} code    stable identifier, safe to branch on
   * @param {string} message user-facing; shown verbatim
   * @param {Action} action  what the user can do next
   * @param {{ cause?: unknown, detail?: string, logsUrl?: string }} [extra]
   */
  constructor(code, message, action, extra = {}) {
    super(message, { cause: extra.cause });
    this.name = 'DataProveError';
    this.code = code;
    this.action = action;
    this.detail = extra.detail;
    this.logsUrl = extra.logsUrl;
  }
}

export const ErrorCode = {
  WALLET_MISSING:    'WALLET_MISSING',
  WALLET_DISCONNECTED: 'WALLET_DISCONNECTED',
  WALLET_REJECTED:   'WALLET_REJECTED',
  INSUFFICIENT_SOL:  'INSUFFICIENT_SOL',
  BLOCKHASH_EXPIRED: 'BLOCKHASH_EXPIRED',
  SIMULATION_FAILED: 'SIMULATION_FAILED',
  RPC_UNAVAILABLE:   'RPC_UNAVAILABLE',
  VERSION_CONFLICT:  'VERSION_CONFLICT',
  DATASET_CONFLICT:  'DATASET_CONFLICT',
  SYNC_PENDING:      'SYNC_PENDING',
  BACKEND_REJECTED:  'BACKEND_REJECTED',
};

const FAUCET = 'https://faucet.solana.com';

// ─── Constructors for the cases we raise ourselves ───────────────────────────

export const walletMissing = () => new DataProveError(
  ErrorCode.WALLET_MISSING,
  'No wallet detected in this browser.',
  { kind: 'link', label: 'Install Phantom', href: 'https://phantom.app/download' },
);

export const walletDisconnected = () => new DataProveError(
  ErrorCode.WALLET_DISCONNECTED,
  'Connect a wallet to register a dataset. Registration writes to the chain first, so it cannot proceed unsigned.',
  { kind: 'none', label: 'Connect wallet' },
);

/**
 * The chain accepted it and the database did not. Not a failure — the anchor exists,
 * and the anchor is the thing that matters. Never surfaced as an error state.
 */
export const syncPending = (signature) => new DataProveError(
  ErrorCode.SYNC_PENDING,
  'Recorded on-chain. Sync pending.',
  { kind: 'wait', label: 'Retrying automatically' },
  { detail: signature },
);

// ─── Classification ──────────────────────────────────────────────────────────

const has = (hay, ...needles) => {
  const s = String(hay ?? '').toLowerCase();
  return needles.some((n) => s.includes(n));
};

/**
 * Map a wallet, RPC or Anchor failure onto the taxonomy.
 *
 * Wallet adapters and web3.js disagree about how to report the same condition — a
 * rejection is `code: 4001` in Phantom, a message in Solflare, and a `WalletError`
 * subclass elsewhere — so this matches on several shapes per case on purpose.
 *
 * @param {unknown} err
 * @param {{ attempt?: number, cluster?: string }} [ctx]
 * @returns {DataProveError}
 */
export function classifyChainError(err, ctx = {}) {
  if (err instanceof DataProveError) return err;

  const e = /** @type {any} */ (err ?? {});
  const msg = e.message ?? String(err);
  const logs = Array.isArray(e.logs) ? e.logs.join('\n') : '';
  const anchorCode = e.error?.errorCode?.code ?? e.error?.errorCode?.number;

  // Program-defined errors first — they are the most specific thing available.
  if (anchorCode === 'InvalidVersionNumber' || has(logs, 'invalidversionnumber')) {
    return new DataProveError(
      ErrorCode.VERSION_CONFLICT,
      'This dataset was updated by another session. Reload to get the current version.',
      { kind: 'reload', label: 'Reload' },
      { cause: err },
    );
  }
  // An init'd PDA that already exists means the same version was anchored already.
  if (has(msg, 'already in use') || has(logs, 'already in use')) {
    return new DataProveError(
      ErrorCode.VERSION_CONFLICT,
      'This version is already anchored on-chain. Reload to get the current version.',
      { kind: 'reload', label: 'Reload' },
      { cause: err },
    );
  }

  if (e.code === 4001 || has(msg, 'user rejected', 'user denied', 'rejected the request', 'declined')) {
    return new DataProveError(
      ErrorCode.WALLET_REJECTED,
      'Signature declined. Nothing was recorded.',
      { kind: 'retry', label: 'Try again' },
      { cause: err },
    );
  }

  if (has(msg, 'insufficient lamports', 'insufficient funds') || has(logs, 'insufficient lamports')) {
    // web3.js phrases this as "insufficient lamports 12345, need 67890".
    const m = /insufficient lamports (\d+), need (\d+)/i.exec(`${msg}\n${logs}`);
    const short = m ? (Number(m[2]) - Number(m[1])) / 1e9 : null;
    return new DataProveError(
      ErrorCode.INSUFFICIENT_SOL,
      short !== null
        ? `Not enough SOL to cover account rent. About ${short.toFixed(4)} SOL short.`
        : 'Not enough SOL to cover account rent.',
      { kind: 'link', label: 'Get devnet SOL', href: FAUCET },
      { cause: err },
    );
  }

  if (has(msg, 'blockhash not found', 'block height exceeded', 'blockhash expired', 'transactionexpired')) {
    return new DataProveError(
      ErrorCode.BLOCKHASH_EXPIRED,
      'The transaction expired before it was signed.',
      { kind: 'retry', label: 'Rebuild and retry' },
      { cause: err },
    );
  }

  if (has(msg, 'simulation failed', 'custom program error') || logs) {
    return new DataProveError(
      ErrorCode.SIMULATION_FAILED,
      'The program rejected this transaction.',
      { kind: 'retry', label: 'Try again' },
      { cause: err, detail: logs || msg },
    );
  }

  if (has(msg, '429', 'too many requests', 'timeout', 'timed out', 'failed to fetch', 'network error')) {
    return new DataProveError(
      ErrorCode.RPC_UNAVAILABLE,
      ctx.attempt
        ? `The network didn't respond in time. Attempt ${ctx.attempt}.`
        : "The network didn't respond in time.",
      { kind: 'retry', label: 'Retry' },
      { cause: err },
    );
  }

  // Nothing matched. Rethrow-equivalent: keep the original message rather than
  // inventing a friendlier one that hides what actually happened.
  return new DataProveError(
    ErrorCode.SIMULATION_FAILED, msg || 'The transaction could not be sent.',
    { kind: 'retry', label: 'Try again' }, { cause: err, detail: logs || undefined },
  );
}

/**
 * Map a backend response onto the taxonomy. Separate from the chain classifier because
 * a backend failure after a confirmed signature is never a failure of the registration.
 *
 * @param {Response} res
 * @param {any} body parsed JSON, may be undefined
 */
export function classifyApiError(res, body) {
  const message = body?.error || `The server responded ${res.status}.`;
  if (res.status === 409) {
    return new DataProveError(
      ErrorCode.DATASET_CONFLICT, message,
      { kind: 'reload', label: 'Reload' },
    );
  }
  if (res.status === 429) {
    return new DataProveError(
      ErrorCode.RPC_UNAVAILABLE, 'Too many requests. Wait a moment and try again.',
      { kind: 'retry', label: 'Retry' },
    );
  }
  return new DataProveError(
    ErrorCode.BACKEND_REJECTED, message, { kind: 'retry', label: 'Retry' },
  );
}
