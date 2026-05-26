import { env } from '../utils/env.js';
import mongoose from 'mongoose';
import { Worker, Job } from 'bullmq';
import { Connection } from '@solana/web3.js';
import { TX_QUEUE_NAME, REDIS_CONFIG, ITxVerificationJob } from '../queues/txVerificationQueue.js';
import * as db from '../services/db.js';

import bs58 from 'bs58';

declare global {
  var io: any;
}

const MONGO_URI  = env.MONGO_URI;
const SOLANA_RPC = env.SOLANA_RPC_URL;

const SPL_MEMO_PROGRAM_ID = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';

const connection = new Connection(SOLANA_RPC, {
  commitment: 'confirmed',
  confirmTransactionInitialTimeout: 60000,
});

/**
 * Parses a confirmed Solana transaction and extracts the SHA-256 hash
 * that was embedded in the SPL Memo instruction.
 *
 * @param txSignature - base58 Solana transaction signature
 * @returns Extracted SHA-256 hash string, or null if not found
 */
async function extractHashFromMemoTx(txSignature: string): Promise<string | null> {
  let txDetails: any;
  try {
    txDetails = await connection.getTransaction(txSignature, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    });
  } catch (rpcErr: any) {
    throw new Error(`RPC error fetching transaction ${txSignature}: ${rpcErr.message}`);
  }

  if (!txDetails) {
    throw new Error(`Transaction ${txSignature} not found — may not be finalized yet`);
  }

  if (txDetails.meta?.err) {
    throw new Error(`Transaction ${txSignature} failed on-chain: ${JSON.stringify(txDetails.meta.err)}`);
  }

  const message = txDetails.transaction.message;
  const accountKeys = message.getAccountKeys
    ? message.getAccountKeys().keySegments().flat()
    : message.accountKeys;

  for (const instruction of message.instructions) {
    const programId = accountKeys[instruction.programIdIndex];
    const programIdStr = programId.toString ? programId.toString() : String(programId);

    if (programIdStr !== SPL_MEMO_PROGRAM_ID) continue;

    let memoText: string | undefined;
    if (instruction.data) {
      try {
        const dataBytes = typeof instruction.data === 'string'
          ? Buffer.from(bs58.decode(instruction.data))
          : Buffer.from(instruction.data);
        memoText = new TextDecoder('utf-8').decode(dataBytes);
      } catch {
        continue;
      }
    }

    if (!memoText) continue;

    const parts = memoText.trim().split(':');
    if (parts.length >= 4 && parts[0] === 'DataProve') {
      const hashCandidate = parts[parts.length - 1];
      if (/^[0-9a-f]{64}$/i.test(hashCandidate)) {
        return hashCandidate.toLowerCase();
      }
    }

    const trimmed = memoText.trim();
    if (/^[0-9a-f]{64}$/i.test(trimmed)) {
      return trimmed.toLowerCase();
    }
  }

  return null;
}

/**
 * Core job processor. Called by BullMQ for each job in the queue.
 */
async function processVerificationJob(job: Job<ITxVerificationJob>): Promise<{ status: string; reason?: string }> {
  const { datasetId, txSignature, expectedHash, type } = job.data;

  console.log(`[verifier] Processing job ${job.id}: ${type} for dataset ${datasetId}`);
  console.log(`[verifier]   TX: ${txSignature}`);
  console.log(`[verifier]   Expected hash: ${expectedHash}`);

  try {
    const extractedHash = await extractHashFromMemoTx(txSignature);

    if (!extractedHash) {
      console.warn(`[verifier] No Memo hash found in tx ${txSignature} — marking as failed`);
      await db.setVerificationStatus(datasetId, 'failed');
      emitVerificationEvent(job.queueName, datasetId, 'failed', txSignature);
      return { status: 'failed', reason: 'No Memo instruction found in transaction' };
    }

    if (extractedHash !== expectedHash.toLowerCase()) {
      console.warn(`[verifier] Hash mismatch for ${datasetId}:`);
      console.warn(`[verifier]   On-chain:  ${extractedHash}`);
      console.warn(`[verifier]   Expected:  ${expectedHash}`);
      await db.setVerificationStatus(datasetId, 'failed');
      emitVerificationEvent(job.queueName, datasetId, 'failed', txSignature, 'Hash mismatch');
      return { status: 'failed', reason: 'Hash mismatch between Memo and database record' };
    }

    console.log(`[verifier] ✅ Verified dataset ${datasetId} — hash confirmed on Solana`);
    await db.setVerificationStatus(datasetId, 'verified');
    emitVerificationEvent(job.queueName, datasetId, 'verified', txSignature);
    return { status: 'verified' };

  } catch (err: any) {
    console.error(`[verifier] Error processing job ${job.id}:`, err.message);
    throw err;
  }
}

/**
 * Emits a WebSocket event to notify connected clients about the verification result.
 */
function emitVerificationEvent(queueName: string, datasetId: string, status: 'verified' | 'failed', txSignature: string, reason: string = '') {
  if (global.io) {
    global.io.emit(`dataset:${status}`, {
      datasetId,
      txSignature,
      status,
      reason,
      timestamp: Date.now(),
    });
  }
}

// ─── Worker Bootstrap ─────────────────────────────────────────────────────────
async function startWorker() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log(`✅ [verifier] MongoDB connected → ${MONGO_URI}`);
  } catch (err: any) {
    console.error('❌ [verifier] MongoDB connection failed:', err.message);
    process.exit(1);
  }

  const worker = new Worker(TX_QUEUE_NAME, processVerificationJob, {
    connection: REDIS_CONFIG,
    concurrency: 5,
  });

  worker.on('completed', (job, result) => {
    console.log(`[verifier] Job ${job.id} completed:`, result.status);
  });

  worker.on('failed', (job, err) => {
    console.error(`[verifier] Job ${job?.id} failed (attempt ${job?.attemptsMade}):`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[verifier] Worker error:', err.message);
  });

  console.log(`\n🔍 Transaction Verification Worker running`);
  console.log(`   Queue:   ${TX_QUEUE_NAME}`);
  console.log(`   Redis:   ${REDIS_CONFIG.host}:${REDIS_CONFIG.port}`);
  console.log(`   Solana:  ${SOLANA_RPC}`);
  console.log(`   Worker concurrency: 5\n`);

  const shutdown = async (signal: string) => {
    console.log(`[verifier] ${signal} received — shutting down gracefully...`);
    try {
      await worker.close();
      await mongoose.disconnect();
      console.log('[verifier] Graceful shutdown complete.');
      process.exit(0);
    } catch (err: any) {
      console.error('[verifier] Error during graceful shutdown:', err.message);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startWorker().catch((err) => {
  console.error('[verifier] Fatal startup error:', err);
  process.exit(1);
});
