#!/usr/bin/env node
/**
 * Phase 1 gate — how many datasets exist with no on-chain anchor?
 *
 *   node scripts/verify/phase-1-mongo.mjs --write
 *
 * READ-ONLY. Issues no writes and no index changes. Runs identically under PowerShell,
 * cmd and bash.
 *
 *   MONGODB_URI   defaults to mongodb://localhost:27017
 *   MONGODB_DB    defaults to dataprove
 *
 * This is the most interesting number this session can surface. Until Phase 1 the
 * backend accepted `txSignature: txSignature || ''` on both write routes, and the
 * BullMQ enqueue was guarded by `if (txSignature && ...)` — so a dataset with no
 * signature was not only persisted, it was never queued for verification either.
 * Nothing would ever revisit it. This counts what that left behind.
 *
 * The script does not clean anything up. Deciding what to do with unanchored rows is a
 * judgement call about someone's research records, not something a script should make.
 */

import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// Resolve the driver out of backend/node_modules rather than requiring a second install.
const require = createRequire(join(ROOT, 'backend', 'package.json'));
const { MongoClient } = require('mongodb');

const URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB = process.env.MONGODB_DB || 'dataprove';

const log = [];
const say = (s = '') => { log.push(s); console.log(s); };

const SIG = /^[1-9A-HJ-NP-Za-km-z]{86,88}$/;

function flush() {
  if (!process.argv.includes('--write')) return;
  mkdirSync(join(ROOT, 'docs', 'evidence'), { recursive: true });
  writeFileSync(join(ROOT, 'docs', 'evidence', 'phase-1-mongo.txt'), log.join('\n') + '\n', 'utf8');
  console.log('\nwritten: docs/evidence/phase-1-mongo.txt');
}

const client = new MongoClient(URI, { serverSelectionTimeoutMS: 8000 });

try {
  await client.connect();
  const db = client.db(DB);
  const datasets = db.collection('datasets');
  const versions = db.collection('versions');

  const total = await datasets.countDocuments({});
  const totalVersions = await versions.countDocuments({});

  say('Phase 1 gate — unanchored records');
  say(`uri:   ${URI.replace(/\/\/[^@]*@/, '//<redacted>@')}`);
  say(`db:    ${DB}`);
  say(`run:   ${new Date().toISOString()}`);
  say('');

  // ── The count that matters ─────────────────────────────────────────────────
  const noSig = { $or: [{ txSignature: { $exists: false } }, { txSignature: '' }, { txSignature: null }] };
  const unanchored = await datasets.countDocuments(noSig);
  const anchored = total - unanchored;
  const demoStatus = await datasets.countDocuments({ verificationStatus: 'demo' });
  const demoAuthority = await datasets.countDocuments({ authority: /^DemoWallet/ });
  const unanchoredVersions = await versions.countDocuments(noSig);

  say(`datasets total:            ${total}`);
  say(`  with a txSignature:      ${anchored}`);
  say(`  WITHOUT a txSignature:   ${unanchored}`);
  say(`  verificationStatus=demo: ${demoStatus}`);
  say(`  authority DemoWallet_*:  ${demoAuthority}`);
  say(`versions total:            ${totalVersions}`);
  say(`  WITHOUT a txSignature:   ${unanchoredVersions}`);
  say('');

  // ── Shape check on the signatures that do exist ────────────────────────────
  const withSig = await datasets.find(
    { txSignature: { $nin: ['', null], $exists: true } },
    { projection: { datasetId: 1, txSignature: 1, verificationStatus: 1, _id: 0 } },
  ).toArray();
  const malformed = withSig.filter((d) => !SIG.test(d.txSignature));

  say(`${malformed.length === 0 ? 'PASS' : 'FAIL'}  every stored signature is well-formed base58`);
  say(`        expected: 0 malformed of ${withSig.length}`);
  say(`        actual:   ${malformed.length} malformed of ${withSig.length}`);
  malformed.slice(0, 5).forEach((d) => say(`        - ${d.datasetId}: ${JSON.stringify(d.txSignature)}`));
  say('');

  // ── Verification status distribution ───────────────────────────────────────
  const byStatus = await datasets.aggregate([
    { $group: { _id: '$verificationStatus', n: { $sum: 1 } } }, { $sort: { n: -1 } },
  ]).toArray();
  say('verificationStatus:');
  byStatus.forEach((r) => say(`  ${String(r._id ?? '(unset)').padEnd(12)} ${r.n}`));
  say('');

  // ── The unanchored rows themselves ─────────────────────────────────────────
  if (unanchored > 0) {
    const rows = await datasets.find(noSig, {
      projection: { datasetId: 1, name: 1, authority: 1, createdAt: 1, verificationStatus: 1, _id: 0 },
    }).limit(25).toArray();
    say(`The ${Math.min(25, unanchored)} most recent unanchored datasets:`);
    for (const r of rows) {
      const when = r.createdAt ? new Date(r.createdAt * 1000).toISOString().slice(0, 10) : '?';
      say(`  ${String(r.datasetId).padEnd(34)} ${when}  ${String(r.verificationStatus ?? '-').padEnd(9)} ${r.name}`);
    }
    say('');
    say('These predate the Phase 1 guards. The chain has no record of them, so their');
    say('hashes are attested by nothing but this database. Left in place deliberately:');
    say('deciding what happens to them is not a script\'s call.');
  }

  say('');
  say('After Phase 1, /register and /update both reject a request with no valid');
  say('txSignature, so this count can only go down.');
  say('');
  say(unanchored === 0
    ? `PASS: 0/${total} datasets lack an on-chain anchor.`
    : `RECORDED: ${unanchored}/${total} datasets lack an on-chain anchor.`);
} catch (err) {
  say(`FAIL: could not query Mongo — ${err.message}`);
  say('Set MONGODB_URI, or start the stack with docker compose -f docker-compose.dev.yml up -d');
  flush();
  await client.close().catch(() => {});
  process.exit(1);
}

flush();
await client.close();
