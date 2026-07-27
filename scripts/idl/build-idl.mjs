#!/usr/bin/env node
/**
 * Phase 0.5 — regenerate the Anchor IDL from the program.
 *
 *   node scripts/idl/build-idl.mjs
 *
 * Runs identically under PowerShell, cmd and bash. Requires a local Solana/Anchor
 * toolchain, which is why this is operator-run rather than agent-run.
 *
 * The IDL is *emitted by anchor*, never hand-written. Anchor 0.30 changed the format:
 * every instruction and account now carries an explicit 8-byte discriminator array.
 * A hand-converted one that is wrong does not fail at build time — it fails at runtime,
 * as an unhelpful "instruction not found" or a silent deserialisation mismatch. So the
 * only supported path is to build it.
 *
 * Prerequisites:
 *   avm install 0.30.1 && avm use 0.30.1        (must match Cargo.toml's anchor-lang)
 *   solana --version                             (Agave/Solana CLI on PATH)
 *
 * Afterwards run:  node scripts/verify/idl.mjs && node scripts/verify/pda.mjs
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PROGRAM_ID = 'FkZMTjPTBGEWUE2dRbdjLBjMPE4gwt1ME5G3qg3xbXwK';
const REQUIRED_ANCHOR = '0.30.1';
const PROGRAM = 'research_provenance';

const log = [];
const say = (s = '') => { log.push(s); console.log(s); };
const die = (s) => { say(''); say(`FAIL: ${s}`); flush(); process.exit(1); };

function flush() {
  const out = join(ROOT, 'docs', 'evidence');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'phase-0.5-idl-build.txt'), log.join('\n') + '\n', 'utf8');
  console.log(`\nwritten: docs/evidence/phase-0.5-idl-build.txt`);
}

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, {
    cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32', ...opts,
  });
}

say('Phase 0.5 — IDL regeneration');
say(`repo:  ${ROOT}`);
say(`run:   ${new Date().toISOString()}`);
say('');

// ─── 1. Toolchain ────────────────────────────────────────────────────────────
say('1. Toolchain');
let anchorVersion;
try {
  anchorVersion = run('anchor', ['--version']).trim();
} catch {
  die('`anchor` is not on PATH. Install avm, then: avm install 0.30.1 && avm use 0.30.1');
}
say(`   expected: anchor-cli ${REQUIRED_ANCHOR}`);
say(`   actual:   ${anchorVersion}`);
if (!anchorVersion.includes(REQUIRED_ANCHOR)) {
  die(`anchor-cli must be ${REQUIRED_ANCHOR} to match anchor-lang in ` +
      `programs/${PROGRAM}/Cargo.toml. A different CLI generation emits a different ` +
      `IDL spec. Run: avm install ${REQUIRED_ANCHOR} && avm use ${REQUIRED_ANCHOR}`);
}
say('   PASS');
say('');

// ─── 2. Declared program id ──────────────────────────────────────────────────
// anchor writes idl.address from declare_id!, so these must already be correct or
// the emitted IDL points the client at the wrong program.
say('2. Declared program id');
const libRs = readFileSync(join(ROOT, 'programs', PROGRAM, 'src', 'lib.rs'), 'utf8');
const declared = libRs.match(/declare_id!\("([^"]+)"\)/)?.[1];
const anchorToml = readFileSync(join(ROOT, 'Anchor.toml'), 'utf8');
const inToml = anchorToml.match(new RegExp(`${PROGRAM}\\s*=\\s*"([^"]+)"`))?.[1];

say(`   expected (both):  ${PROGRAM_ID}`);
say(`   lib.rs declare_id: ${declared ?? '(not found)'}`);
say(`   Anchor.toml:       ${inToml ?? '(not found)'}`);
if (declared !== PROGRAM_ID || inToml !== PROGRAM_ID) {
  die('declare_id! and Anchor.toml must both be the deployed program id before building, ' +
      'or the emitted idl.address will be wrong.');
}
say('   PASS');
say('');

// ─── 3. Build ────────────────────────────────────────────────────────────────
say('3. anchor build');
const target = join(ROOT, 'target', 'idl', `${PROGRAM}.json`);
let built = false;
for (const args of [['idl', 'build'], ['build']]) {
  try {
    say(`   trying: anchor ${args.join(' ')}`);
    const out = run('anchor', args, { stdio: ['ignore', 'pipe', 'inherit'] });
    // `anchor idl build` prints the IDL to stdout; `anchor build` writes target/idl.
    if (args[0] === 'idl' && out.trim().startsWith('{')) {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, out, 'utf8');
    }
    if (existsSync(target)) { built = true; break; }
  } catch (err) {
    say(`   ${args.join(' ')} failed: ${String(err.message).split('\n')[0]}`);
  }
}
if (!built) die(`no IDL at target/idl/${PROGRAM}.json after building.`);
say(`   emitted: target/idl/${PROGRAM}.json`);
say('   PASS');
say('');

// ─── 4. Sanity-check before overwriting anything ─────────────────────────────
say('4. Emitted IDL shape');
const idl = JSON.parse(readFileSync(target, 'utf8'));
const problems = [];
if (idl.address !== PROGRAM_ID) problems.push(`address is ${idl.address}, expected ${PROGRAM_ID}`);
if (!idl.metadata?.spec) problems.push('metadata.spec is absent (pre-0.30 format)');
for (const ix of idl.instructions ?? [])
  if (!Array.isArray(ix.discriminator) || ix.discriminator.length !== 8)
    problems.push(`instruction ${ix.name} has no 8-byte discriminator`);
for (const acc of idl.accounts ?? [])
  if (!Array.isArray(acc.discriminator) || acc.discriminator.length !== 8)
    problems.push(`account ${acc.name} has no 8-byte discriminator`);

say(`   expected: address=${PROGRAM_ID}, metadata.spec present, 8-byte discriminators`);
say(`   actual:   address=${idl.address}, spec=${idl.metadata?.spec ?? '(absent)'}, ` +
    `${idl.instructions?.length ?? 0} instructions, ${idl.accounts?.length ?? 0} accounts`);
if (problems.length) { problems.forEach((p) => say(`   - ${p}`)); die('emitted IDL is not usable.'); }
say('   PASS');
say('');

// ─── 5. Install ──────────────────────────────────────────────────────────────
say('5. Install');
for (const dest of [join(ROOT, 'frontend', 'src', 'idl', `${PROGRAM}.json`),
                    join(ROOT, 'idl', `${PROGRAM}.json`)]) {
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(target, dest);
  say(`   wrote ${dest.slice(ROOT.length + 1).replace(/\\/g, '/')}`);
}
say('   PASS');
say('');
say('PASS: IDL regenerated and installed.');
say('Next: node scripts/verify/idl.mjs && node scripts/verify/pda.mjs');
flush();
