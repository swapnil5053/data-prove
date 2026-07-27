#!/usr/bin/env node
/**
 * Phase 0.5 gate — assert the installed IDL is a real Anchor 0.30+ artefact for
 * *this* program.
 *
 *   node scripts/verify/idl.mjs
 *   node scripts/verify/idl.mjs --write
 *
 * Read-only. Exits 0 only if every check passes.
 *
 * The discriminator checks are the point of this file. Anchor derives them as
 * sha256("global:" + snake_case_instruction)[0..8] and sha256("account:" + StructName)[0..8],
 * which is fully deterministic — so rather than trusting that the array in the JSON is
 * right, we recompute all six from the names and compare byte for byte. A hand-edited
 * or half-converted IDL fails here instead of at runtime on devnet.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const IDL_PATH = join(ROOT, 'frontend', 'src', 'idl', 'research_provenance.json');
const PROGRAM_ID = 'FkZMTjPTBGEWUE2dRbdjLBjMPE4gwt1ME5G3qg3xbXwK';

const EXPECTED_INSTRUCTIONS = [
  'register_dataset', 'update_dataset', 'transfer_ownership', 'deactivate_dataset',
];
const EXPECTED_ACCOUNTS = ['DatasetRecord', 'VersionRecord'];

const log = [];
const say = (s = '') => { log.push(s); console.log(s); };
let failed = 0;
const check = (name, pass, expected, actual) => {
  if (!pass) failed++;
  say(`${pass ? 'PASS' : 'FAIL'}  ${name}`);
  say(`        expected: ${expected}`);
  say(`        actual:   ${actual}`);
};

const disc = (prefix, name) => [...createHash('sha256').update(prefix + name).digest().subarray(0, 8)];
const eq = (a, b) => Array.isArray(a) && a.length === b.length && a.every((v, i) => v === b[i]);
/** Anchor emits snake_case instruction names; tolerate camelCase when reporting. */
const snake = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

say('Phase 0.5 gate — IDL');
say(`file:  frontend/src/idl/research_provenance.json`);
say(`run:   ${new Date().toISOString()}`);
say('');

if (!existsSync(IDL_PATH)) {
  say('FAIL  IDL is missing entirely.');
  say('        expected: frontend/src/idl/research_provenance.json');
  say('        actual:   file not found — run node scripts/idl/build-idl.mjs');
  process.exit(1);
}

const idl = JSON.parse(readFileSync(IDL_PATH, 'utf8'));

// ─── 1. address ──────────────────────────────────────────────────────────────
// Anchor 0.30+ carries the program address in the IDL; the client reads it from
// there rather than from a constructor argument, so a wrong value here silently
// redirects every instruction.
check('idl.address is the deployed program',
  idl.address === PROGRAM_ID, PROGRAM_ID, idl.address ?? '(absent — pre-0.30 IDL)');

// ─── 2. metadata.spec ────────────────────────────────────────────────────────
check('idl.metadata.spec is present',
  typeof idl.metadata?.spec === 'string' && idl.metadata.spec.length > 0,
  'a spec string, e.g. "0.1.0"',
  idl.metadata?.spec ?? '(absent — pre-0.30 IDL)');

// ─── 3. legacy-format detection ──────────────────────────────────────────────
// A pre-0.30 IDL is recognisable by isMut/isSigner on accounts. Called out
// separately so the failure names the cause rather than just a missing field.
const legacy = JSON.stringify(idl).includes('"isMut"') || JSON.stringify(idl).includes('"isSigner"');
check('no legacy isMut/isSigner keys',
  !legacy, 'none (0.30+ uses writable/signer)', legacy ? 'present — this is a pre-0.30 IDL' : 'none');

// ─── 4. instruction set ──────────────────────────────────────────────────────
const ixNames = (idl.instructions ?? []).map((i) => snake(i.name)).sort();
check('instruction set matches the program',
  JSON.stringify(ixNames) === JSON.stringify([...EXPECTED_INSTRUCTIONS].sort()),
  [...EXPECTED_INSTRUCTIONS].sort().join(', '), ixNames.join(', ') || '(none)');

// ─── 5. instruction discriminators, recomputed ───────────────────────────────
for (const ix of idl.instructions ?? []) {
  const want = disc('global:', snake(ix.name));
  check(`discriminator: instruction ${ix.name}`,
    eq(ix.discriminator, want),
    `[${want}]  (sha256("global:${snake(ix.name)}")[0..8])`,
    Array.isArray(ix.discriminator) ? `[${ix.discriminator}]` : '(absent)');
}

// ─── 6. account discriminators, recomputed ───────────────────────────────────
const accNames = (idl.accounts ?? []).map((a) => a.name).sort();
check('account set matches the program',
  JSON.stringify(accNames) === JSON.stringify([...EXPECTED_ACCOUNTS].sort()),
  [...EXPECTED_ACCOUNTS].sort().join(', '), accNames.join(', ') || '(none)');

for (const acc of idl.accounts ?? []) {
  const want = disc('account:', acc.name);
  check(`discriminator: account ${acc.name}`,
    eq(acc.discriminator, want),
    `[${want}]  (sha256("account:${acc.name}")[0..8])`,
    Array.isArray(acc.discriminator) ? `[${acc.discriminator}]` : '(absent)');
}

say('');
say(failed === 0
  ? `PASS: IDL is a valid Anchor 0.30+ artefact for ${PROGRAM_ID}, all ` +
    `${(idl.instructions?.length ?? 0) + (idl.accounts?.length ?? 0)} discriminators verified ` +
    `against their recomputed sha256.`
  : `FAIL: ${failed} check(s) failed. Regenerate: node scripts/idl/build-idl.mjs`);

if (process.argv.includes('--write')) {
  mkdirSync(join(ROOT, 'docs', 'evidence'), { recursive: true });
  writeFileSync(join(ROOT, 'docs', 'evidence', 'phase-0.5-idl.txt'), log.join('\n') + '\n', 'utf8');
  console.log('\nwritten: docs/evidence/phase-0.5-idl.txt');
}

process.exit(failed === 0 ? 0 : 1);
