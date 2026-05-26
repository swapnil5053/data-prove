/**
 * ─── WebSocket Client Service ────────────────────────────────────────────────
 *
 * Manages the Socket.io connection to the DataProve API server for real-time
 * on-chain verification status updates.
 *
 * FLOW:
 *   1. User registers a dataset → UI shows "Pending Verification" badge.
 *   2. Background worker validates the Solana transaction.
 *   3. Server emits 'dataset:verified' or 'dataset:failed'.
 *   4. This service receives the event and triggers a React state update.
 *
 * USAGE:
 *   import { getSocket, subscribeToDataset, onVerificationUpdate } from './socket';
 *
 *   // Subscribe to updates for a specific dataset
 *   useEffect(() => {
 *     subscribeToDataset(datasetId);
 *     const unsub = onVerificationUpdate((event) => {
 *       if (event.datasetId === datasetId) {
 *         setStatus(event.status);
 *       }
 *     });
 *     return () => unsub();
 *   }, [datasetId]);
 */

import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

let socket = null;

/**
 * Returns the singleton Socket.io client instance.
 * Connects lazily on first call.
 * @returns {import('socket.io-client').Socket}
 */
export function getSocket() {
  if (socket && socket.connected) return socket;

  socket = io(SOCKET_URL, {
    transports: ['websocket', 'polling'],
    // Auto-reconnect with exponential backoff (1s → 2s → 4s … up to 30s)
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000,
    reconnectionAttempts: 10,
    // Timeout before declaring initial connection failed
    timeout: 10000,
  });

  socket.on('connect', () => {
    console.log('[socket.io] Connected:', socket.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('[socket.io] Disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.warn('[socket.io] Connection error:', err.message);
    // Graceful degradation — the app works without WebSockets,
    // users just won't get real-time verification updates.
  });

  return socket;
}

/**
 * Subscribes to verification events for a specific dataset.
 * Joins the server-side room for that dataset ID.
 *
 * @param {string} datasetId
 */
export function subscribeToDataset(datasetId) {
  if (!datasetId) return;
  const sock = getSocket();
  sock.emit('subscribe:dataset', datasetId);
}

/**
 * Registers a callback for any verification update (verified or failed).
 *
 * @param {function} callback - Called with event object { datasetId, status, txSignature, reason, timestamp }
 * @returns {function} unsubscribe - Call to remove the listener
 */
export function onVerificationUpdate(callback) {
  const sock = getSocket();

  const onVerified = (data) => callback({ ...data, status: 'verified' });
  const onFailed   = (data) => callback({ ...data, status: 'failed' });

  sock.on('dataset:verified', onVerified);
  sock.on('dataset:failed',   onFailed);

  // Return cleanup function for use in React useEffect
  return () => {
    sock.off('dataset:verified', onVerified);
    sock.off('dataset:failed',   onFailed);
  };
}

/**
 * Disconnects the socket (call on app unmount / logout).
 */
export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
