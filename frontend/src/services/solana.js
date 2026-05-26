import {
  Connection,
  PublicKey,
  clusterApiUrl,
  SystemProgram,
} from '@solana/web3.js';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import idl from '../idl/research_provenance.json';

export const PROGRAM_ID = new PublicKey('FkZMTjPTBGEWUE2dRbdjLBjMPE4gwt1ME5G3qg3xbXwK');
export const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

function getProvider(walletAdapter) {
  const provider = new AnchorProvider(connection, walletAdapter, { preflightCommitment: 'confirmed' });
  return provider;
}

function getProgram(walletAdapter) {
  const provider = getProvider(walletAdapter);
  return new Program(idl, PROGRAM_ID, provider);
}

export function getDatasetPda(datasetId, authorityPubkey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("dataset"), Buffer.from(datasetId), authorityPubkey.toBuffer()],
    PROGRAM_ID
  )[0];
}

export function getVersionPda(datasetId, versionNumber) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(versionNumber, 0);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("version"), Buffer.from(datasetId), buf],
    PROGRAM_ID
  )[0];
}

/**
 * Register a dataset on-chain
 */
export async function registerDatasetOnChain(walletAdapter, publicKeyStr, datasetPayload) {
  const walletPublicKey = new PublicKey(publicKeyStr);
  const program = getProgram(walletAdapter);
  
  const datasetPda = getDatasetPda(datasetPayload.datasetId, walletPublicKey);

  const tx = await program.methods
    .registerDataset(
      datasetPayload.datasetId,
      datasetPayload.name,
      datasetPayload.description || "",
      datasetPayload.fileHash,
      datasetPayload.ipfsCid || "",
      datasetPayload.metadataUri || ""
    )
    .accounts({
      datasetRecord: datasetPda,
      authority: walletPublicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return { signature: tx };
}

/**
 * Update a dataset version on-chain
 */
export async function updateDatasetOnChain(walletAdapter, publicKeyStr, updatePayload) {
  const walletPublicKey = new PublicKey(publicKeyStr);
  const program = getProgram(walletAdapter);

  const datasetPda = getDatasetPda(updatePayload.datasetId, walletPublicKey);
  const versionPda = getVersionPda(updatePayload.datasetId, updatePayload.versionNumber);

  const tx = await program.methods
    .updateDataset(
      updatePayload.datasetId,
      updatePayload.versionNumber,
      updatePayload.newFileHash,
      updatePayload.changeDescription || "Version update",
      updatePayload.ipfsCid || ""
    )
    .accounts({
      datasetRecord: datasetPda,
      versionRecord: versionPda,
      authority: walletPublicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return { signature: tx };
}

/**
 * Transfer ownership of a dataset on-chain
 */
export async function transferOwnershipOnChain(walletAdapter, publicKeyStr, payload) {
  const walletPublicKey = new PublicKey(publicKeyStr);
  const program = getProgram(walletAdapter);

  const datasetPda = getDatasetPda(payload.datasetId, walletPublicKey);
  const newAuthorityKey = new PublicKey(payload.newAuthority);

  const tx = await program.methods
    .transferOwnership(payload.datasetId, newAuthorityKey)
    .accounts({
      datasetRecord: datasetPda,
      authority: walletPublicKey,
    })
    .rpc();

  return { signature: tx };
}

/**
 * Deactivate a dataset on-chain
 */
export async function deactivateDatasetOnChain(walletAdapter, publicKeyStr, payload) {
  const walletPublicKey = new PublicKey(publicKeyStr);
  const program = getProgram(walletAdapter);

  const datasetPda = getDatasetPda(payload.datasetId, walletPublicKey);

  const tx = await program.methods
    .deactivateDataset(payload.datasetId)
    .accounts({
      datasetRecord: datasetPda,
      authority: walletPublicKey,
    })
    .rpc();

  return { signature: tx };
}

export function getExplorerUrl(signature, cluster = 'devnet') {
  return `https://explorer.solana.com/tx/${signature}?cluster=${cluster}`;
}
