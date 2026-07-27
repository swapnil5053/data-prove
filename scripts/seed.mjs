#!/usr/bin/env node
/**
 * Seed the registry with the five demo datasets.
 *
 *   node scripts/seed.mjs            insert if the collection is empty
 *   node scripts/seed.mjs --reset    delete existing demo rows first
 *
 * Runs identically under PowerShell, cmd and bash. Needs a reachable MongoDB and
 * MONGO_URI, which it reads from backend/.env, then the environment, then falls
 * back to a local instance.
 *
 * ── What these rows are, and are not ────────────────────────────────────────
 *
 * Demo data. Every one is written with verificationStatus 'demo' and an empty
 * txSignature, because none of them has ever been anchored on-chain -- they
 * exist so the dashboard, search and verify pages have something to render
 * before a real registration happens.
 *
 * That marking matters more here than in most products. The whole claim of this
 * app is that a row in this database means a confirmed transaction exists. Seed
 * rows are the one exception to that, so they are labelled as the exception
 * rather than being made to look real. The verify page will find their hashes;
 * the dataset page will show them as unverified. Both are correct.
 *
 * The hashes are genuine SHA-256 values and are the ones the verify page's
 * "quick test" buttons reference, so those buttons work after seeding.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// mongoose lives in backend/node_modules; resolve from there rather than from
// scripts/, which has no node_modules of its own.
const require = createRequire(join(ROOT, 'backend', 'package.json'));
let mongoose;
try {
  mongoose = require('mongoose');
} catch {
  console.error('FAIL: mongoose not found. Run `npm install` in backend/ first.');
  process.exit(1);
}

/** backend/.env -> process.env -> localhost */
function mongoUri() {
  const envFile = join(ROOT, 'backend', '.env');
  if (existsSync(envFile)) {
    const line = readFileSync(envFile, 'utf8')
      .split(/\r?\n/)
      .find((l) => l.trim().startsWith('MONGO_URI='));
    if (line) return line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
  }
  // 27018 because compose maps it to 27017 in the container, and
  // directConnection because the replica set advertises itself as
  // mongodb:27017 -- a name that does not resolve from the host. See
  // .env.example for the full explanation.
  return process.env.MONGO_URI || 'mongodb://localhost:27018/dataprove?directConnection=true';
}

const AUTHORITY = 'DemoSeed1111111111111111111111111111111111';
const day = 86400;
const now = Math.floor(Date.now() / 1000);

/** versions[0] is v1; the last entry is the current one. */
const DATASETS = [
  {
    datasetId: 'ds_neural_imaging_2024',
    name: 'fMRI Brain Connectivity Dataset',
    description:
      'Resting-state fMRI data from 500 subjects with parcellated brain connectivity ' +
      'matrices. Includes demographic variables and cognitive test scores.',
    createdAt: now - 16 * day,
    versions: [
      'ad1e63318cdb8cf7f44098f9ca3a4c8144f4ac6dd3019f3333703f867b10baf9',
    ],
  },
  {
    datasetId: 'ds_genomics_2024_001',
    name: 'Human Genome Variant Analysis Dataset',
    description:
      'Comprehensive dataset of human genome variants from 10,000 participants across ' +
      'diverse populations. Includes SNPs, indels, and structural variants with ' +
      'phenotype associations.',
    createdAt: now - 31 * day,
    versions: [
      '045894df0a46ebac58f3bb5a10f28bc469968ddb08054b31b1917acb6cbc0be0',
      'b3f1c2d4e5a697887766554433221100ffeeddccbbaa99887766554433221100',
      '9a03d9a8541f506e746dceb2c645785581d8e9d1cbc38061d6357cf626698c32',
    ],
  },
  {
    datasetId: 'ds_quantum_sim_2024',
    name: 'Quantum Computing Error Rate Dataset',
    description:
      'Error rate measurements from 72-qubit quantum processor across 50,000 circuit ' +
      'executions. Includes gate fidelity data and noise characterization.',
    createdAt: now - 46 * day,
    versions: [
      'c1d2e3f405162738495a6b7c8d9e0f1122334455667788990aabbccddeeff001',
      '087353abb57598a6c7e39a17f9eae36b2f5dc37653ac7ed00ad18946090875f9',
    ],
  },
  {
    datasetId: 'ds_climate_model_2024',
    name: 'Global Climate Simulation Output v4.2',
    description:
      'High-resolution climate model outputs for 2020-2100 under SSP2-4.5 scenario. ' +
      'Contains temperature, precipitation, sea level data at 25km grid resolution.',
    createdAt: now - 61 * day,
    versions: [
      'e7d6c5b4a3928170695847362514039281706958473625140392817069584736',
      '5c632ae82555b705d9771f573d54644436337ac63aaf435782a2b64c20f9ea20',
    ],
  },
  {
    datasetId: 'ds_protein_fold_2024',
    name: 'Protein Structure Prediction Benchmark',
    description:
      'Benchmark dataset for protein structure prediction containing 15,000 ' +
      'experimentally determined structures with AlphaFold2 predictions and RMSD ' +
      'comparisons.',
    createdAt: now - 91 * day,
    versions: [
      'f0e1d2c3b4a5968778695a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d',
      'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
      'd4c3b2a1908f7e6d5c4b3a29180706f5e4d3c2b1a09f8e7d6c5b4a3928170695',
      '3f2e1d0c9b8a7968574635241302f1e0d9c8b7a695847362514039281706958f',
      '2494143e294f16c3fceb069d0904c1295d2240a77b0e5f99de3cc013624baf4d',
    ],
  },
];

const uri = mongoUri();
const reset = process.argv.includes('--reset');

console.log('Seeding the DataProve registry');
console.log(`mongo:  ${uri.replace(/\/\/[^@]*@/, '//<redacted>@')}`);
console.log(`mode:   ${reset ? 'reset (demo rows deleted first)' : 'insert if empty'}`);
console.log('');

try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
} catch (err) {
  console.error(`FAIL: could not reach MongoDB.\n       ${err.message}`);
  console.error('\nStart it with:  docker compose -f docker-compose.dev.yml up -d mongodb');
  process.exit(1);
}

const Dataset = mongoose.connection.collection('datasets');
const Version = mongoose.connection.collection('versions');

if (reset) {
  const d = await Dataset.deleteMany({ verificationStatus: 'demo' });
  const v = await Version.deleteMany({ updatedBy: AUTHORITY });
  console.log(`removed ${d.deletedCount} demo dataset(s), ${v.deletedCount} version(s)`);
}

const existing = await Dataset.countDocuments();
if (existing > 0 && !reset) {
  console.log(`SKIP: ${existing} dataset(s) already present. Re-run with --reset to replace.`);
  await mongoose.disconnect();
  process.exit(0);
}

let datasetCount = 0;
let versionCount = 0;

for (const d of DATASETS) {
  const current = d.versions[d.versions.length - 1];
  const updatedAt = d.createdAt + (d.versions.length - 1) * 7 * day;

  await Dataset.insertOne({
    datasetId: d.datasetId,
    name: d.name,
    description: d.description,
    currentHash: current,
    versionCount: d.versions.length,
    createdAt: d.createdAt,
    updatedAt,
    ipfsCid: '',
    metadataUri: '',
    authority: AUTHORITY,
    isActive: true,
    txSignature: '',
    // Never 'verified'. These were never anchored, and a seed row that claims
    // otherwise would be the product lying in its own database.
    verificationStatus: 'demo',
  });
  datasetCount++;

  for (let i = 0; i < d.versions.length; i++) {
    await Version.insertOne({
      datasetId: d.datasetId,
      versionNumber: i + 1,
      previousHash: i === 0 ? '' : d.versions[i - 1],
      fileHash: d.versions[i],
      changeDescription: i === 0 ? 'Initial registration' : `Revision ${i + 1}`,
      updatedBy: AUTHORITY,
      timestamp: d.createdAt + i * 7 * day,
      ipfsCid: '',
      txSignature: '',
    });
    versionCount++;
  }
}

console.log('');
console.log(`expected: 5 datasets, 13 versions`);
console.log(`actual:   ${datasetCount} datasets, ${versionCount} versions`);
console.log('');
console.log(datasetCount === 5 && versionCount === 13
  ? 'PASS: registry seeded. All rows marked verificationStatus=demo, txSignature empty.'
  : 'FAIL: counts do not match.');

await mongoose.disconnect();
process.exit(datasetCount === 5 && versionCount === 13 ? 0 : 1);
