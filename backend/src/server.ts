import { env } from './utils/env.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import http from 'http';
import { Server } from 'socket.io';
import client from 'prom-client';

import datasetRoutes from './routes/datasets.js';
import { seedDemoData } from './services/db.js';
import { getTxQueue } from './queues/txVerificationQueue.js';

declare global {
  var io: any;
}

const app        = express();
const httpServer = http.createServer(app);
const PORT       = env.PORT;
const MONGO_URI  = env.MONGO_URI;

const ALLOWED_ORIGINS = env.ALLOWED_ORIGINS;

const io = new Server(httpServer, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
});

global.io = io;

io.on('connection', (socket) => {
  console.log(`[socket.io] Client connected: ${socket.id}`);

  socket.on('subscribe:dataset', (datasetId) => {
    socket.join(`dataset:${datasetId}`);
    console.log(`[socket.io] ${socket.id} subscribed to dataset:${datasetId}`);
  });

  socket.on('disconnect', () => {
    console.log(`[socket.io] Client disconnected: ${socket.id}`);
  });
});

client.collectDefaultMetrics({ prefix: 'dataprove_' });

const registrationCounter = new client.Counter({
  name: 'dataprove_registrations_total',
  help: 'Total number of dataset registration attempts',
  labelNames: ['status'],
});
const verificationCounter = new client.Counter({
  name: 'dataprove_verifications_total',
  help: 'Total number of hash verification requests',
  labelNames: ['result'],
});
const httpRequestDuration = new client.Histogram({
  name: 'dataprove_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
});

app.locals.metrics = { registrationCounter, verificationCounter, httpRequestDuration };

app.use(helmet({
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: ALLOWED_ORIGINS,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    end({
      method: req.method,
      route: req.route?.path || req.path,
      status_code: res.statusCode,
    });
  });
  next();
});

app.use('/api/datasets', datasetRoutes);

app.get('/api/health', (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatus = ['disconnected', 'connected', 'connecting', 'disconnecting'][dbState] || 'unknown';
  res.json({
    status: dbState === 1 ? 'ok' : 'degraded',
    service: 'Research Provenance API',
    network: env.SOLANA_NETWORK,
    database: dbStatus,
    queue: app.locals.txQueue ? 'connected' : 'unavailable (demo mode)',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

app.get('/', (req, res) => {
  res.json({
    name: 'DataProve — Research Data Provenance System',
    version: '2.0.0',
    endpoints: [
      'GET  /api/health',
      'GET  /api/datasets',
      'GET  /api/datasets/stats',
      'GET  /api/datasets/search?q=query',
      'GET  /api/datasets/verify/:hash',
      'GET  /api/datasets/:id',
      'GET  /api/datasets/:id/versions',
      'POST /api/datasets/register',
      'POST /api/datasets/update',
      'POST /api/datasets/transfer',
      'POST /api/datasets/deactivate',
      'GET  /metrics  (Prometheus)',
    ],
    security: {
      auth: 'Ed25519 wallet signature (X-Wallet-Signature + X-Wallet-Pubkey headers)',
      rateLimit: '120 reads/min · 20 writes/min per IP',
    },
  });
});

async function start() {
  try {
    await mongoose.connect(MONGO_URI, {
      maxPoolSize: env.MONGO_MAX_POOL,
      minPoolSize: env.MONGO_MIN_POOL,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      heartbeatFrequencyMS: 10000,
      writeConcern: { w: 'majority', j: true },
    });

    console.log(`✅ MongoDB connected → ${MONGO_URI}`);
    const minPoolSize = (mongoose.connection as any).options?.minPoolSize || env.MONGO_MIN_POOL;
    const maxPoolSize = (mongoose.connection as any).options?.maxPoolSize || env.MONGO_MAX_POOL;
    console.log(`   Pool: min=${minPoolSize} max=${maxPoolSize}`);

    mongoose.connection.on('disconnected', () =>
      console.warn('⚠️  MongoDB disconnected — reconnecting automatically...')
    );
    mongoose.connection.on('reconnected', () =>
      console.log('✅ MongoDB reconnected')
    );

    await seedDemoData();

    const txQueue = getTxQueue();
    app.locals.txQueue = txQueue;

    httpServer.listen(PORT, () => {
      console.log(`\n🔬 DataProve Research Provenance API v2.0`);
      console.log(`   Server:    http://localhost:${PORT}`);
      console.log(`   DB:        ${MONGO_URI}`);
      console.log(`   Network:   ${env.SOLANA_NETWORK}`);
      console.log(`   WebSocket: enabled (socket.io)`);
      console.log(`   Metrics:   http://localhost:${PORT}/metrics`);
      console.log(`   Queue:     ${txQueue ? 'BullMQ/Redis active' : 'unavailable (demo mode)'}\n`);
    });
  } catch (err: any) {
    console.error('❌ Fatal startup error:', err.message);
    console.error('   Ensure Docker is running: docker compose up -d');
    process.exit(1);
  }
}

async function shutdown(signal: string) {
  console.log(`\n${signal} received — shutting down gracefully...`);
  httpServer.close(async () => {
    try {
      if (app.locals.txQueue) {
        await app.locals.txQueue.close();
        console.log('✅ BullMQ queue connection closed.');
      }
      await mongoose.disconnect();
      console.log('✅ MongoDB connection closed.');
      console.log('✅ Graceful shutdown complete.');
      process.exit(0);
    } catch (err: any) {
      console.error('❌ Error during graceful shutdown:', err.message);
      process.exit(1);
    }
  });
  setTimeout(() => {
    console.error('❌ Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, 15000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

start();
