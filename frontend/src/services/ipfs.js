/**
 * ─── IPFS / Pinata Service ───────────────────────────────────────────────────
 *
 * Handles uploading dataset metadata and files to IPFS via the Pinata API.
 *
 * WHY IPFS + PINATA?
 *   Storing entire research datasets on Solana is impractical — on-chain
 *   storage is expensive (~$7/MB on Mainnet). Instead, we:
 *     1. Upload the actual file/metadata to IPFS via Pinata (free tier: 1GB).
 *     2. Store only the IPFS Content Identifier (CID) on-chain.
 *     3. The SHA-256 hash of the file is the cryptographic proof — the CID
 *        is the retrieval address.
 *   This gives immutable, decentralized storage at near-zero cost.
 *
 * SETUP:
 *   1. Create a free account at https://pinata.cloud
 *   2. Generate an API key (JWT) in Settings → API Keys
 *   3. Add VITE_PINATA_JWT=<your-jwt> to frontend/.env
 *
 * USAGE:
 *   import { uploadFileToPinata, uploadMetadataToPinata } from './ipfs';
 */

const PINATA_JWT = import.meta.env.VITE_PINATA_JWT;
const PINATA_GATEWAY = import.meta.env.VITE_PINATA_GATEWAY || 'https://gateway.pinata.cloud';

/**
 * Checks whether Pinata credentials are configured.
 * @returns {boolean}
 */
export function isPinataConfigured() {
  return Boolean(PINATA_JWT && PINATA_JWT.length > 10);
}

/**
 * Uploads a raw File object to IPFS via Pinata.
 * The file is streamed from the browser using the Fetch API + FormData.
 *
 * @param {File} file - The dataset file to upload.
 * @param {string} datasetName - Used as the pin name for easy identification.
 * @returns {Promise<{cid: string, size: number, url: string}>}
 */
export async function uploadFileToPinata(file, datasetName) {
  if (!isPinataConfigured()) {
    throw new Error('Pinata JWT not configured. Add VITE_PINATA_JWT to your .env file.');
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('pinataMetadata', JSON.stringify({
    name: `DataProve — ${datasetName} — ${new Date().toISOString()}`,
    keyvalues: {
      source: 'dataprove',
      dataset: datasetName,
      uploadedAt: Date.now().toString(),
    },
  }));
  formData.append('pinataOptions', JSON.stringify({
    cidVersion: 1, // Use CIDv1 (more modern, base32)
  }));

  const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PINATA_JWT}`,
      // Note: Do NOT set Content-Type here — browser sets it with the boundary
    },
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Pinata file upload failed (${response.status}): ${errText}`);
  }

  const result = await response.json();
  const cid = result.IpfsHash;

  return {
    cid,
    size: result.PinSize,
    url: `${PINATA_GATEWAY}/ipfs/${cid}`,
  };
}

/**
 * Uploads a JSON metadata object to IPFS via Pinata.
 * Used to store structured dataset metadata (description, researcher info, etc.)
 * in a fully decentralized format.
 *
 * @param {object} metadata - The metadata object to store.
 * @param {string} datasetId - Used for the pin name.
 * @returns {Promise<{cid: string, url: string}>}
 */
export async function uploadMetadataToPinata(metadata, datasetId) {
  if (!isPinataConfigured()) {
    console.warn('[IPFS] Pinata not configured — skipping metadata upload');
    return { cid: '', url: '' };
  }

  const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PINATA_JWT}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      pinataContent: {
        ...metadata,
        schema: 'DataProve/v2',
        timestamp: new Date().toISOString(),
      },
      pinataMetadata: {
        name: `DataProve Metadata — ${datasetId}`,
        keyvalues: {
          source: 'dataprove',
          datasetId,
        },
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`[IPFS] Metadata upload failed: ${errText}`);
    return { cid: '', url: '' };
  }

  const result = await response.json();
  const cid = result.IpfsHash;

  return {
    cid,
    url: `${PINATA_GATEWAY}/ipfs/${cid}`,
  };
}

/**
 * Returns the public IPFS gateway URL for a given CID.
 * @param {string} cid
 * @returns {string}
 */
export function getIpfsUrl(cid) {
  if (!cid) return '';
  return `${PINATA_GATEWAY}/ipfs/${cid}`;
}
