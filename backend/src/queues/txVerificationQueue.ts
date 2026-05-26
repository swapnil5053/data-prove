import { Queue } from 'bullmq';
import { env } from '../utils/env.js';

export interface ITxVerificationJob {
  datasetId: string;
  txSignature: string;
  expectedHash: string;
  type: 'registration' | 'version-update';
}

export const REDIS_CONFIG = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  ...(env.REDIS_PASSWORD && { password: env.REDIS_PASSWORD }),
  ...(env.REDIS_TLS && { tls: {} }),
};

export const TX_QUEUE_NAME = 'tx-verification';

let txVerificationQueue: Queue<ITxVerificationJob> | null = null;

export function getTxQueue(): Queue<ITxVerificationJob> | null {
  if (txVerificationQueue) return txVerificationQueue;

  try {
    txVerificationQueue = new Queue<ITxVerificationJob>(TX_QUEUE_NAME, {
      connection: REDIS_CONFIG,
      defaultJobOptions: {
        removeOnComplete: { age: 86400 },
        removeOnFail: { age: 7 * 86400 },
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    });

    console.log(`✅ BullMQ queue connected → Redis ${REDIS_CONFIG.host}:${REDIS_CONFIG.port}`);
    return txVerificationQueue;
  } catch (err: any) {
    console.warn(`⚠️  BullMQ unavailable (Redis not reachable): ${err.message}`);
    console.warn('   On-chain verification will be skipped — running in demo mode.');
    return null;
  }
}
