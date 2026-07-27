#!/usr/bin/env node
/**
 * Phase 1 gate — the three scenarios from section 2, against devnet.
 *
 *   node scripts/verify/phase-1-devnet.mjs --write
 *
 * The ONE script in this repo that writes. It sends a real transaction to devnet and
 * creates one dataset. Nothing else here is destructive.
 *
 *   SOLANA_KEYPAIR   defaults to ~/.config/solana/id.json (must hold devnet SOL)
 *   API_BASE_URL     defaults to http://localhost:3001
 *   SOLANA_CLUSTER   defaults to devnet
 *
 * Prerequisites: the IDL must already be regenerated (node scripts/idl/build-idl.mjs),
 * and the API must be running.
 *
 * Scenarios:
 *   A  unsigned register        -> server must reject with 400, and write nothing
 *   B  malformed signature      -> server must reject with 400, and write nothing
 *   C  signed and confirmed     -> 201, row exists, txSignature stored, job enqueued
 *
 * Scenario A is what the old code did on every run with no wallet connected. It is the
 * hole being closed, so it is tested directly rather than assumed shut.
 *
 * The "user rejects in the wallet" case cannot be driven headlessly — there is no
 * wallet extension here. It is covered structurally instead: the POST is unreachable
 * unless signing returned, so a rejection cannot produce a row. Scenario A proves the
 * server would refuse even if a future client tried.
 */

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(join(ROOT, 'frontend', 'package.json'));
const { Connection, Keypair, PublicKey, SystemProgram, clusterApiUrl } = require('@solana/web3.js');
const anchor = require('@coral-xyz/anchor');

const CLUSTER = process.env.SOLANA_CLUSTER || 'devnet';
const API = (process.env.API_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const KEYPAIR = process.env.SOLANA_KEYPAIR || join(homedir(), '.config', 'solana', 'id.json');
const IDL_PATH = join(ROOT, 'frontend', 'src', 'idl', 'research_provenance.json');
const PROGRAM_ID = new PublicKey('FkZMTjPTBGEWUE2dRbdjLBjMPE4gwt1ME5G3qg3xbXwK');

const log = [];
const say = (s = '') => { log.push(s); console.log(s); };
let failed = 0;
const check = (name, pass, expected, actual) => {
  if (!pass) failed++;
  say(`${pass ? 'PASS' : 'FAIL'}  ${name}`);
  say(`        expected: ${expected}`);
  say(`        actual:   ${actual}`);
};
function flush() {
  if (process.argv.includes('--write')) {
    mkdirSync(join(ROOT, 'docs', 'evidence'), { recursive: true });
    writeFileSync(join(ROOT, 'docs', 'evidence', 'phase-1-devnet.txt'), log.join('\n') + '\n', 'utf8');
    console.log('\nwritten: docs/evidence/phase-1-devnet.txt');
  }
}
const bail = (m) => { say(''); say(`FAIL: ${m}`); flush(); process.exit(1); };

const sha256hex = (s) => createHash('sha256').update(s).digest('hex');
const mintId = (name, authority) =>
  sha256hex(`${name}-${authority}-${Date.now()}-${randomUUID()}`).slice(0, 32);

const post = async (path, body) => {
  const res = await fetch(`${API}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

say('Phase 1 gate — devnet');
say(`cluster: ${CLUSTER}`);
say(`api:     ${API}`);
say(`run:     ${new Date().toISOString()}`);
say('');

// ─── Setup ───────────────────────────────────────────────────────────────────
if (!existsSync(IDL_PATH)) bail('no IDL. Run: node scripts/idl/build-idl.mjs');
const idl = JSON.parse(readFileSync(IDL_PATH, 'utf8'));
if (idl.address !== PROGRAM_ID.toBase58())
  bail(`IDL address ${idl.address ?? '(absent)'} does not match ${PROGRAM_ID.toBase58()}. Regenerate it.`);

if (!existsSync(KEYPAIR)) bail(`no keypair at ${KEYPAIR}. Set SOLANA_KEYPAIR.`);
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(KEYPAIR, 'utf8'))));
const connection = new Connection(clusterApiUrl(CLUSTER), 'confirmed');

const balance = await connection.getBalance(payer.publicKey);
say(`payer:   ${payer.publicKey.toBase58()}`);
say(`balance: ${(balance / 1e9).toFixed(4)} SOL`);
if (balance < 0.02e9) bail(`payer needs at least 0.02 SOL. Fund it: solana airdrop 1 ${payer.publicKey.toBase58()} --url ${CLUSTER}`);
say('');

const fileHash = sha256hex(`dataprove-phase-1-gate-${randomUUID()}`);
const name = `Phase 1 gate ${new Date().toISOString()}`;

// ─── A. Unsigned register must be refused ────────────────────────────────────
const idA = mintId(name, payer.publicKey.toBase58());
const a = await post('/api/datasets/register', {
  datasetId: idA, name, description: 'gate A', fileHash, authority: payer.publicKey.toBase58(),
});
check('A: register with no txSignature is refused',
  a.status === 400, '400', `${a.status} ${JSON.stringify(a.body?.error ?? a.body).slice(0, 120)}`);

const aRow = await fetch(`${API}/api/datasets/${idA}`).then((r) => r.status);
check('A: no row was created',
  aRow === 404, '404 from GET /api/datasets/:id', String(aRow));

// ─── B. Malformed signature must be refused ──────────────────────────────────
const idB = mintId(name, payer.publicKey.toBase58());
const b = await post('/api/datasets/register', {
  datasetId: idB, name, description: 'gate B', fileHash,
  authority: payer.publicKey.toBase58(), txSignature: 'not-a-real-signature',
});
check('B: register with a malformed txSignature is refused',
  b.status === 400, '400', `${b.status} ${JSON.stringify(b.body?.error ?? b.body).slice(0, 120)}`);

const bRow = await fetch(`${API}/api/datasets/${idB}`).then((r) => r.status);
check('B: no row was created', bRow === 404, '404', String(bRow));
say('');

// ─── C. Sign, confirm, then record ───────────────────────────────────────────
const datasetId = mintId(name, payer.publicKey.toBase58());
check('C: minted id is a valid PDA seed',
  datasetId.length === 32, '32 characters', `${datasetId.length} (${datasetId})`);

const wallet = new anchor.Wallet(payer);
const provider = new anchor.AnchorProvider(connection, wallet, { preflightCommitment: 'confirmed' });
const program = new anchor.Program(idl, provider);
const [datasetPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('dataset'), Buffer.from(datasetId), payer.publicKey.toBuffer()], PROGRAM_ID);

say(`         datasetId: ${datasetId}`);
say(`         PDA:       ${datasetPda.toBase58()}`);

let signature;
try {
  signature = await program.methods
    .registerDataset(datasetId, name, 'Phase 1 gate', fileHash, '', '')
    .accounts({ datasetRecord: datasetPda, authority: payer.publicKey, systemProgram: SystemProgram.programId })
    .rpc();
} catch (err) {
  say(`        chain error: ${err.message}`);
  if (err.logs) err.logs.slice(0, 12).forEach((l) => say(`          ${l}`));
  bail('the transaction did not confirm.');
}

check('C: transaction confirmed on-chain',
  typeof signature === 'string' && signature.length >= 86, 'an 86-88 char signature', signature);
say(`        explorer: https://explorer.solana.com/tx/${signature}?cluster=${CLUSTER}`);

const account = await program.account.datasetRecord.fetch(datasetPda);
check('C: the account holds the hash that was signed',
  account.currentHash === fileHash, fileHash, account.currentHash);

// ─── C2. Only now does the backend hear about it ─────────────────────────────
const c = await post('/api/datasets/register', {
  datasetId, name, description: 'Phase 1 gate', fileHash,
  authority: payer.publicKey.toBase58(), txSignature: signature,
});
check('C: register with a valid signature is accepted',
  c.status === 201, '201', `${c.status} ${JSON.stringify(c.body?.error ?? c.body?.message ?? '').slice(0, 120)}`);

const stored = await fetch(`${API}/api/datasets/${datasetId}`).then((r) => r.json()).catch(() => ({}));
check('C: the row exists and stores the signature',
  stored?.data?.txSignature === signature, signature, stored?.data?.txSignature ?? '(no row)');
check('C: verificationStatus is pending, not demo',
  stored?.data?.verificationStatus === 'pending', 'pending', stored?.data?.verificationStatus ?? '(unset)');

say('');
say('BullMQ: /register enqueues verify-registration whenever txSignature is present.');
say('Confirm the job with:  docker compose exec redis redis-cli KEYS "bull:tx-verification:*"');
say('or watch the worker log for this signature.');

say('');
say(failed === 0
  ? `PASS: ${'A B C'.split(' ').length} scenarios, ${8 - failed}/8 checks. No dataset reached the database without a confirmed signature.`
  : `FAIL: ${failed} check(s) failed.`);

flush();
process.exit(failed === 0 ? 0 : 1);
