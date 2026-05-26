import { Request, Response, NextFunction } from 'express';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

declare global {
  namespace Express {
    interface Request {
      isAuthenticated?: boolean;
      walletPubkey?: string | null;
    }
  }
}

/**
 * Decodes a Solana base58 public key string into a Uint8Array.
 * @param pubkeyStr - Base58-encoded 32-byte Ed25519 public key.
 * @returns Uint8Array
 */
function decodePubkey(pubkeyStr: string): Uint8Array {
  const decoded = bs58.decode(pubkeyStr);
  if (decoded.length !== 32) {
    throw new Error(`Invalid public key length: expected 32 bytes, got ${decoded.length}`);
  }
  return decoded;
}

/**
 * Deterministically serializes request body for signature verification.
 * Keys are sorted to ensure the same canonical form regardless of insertion order.
 * @param body - The parsed request body.
 * @returns Uint8Array - UTF-8 encoded canonical JSON.
 */
function canonicalizeBody(body: any): Uint8Array {
  const sorted = JSON.parse(JSON.stringify(body, Object.keys(body).sort()));
  return new TextEncoder().encode(JSON.stringify(sorted));
}

/**
 * Express middleware for Ed25519 request authentication.
 *
 * Sets req.isAuthenticated = true and req.walletPubkey on success.
 * Falls through to demo mode (req.isAuthenticated = false) if no headers.
 */
export function verifyWalletSignature(req: Request, res: Response, next: NextFunction) {
  const signatureHex = req.headers['x-wallet-signature'];
  const pubkeyStr    = req.headers['x-wallet-pubkey'];

  // ── Demo mode: no headers present → skip verification ──────────────────
  if (!signatureHex && !pubkeyStr) {
    req.isAuthenticated = false;
    req.walletPubkey    = null;
    return next();
  }

  // ── Authenticated mode: both headers required ───────────────────────────
  if (Array.isArray(signatureHex) || Array.isArray(pubkeyStr) || !signatureHex || !pubkeyStr) {
    return res.status(401).json({
      success: false,
      error: 'Partial authentication: provide both X-Wallet-Signature and X-Wallet-Pubkey headers, or neither.',
    });
  }

  try {
    // Decode the hex signature string into raw bytes
    if (!/^[0-9a-f]{128}$/i.test(signatureHex)) {
      return res.status(401).json({
        success: false,
        error: 'Invalid signature format: expected 128 lowercase hex characters (64 bytes).',
      });
    }
    const signatureBytes = Uint8Array.from(Buffer.from(signatureHex, 'hex'));

    // Decode the public key from base58
    const pubkeyBytes = decodePubkey(pubkeyStr);

    // Canonicalize the request body into the message that was signed
    const messageBytes = canonicalizeBody(req.body);

    // Ed25519 verification — returns true only if the signature was produced
    // by the private key corresponding to pubkeyBytes over messageBytes.
    const isValid = nacl.sign.detached.verify(messageBytes, signatureBytes, pubkeyBytes);

    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: 'Signature verification failed: the request was not signed by the claimed wallet.',
      });
    }

    // ── Inject verified identity into the request ───────────────────────────
    req.isAuthenticated = true;
    req.walletPubkey    = pubkeyStr;

    // Validate authority field matches the signing public key to prevent
    // a scenario where user A signs but claims to be user B in the body.
    const bodyAuthority = req.body.authority;
    if (bodyAuthority && bodyAuthority !== pubkeyStr) {
      return res.status(401).json({
        success: false,
        error: 'Authority mismatch: body.authority does not match X-Wallet-Pubkey.',
      });
    }

    next();
  } catch (err: any) {
    console.error('[auth] Signature verification error:', err.message);
    return res.status(401).json({
      success: false,
      error: `Authentication error: ${err.message}`,
    });
  }
}
