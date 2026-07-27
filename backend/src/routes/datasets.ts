import express, { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import * as db from '../services/db.js';
import { isValidHash, isValidDatasetId, isValidTxSignature, isValidPubkey } from '../utils/hash.js';
import { verifyWalletSignature } from '../middleware/auth.js';

const router = express.Router();

// ─── Rate Limiters ───────────────────────────────────────────────────────────

const readLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests — please retry after 1 minute.' },
});

const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many write requests — please wait before registering or updating again.' },
});

// Apply read limiter globally to this router
router.use(readLimiter);

// ─── GET /api/datasets ───────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response) => {
  try {
    const datasets = await db.getAllDatasets();
    res.json({ success: true, count: datasets.length, data: datasets });
  } catch (err: any) {
    console.error('[GET /api/datasets]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/datasets/stats ─────────────────────────────────────────────────
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = await db.getStats();
    res.json({ success: true, data: stats });
  } catch (err: any) {
    console.error('[GET /api/datasets/stats]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/datasets/search?q=query ────────────────────────────────────────
router.get('/search', async (req: Request, res: Response) => {
  try {
    const q = req.query.q;
    if (typeof q !== 'string' || q.trim().length === 0) {
      return res.json({ success: true, count: 0, data: [] });
    }
    const sanitizedQuery = q.trim().slice(0, 128);
    const results = await db.searchDatasets(sanitizedQuery);
    res.json({ success: true, count: results.length, data: results });
  } catch (err: any) {
    console.error('[GET /api/datasets/search]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/datasets/verify/:hash ──────────────────────────────────────────
router.get('/verify/:hash', async (req: Request, res: Response) => {
  try {
    const hash = req.params.hash as string;
    if (!isValidHash(hash)) {
      return res.status(400).json({ success: false, error: 'Invalid SHA-256 hash format (must be 64 lowercase hex chars)' });
    }
    const result = await db.verifyHash(hash);
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('[GET /api/datasets/verify]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/datasets/register ─────────────────────────────────────────────
router.post('/register', writeLimiter, verifyWalletSignature, async (req: Request, res: Response) => {
  try {
    const { datasetId, name, description, fileHash, ipfsCid, metadataUri, authority, txSignature } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'name is required and must be a non-empty string' });
    }
    if (!fileHash) {
      return res.status(400).json({ success: false, error: 'fileHash is required' });
    }
    if (!isValidHash(fileHash)) {
      return res.status(400).json({ success: false, error: 'Invalid SHA-256 hash (must be exactly 64 lowercase hex characters)' });
    }

    // ── An unanchored dataset must not be creatable ──────────────────────────
    // This used to be `txSignature: txSignature || ''`, which meant a row could be
    // written with no on-chain record at all and nothing to distinguish it from a
    // real one. The client is fixed to sign first; this closes the hole at the
    // server end so a future client cannot reopen it.
    if (!isValidTxSignature(txSignature)) {
      return res.status(400).json({
        success: false,
        error: txSignature
          ? 'Malformed txSignature: expected a base58 Solana signature of 86-88 characters.'
          : 'txSignature is required. A dataset cannot be recorded before it is anchored on-chain.',
      });
    }

    // The id is minted by the client because the dataset PDA is seeded on it, so it
    // must exist before the transaction is signed. Validated to the same shape both
    // ends agree on.
    if (!isValidDatasetId(datasetId)) {
      return res.status(400).json({
        success: false,
        error: 'datasetId is required and must be exactly 32 lowercase hex characters.',
      });
    }

    const resolvedAuthority = req.isAuthenticated
      ? req.walletPubkey
      : (authority || `DemoWallet_${Date.now()}`);

    const result = await db.registerDataset({
      datasetId,
      name:           name.trim().slice(0, 128),
      description:    (description || '').slice(0, 2048),
      fileHash,
      ipfsCid:        (ipfsCid || '').slice(0, 256),
      metadataUri:    (metadataUri || '').slice(0, 512),
      authority:      resolvedAuthority!,
      txSignature,
      isAuthenticated: req.isAuthenticated,
    });

    if (txSignature && req.app.locals.txQueue) {
      await req.app.locals.txQueue.add('verify-registration', {
        datasetId:    result.datasetId,
        txSignature,
        expectedHash: fileHash,
        type:         'registration',
      }, {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
      });
    }

    res.status(201).json({
      success: true,
      message: 'Dataset registered — on-chain verification queued',
      ...result,
    });
  } catch (err: any) {
    // A replayed pending-sync entry hits the unique index on datasetId. That is the
    // client retrying a write whose transaction already confirmed, not a server fault,
    // so it gets 409 and the client treats the entry as done.
    if (err?.code === 11000) {
      return res.status(409).json({
        success: false,
        error: 'A dataset with this id already exists.',
      });
    }
    console.error('[POST /api/datasets/register]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/datasets/update ────────────────────────────────────────────────
router.post('/update', writeLimiter, verifyWalletSignature, async (req: Request, res: Response) => {
  try {
    const { datasetId, newFileHash, changeDescription, ipfsCid, authority, txSignature, versionNumber } = req.body;

    if (!datasetId || typeof datasetId !== 'string') {
      return res.status(400).json({ success: false, error: 'datasetId is required' });
    }
    if (!newFileHash) {
      return res.status(400).json({ success: false, error: 'newFileHash is required' });
    }
    if (!isValidHash(newFileHash)) {
      return res.status(400).json({ success: false, error: 'Invalid SHA-256 hash (must be exactly 64 lowercase hex characters)' });
    }

    // Same guard as /register: no version is recorded before it is anchored.
    if (!isValidTxSignature(txSignature)) {
      return res.status(400).json({
        success: false,
        error: txSignature
          ? 'Malformed txSignature: expected a base58 Solana signature of 86-88 characters.'
          : 'txSignature is required. A version cannot be recorded before it is anchored on-chain.',
      });
    }
    if (versionNumber !== undefined && !Number.isInteger(versionNumber)) {
      return res.status(400).json({ success: false, error: 'versionNumber must be an integer' });
    }

    const resolvedAuthority = req.isAuthenticated
      ? req.walletPubkey
      : (authority || '');

    const result = await db.updateDataset({
      datasetId,
      newFileHash,
      changeDescription: (changeDescription || 'Version update').slice(0, 1024),
      ipfsCid: (ipfsCid || '').slice(0, 256),
      authority: resolvedAuthority!,
      txSignature,
      expectedVersionNumber: versionNumber,
    });

    if (txSignature && req.app.locals.txQueue) {
      await req.app.locals.txQueue.add('verify-update', {
        datasetId,
        txSignature,
        expectedHash: newFileHash,
        type:         'version-update',
      }, {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
      });
    }

    res.json({
      success: true,
      message: 'Dataset version updated — on-chain verification queued',
      ...result,
    });
  } catch (err: any) {
    if (err?.status === 409 || err?.code === 11000) {
      return res.status(409).json({ success: false, error: err.message });
    }
    console.error('[POST /api/datasets/update]', err.message);
    const status = /^unauthorized/i.test(err.message) ? 403 : 400;
    res.status(status).json({ success: false, error: err.message });
  }
});

// ─── GET /api/datasets/:id ────────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const dataset = await db.getDataset(id);
    if (!dataset) {
      return res.status(404).json({ success: false, error: 'Dataset not found' });
    }
    res.json({ success: true, data: dataset });
  } catch (err: any) {
    console.error('[GET /api/datasets/:id]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/datasets/:id/versions ──────────────────────────────────────────
router.get('/:id/versions', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const dataset = await db.getDataset(id);
    if (!dataset) {
      return res.status(404).json({ success: false, error: 'Dataset not found' });
    }
    const versions = await db.getVersions(id);
    res.json({
      success: true,
      datasetName: dataset.name,
      count: versions.length,
      data: versions,
    });
  } catch (err: any) {
    console.error('[GET /api/datasets/:id/versions]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/datasets/transfer ─────────────────────────────────────────────
router.post('/transfer', writeLimiter, verifyWalletSignature, async (req: Request, res: Response) => {
  try {
    const { datasetId, newAuthority, authority } = req.body;
    if (!datasetId || !newAuthority || !authority) {
      return res.status(400).json({ success: false, error: 'datasetId, newAuthority, and authority are required' });
    }
    if (!isValidPubkey(newAuthority)) {
      return res.status(400).json({
        success: false,
        error: 'newAuthority is not a valid Solana public key (must base58-decode to 32 bytes).',
      });
    }

    const resolvedAuthority = req.isAuthenticated ? req.walletPubkey : authority;
    const result = await db.transferOwnership(datasetId, newAuthority, resolvedAuthority!);
    res.json(result);
  } catch (err: any) {
    console.error('[POST /api/datasets/transfer]', err.message);
    const status = err?.status ?? (/^unauthorized/i.test(err.message) ? 403 : 400);
    res.status(status).json({ success: false, error: err.message });
  }
});

// ─── POST /api/datasets/deactivate ───────────────────────────────────────────
router.post('/deactivate', writeLimiter, verifyWalletSignature, async (req: Request, res: Response) => {
  try {
    const { datasetId, authority } = req.body;
    if (!datasetId || !authority) {
      return res.status(400).json({ success: false, error: 'datasetId and authority are required' });
    }

    const resolvedAuthority = req.isAuthenticated ? req.walletPubkey : authority;
    const result = await db.deactivateDataset(datasetId, resolvedAuthority!);
    res.json(result);
  } catch (err: any) {
    console.error('[POST /api/datasets/deactivate]', err.message);
    const status = err?.status ?? (/^unauthorized/i.test(err.message) ? 403 : 400);
    res.status(status).json({ success: false, error: err.message });
  }
});

export default router;
