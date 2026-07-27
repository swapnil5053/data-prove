import { PublicKey, SystemProgram } from '@solana/web3.js';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import idl from '../idl/research_provenance.json';
import { PROGRAM_ID, getDatasetPda, getVersionPda } from './pda.js';
import { connection } from './connection.js';
import { SOLANA_CLUSTER } from '../config.js';

// Derivation moved to ./pda.js so it can be checked by plain Node without Anchor.
// Re-exported here because every existing call site imports it from this module.
export { PROGRAM_ID, getDatasetPda, getVersionPda };

/**
 * A stale or wrong-program IDL is the failure this guard exists for. Anchor 0.30+
 * takes the program address from `idl.address` instead of a constructor argument,
 * so a mismatched IDL would quietly address a different program and surface much
 * later as "account does not exist", far from the cause.
 *
 * Evaluated once, at module load. It does not throw here, though, and the reason
 * is worth stating: this module is statically imported by the router, so a
 * module-scope throw takes down every route -- including verify and dashboard,
 * which never touch the chain -- and does it as a blank page whose only trace is
 * a console entry. That is worse diagnostics, not better.
 *
 * The guarantee that actually matters is that no transaction can be built against
 * a mismatched IDL. That is enforced in getProgram(), which every write path goes
 * through, so the check is unmissable at the point where it would do harm and
 * merely loud everywhere else.
 */
const idlMismatch = idl.address === PROGRAM_ID.toBase58()
  ? null
  : `IDL/program mismatch: idl.address is ${idl.address ?? '(absent)'}, client expects ` +
    `${PROGRAM_ID.toBase58()}. ` +
    (idl.address === undefined
      ? 'The IDL has no address field, so it predates Anchor 0.30. Regenerate it: node scripts/idl/build-idl.mjs'
      : 'Regenerate the IDL against the deployed program: node scripts/idl/build-idl.mjs');

if (idlMismatch) console.error(`[dataprove] ${idlMismatch}`);

// Built in ./connection.js so WalletContext can have a Connection without
// dragging Anchor and the IDL along with it. Re-exported: call sites import it
// from here.
export { connection };

function getProvider(walletAdapter) {
  return new AnchorProvider(connection, walletAdapter, { preflightCommitment: 'confirmed' });
}

function getProgram(walletAdapter) {
  // The one place a mismatched IDL must not get past. Every write path lands here.
  if (idlMismatch) throw new Error(idlMismatch);
  // Two arguments. Anchor 0.30 removed the (idl, programId, provider) form.
  return new Program(idl, getProvider(walletAdapter));
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
 * Read the on-chain dataset account.
 *
 * The next version number must come from the chain, not from GET /api/datasets/:id.
 * Mongo lags the chain — it is a cache written after the fact by the verifier worker —
 * so a stale read produces a transaction the program rejects with InvalidVersionNumber.
 * The program enforces `version_number == dataset.version_count + 1` and the version PDA
 * is `init`, so the chain cannot be corrupted by a wrong value; it just refuses, after
 * the user has waited for their wallet.
 *
 * The fetch doubles as an existence and ownership check.
 *
 * @returns {Promise<object>} the deserialised DatasetRecord
 */
export async function fetchDatasetAccount(walletAdapter, publicKeyStr, datasetId) {
  const program = getProgram(walletAdapter);
  const datasetPda = getDatasetPda(datasetId, new PublicKey(publicKeyStr));
  return program.account.datasetRecord.fetch(datasetPda);
}

/**
 * The next version number, read from the chain.
 * @returns {Promise<number>}
 */
export async function getNextVersionNumber(walletAdapter, publicKeyStr, datasetId) {
  const account = await fetchDatasetAccount(walletAdapter, publicKeyStr, datasetId);
  return Number(account.versionCount) + 1;
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

/**
 * The default is the configured cluster, not a literal. A hardcoded fallback here
 * is the quietest way this product could lie: on a mainnet build every explorer
 * link would point at devnet, show "transaction not found", and look like the
 * anchor never happened.
 */
export function getExplorerUrl(signature, cluster = SOLANA_CLUSTER) {
  return `https://explorer.solana.com/tx/${signature}?cluster=${cluster}`;
}
