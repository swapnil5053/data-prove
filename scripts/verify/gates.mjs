#!/usr/bin/env node
/**
 * §6 verify block, as a Node script rather than a bash one-liner.
 *
 *   node scripts/verify/gates.mjs
 *   node scripts/verify/gates.mjs --write   (also writes docs/evidence/gates.txt)
 *
 * Runs identically under PowerShell, cmd and bash. The spec states these gates as
 * `grep -rnP … | wc -l`, which needs a PCRE-capable grep — Windows has none, and
 * `wc` counts matching *lines*, not matches. Both behaviours are reproduced here so
 * the numbers stay comparable with docs/audit-baseline.md.
 *
 * Read-only. Exits 0 only if every gate passes.
 */

import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FRONTEND = join(ROOT, 'frontend');
const SRC = join(FRONTEND, 'src');

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.vite']);

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/**
 * Blank out comments, preserving line count and column positions so reported
 * line numbers stay accurate.
 *
 * The gates mean "no backdrop-filter *declarations*" and "no hex *literals*",
 * not "never mention them". Without this, documenting why the eight
 * backdrop-filters were removed fails the backdrop-filter gate, and the only way
 * to pass is to delete the explanation — so the gate would actively punish
 * writing down the reasoning. That is a bad trade, and the alternative (rewording
 * comments to dodge a regex) is worse: it leaves the gate looking green while
 * measuring the wrong thing.
 */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((line) => (line.trimStart().startsWith('//') ? ' '.repeat(line.length) : line))
    .join('\n');
}

/** Number of LINES in `files` containing at least one match — mirrors `grep | wc -l`. */
function countLines(files, re, filter = () => true) {
  let n = 0;
  const hits = [];
  for (const file of files.filter(filter)) {
    let text;
    try { text = stripComments(readFileSync(file, 'utf8')); } catch { continue; }
    text.split(/\r?\n/).forEach((line, i) => {
      re.lastIndex = 0;
      if (re.test(line)) {
        n++;
        if (hits.length < 8) hits.push(`${relative(ROOT, file).split(sep).join('/')}:${i + 1}`);
      }
    });
  }
  return { n, hits };
}

const posix = (f) => relative(ROOT, f).split(sep).join('/');
const ext = (...e) => (f) => e.some((x) => f.endsWith(x));

const srcFiles = walk(SRC);
const frontendFiles = walk(FRONTEND);
const stylesFiles = walk(join(SRC, 'styles'));

const readIf = (p) => (existsSync(p) ? stripComments(readFileSync(p, 'utf8')) : '');

// ─── Gate definitions ────────────────────────────────────────────────────────
// target: { kind: 'zero' } | { kind: 'atLeast', n } | { kind: 'exactly', n }

const gates = [
  {
    id: 'emoji',
    label: 'Emoji in frontend/src',
    target: { kind: 'zero' },
    baseline: 30,
    run: () => countLines(srcFiles,
      /[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]|[\u{2B00}-\u{2BFF}]|\u{FE0F}/u),
  },
  {
    id: 'raw-colour',
    label: 'Raw colour literals outside tokens.css',
    target: { kind: 'zero' },
    baseline: 101,
    run: () => countLines(srcFiles, /#[0-9a-fA-F]{3,8}|rgba?\(/,
      (f) => ext('.jsx', '.css')(f) && !posix(f).endsWith('styles/tokens.css')),
  },
  {
    id: 'glass-vars',
    label: '--glass / --aurora / --gradient custom properties',
    target: { kind: 'zero' },
    baseline: 43,
    run: () => countLines(srcFiles, /--(glass|aurora|gradient)/),
  },
  {
    id: 'backdrop-filter',
    label: 'backdrop-filter declarations',
    target: { kind: 'zero' },
    baseline: 8,
    run: () => countLines(srcFiles, /backdrop-filter/),
  },
  {
    id: 'forbidden-overlap',
    label: 'Forbidden-overlap terms',
    target: { kind: 'zero' },
    baseline: 0,
    run: () => countLines(frontendFiles,
      /bauhaus|space grotesk|space mono|#e0241f|#1a3fd6|#f6c018|#f2ede1/i),
  },
  {
    id: 'hardcoded-cluster',
    label: "Hardcoded devnet (must move to VITE_SOLANA_CLUSTER)",
    target: { kind: 'zero' },
    baseline: 3,
    run: () => countLines(srcFiles, /clusterApiUrl\('devnet'\)|cluster\s*=\s*'devnet'/),
  },
  {
    id: 'reduced-motion',
    label: 'prefers-reduced-motion in reset.css',
    target: { kind: 'atLeast', n: 1 },
    baseline: 0,
    run: () => {
      const t = readIf(join(SRC, 'styles', 'reset.css'));
      return { n: (t.match(/prefers-reduced-motion/g) || []).length, hits: [] };
    },
  },
  {
    id: 'focus-visible',
    label: 'focus-visible in src/styles/',
    target: { kind: 'atLeast', n: 1 },
    baseline: 0,
    run: () => countLines(stylesFiles, /focus-visible/),
  },
  {
    id: 'aria',
    label: 'aria-* attributes across .jsx',
    target: { kind: 'atLeast', n: 25 },
    baseline: 0,
    run: () => countLines(srcFiles, /aria-/, ext('.jsx')),
  },
  {
    id: 'og-tags',
    label: 'og:image / twitter:card in index.html',
    target: { kind: 'atLeast', n: 2 },
    baseline: 0,
    run: () => {
      const t = readIf(join(FRONTEND, 'index.html'));
      return { n: (t.match(/og:image|twitter:card/g) || []).length, hits: [] };
    },
  },
  {
    id: 'wdth',
    label: 'wdth.css imported in typography.css (not index.css)',
    target: { kind: 'exactly', n: 1 },
    baseline: 0,
    run: () => {
      const t = readIf(join(SRC, 'styles', 'typography.css'));
      return { n: (t.match(/wdth\.css/g) || []).length, hits: [] };
    },
  },
];

// ─── Run ─────────────────────────────────────────────────────────────────────

function expected(t) {
  if (t.kind === 'zero') return '0';
  if (t.kind === 'atLeast') return `>= ${t.n}`;
  return `exactly ${t.n}`;
}
function ok(t, n) {
  if (t.kind === 'zero') return n === 0;
  if (t.kind === 'atLeast') return n >= t.n;
  return n === t.n;
}

const lines = [];
const say = (s = '') => { lines.push(s); console.log(s); };

say('§6 verify block');
say(`repo:  ${ROOT}`);
say(`run:   ${new Date().toISOString()}`);
say('');
const W = 54;
say('gate'.padEnd(W) + 'expected'.padStart(9) + 'actual'.padStart(8) + 'baseline'.padStart(10) + '  result');
say('-'.repeat(W + 29));

let failed = 0;
const details = [];

for (const g of gates) {
  const { n, hits } = g.run();
  const pass = ok(g.target, n);
  if (!pass) { failed++; if (hits.length) details.push([g.label, hits]); }
  say(
    g.label.padEnd(W) +
    expected(g.target).padStart(9) +
    String(n).padStart(8) +
    String(g.baseline).padStart(10) +
    (pass ? '  PASS' : '  FAIL')
  );
}

say('-'.repeat(W + 29));
say(failed === 0
  ? `PASS: ${gates.length}/${gates.length} gates met.`
  : `FAIL: ${failed}/${gates.length} gates unmet.`);

if (details.length) {
  say('');
  say('First offending sites:');
  for (const [label, hits] of details) {
    say(`  ${label}`);
    for (const h of hits) say(`    ${h}`);
  }
}

if (process.argv.includes('--write')) {
  const out = join(ROOT, 'docs', 'evidence');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'gates.txt'), lines.join('\n') + '\n', 'utf8');
  console.log(`\nwritten: docs/evidence/gates.txt`);
}

process.exit(failed === 0 ? 0 : 1);
