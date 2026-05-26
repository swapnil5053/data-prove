import dotenv from 'dotenv';
dotenv.config();
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  MONGO_URI: z.string().min(1, { message: "MONGO_URI is required" }),
  MONGO_MAX_POOL: z.coerce.number().default(100),
  MONGO_MIN_POOL: z.coerce.number().default(10),
  REDIS_HOST: z.string().default('127.0.0.1'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_TLS: z.string().optional().default('false').transform(val => val === 'true'),
  SOLANA_RPC_URL: z.string().url({ message: "SOLANA_RPC_URL must be a valid URL" }).default('https://api.devnet.solana.com'),
  SOLANA_NETWORK: z.string().default('devnet'),
  ALLOWED_ORIGINS: z.string().optional().default('http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173').transform((val) => {
    return val
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }),
});

// Parse the environment variables
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('\n❌ CRITICAL ENVIRONMENT ERROR: Invalid or missing environment configuration');
  console.error('========================================================================');
  const formatted = parsed.error.format();
  for (const [key, error] of Object.entries(formatted)) {
    if (key === '_errors') continue;
    const errObj = error as { _errors: string[] };
    console.error(`  - ${key}: ${errObj._errors.join(', ')}`);
  }
  console.error('========================================================================\n');
  process.exit(1);
}

export const env = parsed.data;
