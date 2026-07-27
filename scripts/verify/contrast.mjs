#!/usr/bin/env node
/**
 * Contrast gate — verify the section 3.3 table against what tokens.css actually says.
 *
 *   node scripts/verify/contrast.mjs
 *   node scripts/verify/contrast.mjs --write
 *
 * Read-only, pure computation, no browser. Parses the real token values out of
 * tokens.css rather than restating them, so editing a token and not re-running this
 * is caught the next time it runs, and a token that drifts from its documented ratio
 * cannot go unnoticed.
 *
 * WCAG 2.2 relative luminance and contrast, per the definitions in the spec.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CSS = readFileSync(join(ROOT, 'frontend', 'src', 'styles', 'tokens.css'), 'utf8');

// ─── Parse ───────────────────────────────────────────────────────────────────
/** Pull `--name: #hex;` pairs from a single block. */
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function block(selector) {
  const re = new RegExp(`${escapeRe(selector)}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm');
  const body = re.exec(CSS)?.[1];
  if (body === undefined) throw new Error(`tokens.css has no ${selector} block`);
  const out = {};
  for (const m of body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) out[m[1]] = m[2];
  if (Object.keys(out).length === 0) throw new Error(`no colour tokens found in ${selector}`);
  return out;
}
const light = block(':root');
const darkOverrides = block('[data-theme="dark"]');
// Dark inherits anything it does not override, exactly as the cascade does.
const dark = { ...light, ...darkOverrides };

// A dark block that overrode nothing would silently make every dark check a
// duplicate of its light counterpart, which is the failure this catches.
for (const k of ['canvas', 'fg', 'accent', 'edge-strong']) {
  if (darkOverrides[k] === undefined) throw new Error(`[data-theme="dark"] does not override --${k}`);
}

// ─── WCAG ────────────────────────────────────────────────────────────────────
function srgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}
const lum = (hex) => {
  const [r, g, b] = srgb(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

// ─── The table from section 3.3, with the minimum each pairing must clear ────
const PAIRINGS = [
  { label: 'fg / canvas',                fg: 'fg',          bg: 'canvas', min: 4.5,  spec: [13.49, 14.95] },
  { label: 'fg-muted / canvas',          fg: 'fg-muted',    bg: 'canvas', min: 4.5,  spec: [6.16, 8.13] },
  { label: 'fg-subtle / canvas',         fg: 'fg-subtle',   bg: 'canvas', min: 4.5,  spec: [5.21, 6.57] },
  { label: 'accent / canvas',            fg: 'accent',      bg: 'canvas', min: 4.5,  spec: [6.34, 9.22] },
  { label: 'warn / canvas',              fg: 'warn',        bg: 'canvas', min: 4.5,  spec: [5.22, 8.19] },
  { label: 'danger / canvas',            fg: 'danger',      bg: 'canvas', min: 4.5,  spec: [5.57, 6.38] },
  { label: 'accent-fg / accent',         fg: 'accent-fg',   bg: 'accent', min: 4.5,  spec: [8.22, 8.74] },
  { label: 'edge-strong / canvas',       fg: 'edge-strong', bg: 'canvas', min: 3.0,  spec: [3.21, 3.36] },
  // Not in the spec table, but these combinations exist on real screens and are
  // where a system usually springs a leak.
  { label: 'fg / surface',               fg: 'fg',          bg: 'surface',        min: 4.5 },
  { label: 'fg-muted / surface',         fg: 'fg-muted',    bg: 'surface',        min: 4.5 },
  { label: 'fg / surface-sunken',        fg: 'fg',          bg: 'surface-sunken', min: 4.5 },
  { label: 'fg-muted / surface-sunken',  fg: 'fg-muted',    bg: 'surface-sunken', min: 4.5 },
  { label: 'accent / surface',           fg: 'accent',      bg: 'surface',        min: 4.5 },
  { label: 'danger / surface',           fg: 'danger',      bg: 'surface',        min: 4.5 },
  { label: 'focus / canvas',             fg: 'focus',       bg: 'canvas',         min: 3.0 },
];

const log = [];
const say = (s = '') => { log.push(s); console.log(s); };
let failed = 0, drifted = 0;

say('Contrast gate — WCAG 2.2 AA, computed from frontend/src/styles/tokens.css');
say(`run: ${new Date().toISOString()}`);
say('');
say('pairing                              min   light         dark          result');
say('-'.repeat(78));

for (const p of PAIRINGS) {
  const lv = ratio(light[p.fg], light[p.bg]);
  const dv = ratio(dark[p.fg], dark[p.bg]);
  const pass = lv >= p.min && dv >= p.min;
  if (!pass) failed++;

  // Does the computed value match what the spec table claims?
  const note = (v, want) => {
    if (want === undefined) return '     ';
    const off = Math.abs(v - want) > 0.015;
    if (off) drifted++;
    return off ? ` !=${want.toFixed(2)}` : '     ';
  };

  say(
    p.label.padEnd(35) +
    p.min.toFixed(1).padStart(5) +
    `   ${lv.toFixed(2).padStart(5)}${note(lv, p.spec?.[0])}` +
    `  ${dv.toFixed(2).padStart(5)}${note(dv, p.spec?.[1])}` +
    (pass ? '  PASS' : '  FAIL')
  );
}

say('-'.repeat(78));
// Report whichever text pairing is actually closest to its floor, rather than
// naming one in advance. The previous palette had fg-subtle pinned at exactly
// 4.50 and that hardcoded caveat stopped being true the moment the ramp changed.
{
  const textPairs = PAIRINGS.filter((p) => p.min === 4.5);
  let worst = null;
  for (const p of textPairs) {
    for (const [theme, set] of [['light', light], ['dark', dark]]) {
      const r = ratio(set[p.fg], set[p.bg]);
      if (!worst || r < worst.r) worst = { r, theme, label: p.label };
    }
  }
  say(`Tightest text pairing: ${worst.label} in ${worst.theme} at ${worst.r.toFixed(2)} against a 4.5 floor.`);
  say(worst.r < 5
    ? 'Under 5.0 — treat as no headroom: not below 14px, not on a sunken ground.'
    : 'Comfortable headroom across the set.');
}
say('');
say(failed === 0
  ? `PASS: ${PAIRINGS.length}/${PAIRINGS.length} pairings clear their minimum in both themes.`
  : `FAIL: ${failed}/${PAIRINGS.length} pairings below minimum.`);
if (drifted) say(`NOTE: ${drifted} computed value(s) differ from the section 3.3 table by more than 0.015.`);

if (process.argv.includes('--write')) {
  mkdirSync(join(ROOT, 'docs', 'evidence'), { recursive: true });
  writeFileSync(join(ROOT, 'docs', 'evidence', 'contrast.txt'), log.join('\n') + '\n', 'utf8');
  console.log('\nwritten: docs/evidence/contrast.txt');
}

process.exit(failed === 0 ? 0 : 1);
