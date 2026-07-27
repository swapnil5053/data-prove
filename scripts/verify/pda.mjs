#!/usr/bin/env node
/**
 * Phase 0.5 gate — the PDAs must derive identically before and after the Anchor change.
 *
 *   node scripts/verify/pda.mjs
 *   node scripts/verify/pda.mjs --write
 *
 * Read-only, no network. Exits 0 only if all 45 derivations match.
 *
 * Why this exists: PDA seeds are the one thing in Phase 0.5 that can break silently and
 * unrecoverably. Change them and nothing throws — you just derive a different address, and
 * every dataset already anchored on devnet becomes unreachable, with no error anywhere to
 * say so. `pda-golden.json` was generated from solana.js *before* the change, so this is a
 * genuine before/after comparison rather than a self-consistency check.
 *
 * If this fails, stop. Do not "fix" the golden file.
 *
 * The seeds are ["dataset", datasetId, authority] and ["version", datasetId, u32 LE], and
 * getDatasetPda takes two arguments. Other builds of this project use a one-argument
 * dataset PDA; adopting that shape is precisely the failure this guards.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { PROGRAM_ID, getDatasetPda, getVersionPda } from '../../frontend/src/services/pda.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Resolved from frontend/, not from here. The dependency lives in
 * frontend/node_modules and this script sits in scripts/verify/, so a bare
 * `import from '@solana/web3.js'` makes Node walk up from scripts/ to the repo
 * root, find no node_modules, and fail — even though the package is installed
 * two directories away. Anchoring resolution at frontend/package.json is the
 * portable fix; hardcoding a path into node_modules is not.
 */
const require = createRequire(join(ROOT, 'frontend', 'package.json'));
const { PublicKey } = require('@solana/web3.js');
const golden = JSON.parse(readFileSync(join(ROOT, 'scripts', 'verify', 'pda-golden.json'), 'utf8'));

const log = [];
const say = (s = '') => { log.push(s); console.log(s); };

say('Phase 0.5 gate — PDA derivation');
say(`golden: scripts/verify/pda-golden.json (generated ${golden.generatedAt})`);
say(`run:    ${new Date().toISOString()}`);
say('');

let failed = 0;
const mismatches = [];

// ─── program id ──────────────────────────────────────────────────────────────
const idOk = PROGRAM_ID.toBase58() === golden.programId;
if (!idOk) failed++;
say(`${idOk ? 'PASS' : 'FAIL'}  program id`);
say(`        expected: ${golden.programId}`);
say(`        actual:   ${PROGRAM_ID.toBase58()}`);
say('');

// ─── dataset PDAs ────────────────────────────────────────────────────────────
let dsOk = 0;
for (const row of golden.dataset) {
  const actual = getDatasetPda(row.datasetId, new PublicKey(row.authority)).toBase58();
  if (actual === row.pda) dsOk++;
  else mismatches.push(`dataset  id=${row.datasetId} authority=${row.authority}\n` +
                       `           expected ${row.pda}\n           actual   ${actual}`);
}
const dsPass = dsOk === golden.dataset.length;
if (!dsPass) failed++;
say(`${dsPass ? 'PASS' : 'FAIL'}  dataset PDAs, seeds ["dataset", datasetId, authority]`);
say(`        expected: ${golden.dataset.length}/${golden.dataset.length} identical`);
say(`        actual:   ${dsOk}/${golden.dataset.length} identical`);

// ─── version PDAs ────────────────────────────────────────────────────────────
let vOk = 0;
for (const row of golden.version) {
  const actual = getVersionPda(row.datasetId, row.versionNumber).toBase58();
  if (actual === row.pda) vOk++;
  else mismatches.push(`version  id=${row.datasetId} v=${row.versionNumber}\n` +
                       `           expected ${row.pda}\n           actual   ${actual}`);
}
const vPass = vOk === golden.version.length;
if (!vPass) failed++;
say(`${vPass ? 'PASS' : 'FAIL'}  version PDAs, seeds ["version", datasetId, u32 LE]`);
say(`        expected: ${golden.version.length}/${golden.version.length} identical`);
say(`        actual:   ${vOk}/${golden.version.length} identical`);

if (mismatches.length) {
  say('');
  say('Mismatches:');
  mismatches.slice(0, 10).forEach((m) => say(`  ${m}`));
  say('');
  say('STOP. A changed derivation orphans every existing on-chain record.');
  say('Do not update pda-golden.json to make this pass.');
}

say('');
const total = golden.dataset.length + golden.version.length;
say(failed === 0
  ? `PASS: ${total}/${total} PDAs derive identically to the pre-change implementation.`
  : `FAIL: ${failed} group(s) differ.`);

if (process.argv.includes('--write')) {
  mkdirSync(join(ROOT, 'docs', 'evidence'), { recursive: true });
  writeFileSync(join(ROOT, 'docs', 'evidence', 'phase-0.5-pda.txt'), log.join('\n') + '\n', 'utf8');
  console.log('\nwritten: docs/evidence/phase-0.5-pda.txt');
}

process.exit(failed === 0 ? 0 : 1);
