import mongoose from 'mongoose';
import Dataset, { IDataset } from '../models/Dataset.js';
import Version, { IVersion } from '../models/Version.js';
import { generateDatasetId } from '../utils/hash.js';

// ─── Real SHA-256 hashes (generated from descriptive seed strings) ─────────
const H = {
  GV1:  '045894df0a46ebac58f3bb5a10f28bc469968ddb08054b31b1917acb6cbc0be0',
  GV2:  '2ba28afc443ebcaf1a20ecc6ea2fbcdb0c65f99c2fc904bf1f8c0fab6cc59251',
  GV3:  '9a03d9a8541f506e746dceb2c645785581d8e9d1cbc38061d6357cf626698c32',
  CLV1: '7b80e092c62a817cb3e6fb22640a2a6f2f53f20d08b22a644b6c7c9f3079f398',
  CLV2: '5c632ae82555b705d9771f573d54644436337ac63aaf435782a2b64c20f9ea20',
  NV1:  'ad1e63318cdb8cf7f44098f9ca3a4c8144f4ac6dd3019f3333703f867b10baf9',
  PV1:  '3bd1e08d4e029dae31897bf83a3a16a04ec6d7a7b1eede074cc4e8bf0d00c42c',
  PV2:  '91ae0bc2a71bc146e1670780099f48a2f64d4a099f42b5e1ac3ad409e5f02383',
  PV3:  '6efa1038154dd46c280ab60825b07efdde422fdbe2ac86109bdf0396c606cb88',
  PV4:  'a34eaae8cff2b9363cbc248355ad4e7579bfd8d2e83d765314385b216bb6cd0c',
  PV5:  '2494143e294f16c3fceb069d0904c1295d2240a77b0e5f99de3cc013624baf4d',
  QV1:  'b0fddbcb1610b5522bc54cf91a7be974b0b41ae81d4e601206bb565b119f1647',
  QV2:  '087353abb57598a6c7e39a17f9eae36b2f5dc37653ac7ed00ad18946090875f9',
};

// ─── Demo seeder ───────────────────────────────────────────────────────────
export async function seedDemoData(): Promise<void> {
  const count = await Dataset.countDocuments();
  if (count > 0) return; // already seeded — skip

  const now = Math.floor(Date.now() / 1000);

  const demoDatasets = [
    {
      datasetId: 'ds_genomics_2024_001',
      name: 'Human Genome Variant Analysis Dataset',
      description: 'Comprehensive dataset of human genome variants from 10,000 participants across diverse populations. Includes SNPs, indels, and structural variants with phenotype associations.',
      currentHash: H.GV3,
      versionCount: 3,
      createdAt: now - 86400 * 30,
      updatedAt: now - 86400 * 2,
      ipfsCid: 'QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco',
      metadataUri: 'https://research.example.com/genomics/2024/001',
      authority: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
      isActive: true,
      verificationStatus: 'demo',
      txSignature: '',
    },
    {
      datasetId: 'ds_climate_model_2024',
      name: 'Global Climate Simulation Output v4.2',
      description: 'High-resolution climate model outputs for 2020-2100 under SSP2-4.5 scenario. Contains temperature, precipitation, sea level data at 25km grid resolution.',
      currentHash: H.CLV2,
      versionCount: 2,
      createdAt: now - 86400 * 60,
      updatedAt: now - 86400 * 10,
      ipfsCid: 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
      metadataUri: 'https://research.example.com/climate/2024/v4',
      authority: '5ZWj7a1f8tWkjBESHKgrLmXshuXxqeY9SYcfbshpAqPG',
      isActive: true,
      verificationStatus: 'demo',
      txSignature: '',
    },
    {
      datasetId: 'ds_neural_imaging_2024',
      name: 'fMRI Brain Connectivity Dataset',
      description: 'Resting-state fMRI data from 500 subjects with parcellated brain connectivity matrices. Includes demographic variables and cognitive test scores.',
      currentHash: H.NV1,
      versionCount: 1,
      createdAt: now - 86400 * 15,
      updatedAt: now - 86400 * 15,
      ipfsCid: 'QmZTR5bcpQD7cFgTorqxZDYaew1Wqgfbd2ud9QqGPAkK2V',
      metadataUri: 'https://research.example.com/neuro/fmri/2024',
      authority: '9aE2UhkgKLsqTqR3PJvwzNnHJq5v5dEj3nXBfM3jKP4k',
      isActive: true,
      verificationStatus: 'demo',
      txSignature: '',
    },
    {
      datasetId: 'ds_protein_fold_2024',
      name: 'Protein Structure Prediction Benchmark',
      description: 'Benchmark dataset for protein structure prediction containing 15,000 experimentally determined structures with AlphaFold2 predictions and RMSD comparisons.',
      currentHash: H.PV5,
      versionCount: 5,
      createdAt: now - 86400 * 90,
      updatedAt: now - 86400 * 1,
      ipfsCid: 'QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn',
      metadataUri: 'https://research.example.com/protein/2024/benchmark',
      authority: '3Mc6vR5BEgPGAkgqPLS8HjLfn5VwhVyKjRnGHJdqZzaB',
      isActive: true,
      verificationStatus: 'demo',
      txSignature: '',
    },
    {
      datasetId: 'ds_quantum_sim_2024',
      name: 'Quantum Computing Error Rate Dataset',
      description: 'Error rate measurements from 72-qubit quantum processor across 50,000 circuit executions. Includes gate fidelity data and noise characterization.',
      currentHash: H.QV2,
      versionCount: 2,
      createdAt: now - 86400 * 45,
      updatedAt: now - 86400 * 5,
      ipfsCid: 'QmPZ9gcCEpqKTo6aq61g2nXGUhM4iCL3ewB6LDXZCtioEB',
      metadataUri: 'https://research.example.com/quantum/2024/error-rates',
      authority: '6FoKg6F7H5MToYjVzjGpLfPfYXuHKApDfEwRo8WKDNR4',
      isActive: true,
      verificationStatus: 'demo',
      txSignature: '',
    },
  ];

  await Dataset.insertMany(demoDatasets);

  // Version chains — previousHash of each version = fileHash of prior version
  const allVersions = [
    // Genomics: GV1 → GV2 → GV3
    { datasetId: 'ds_genomics_2024_001', versionNumber: 1, previousHash: '',    fileHash: H.GV1,  changeDescription: 'Initial dataset upload — 10,000 participant genomes',                           updatedBy: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', timestamp: now - 86400 * 30, ipfsCid: 'QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco', txSignature: '' },
    { datasetId: 'ds_genomics_2024_001', versionNumber: 2, previousHash: H.GV1, fileHash: H.GV2,  changeDescription: 'Added phenotype association data for cardiovascular biomarkers',               updatedBy: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', timestamp: now - 86400 * 15, ipfsCid: 'QmYzg5p4BaZLwAd7LMLqGP6KLFiJnKLwHCnL72vedxjQkD', txSignature: '' },
    { datasetId: 'ds_genomics_2024_001', versionNumber: 3, previousHash: H.GV2, fileHash: H.GV3,  changeDescription: 'Incorporated structural variant calls using long-read sequencing',              updatedBy: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', timestamp: now - 86400 * 2,  ipfsCid: 'QmZxR5bcpQD7cFgTorqxZDYaew1Wqgfbd2ud9QqGPAkK2V', txSignature: '' },
    // Climate: CLV1 → CLV2
    { datasetId: 'ds_climate_model_2024', versionNumber: 1, previousHash: '',     fileHash: H.CLV1, changeDescription: 'Initial upload — SSP2-4.5 scenario base run',                                 updatedBy: '5ZWj7a1f8tWkjBESHKgrLmXshuXxqeY9SYcfbshpAqPG', timestamp: now - 86400 * 60, ipfsCid: 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG', txSignature: '' },
    { datasetId: 'ds_climate_model_2024', versionNumber: 2, previousHash: H.CLV1, fileHash: H.CLV2, changeDescription: 'Added ocean temperature depth profiles and ice sheet dynamics',                updatedBy: '5ZWj7a1f8tWkjBESHKgrLmXshuXxqeY9SYcfbshpAqPG', timestamp: now - 86400 * 10, ipfsCid: 'QmRwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG', txSignature: '' },
    // Neural: NV1 (single version)
    { datasetId: 'ds_neural_imaging_2024', versionNumber: 1, previousHash: '',    fileHash: H.NV1,  changeDescription: 'Initial fMRI dataset registration',                                            updatedBy: '9aE2UhkgKLsqTqR3PJvwzNnHJq5v5dEj3nXBfM3jKP4k', timestamp: now - 86400 * 15, ipfsCid: 'QmZTR5bcpQD7cFgTorqxZDYaew1Wqgfbd2ud9QqGPAkK2V', txSignature: '' },
    // Protein: PV1 → PV2 → PV3 → PV4 → PV5
    { datasetId: 'ds_protein_fold_2024', versionNumber: 1, previousHash: '',    fileHash: H.PV1, changeDescription: 'Initial benchmark set — 5,000 structures',                   updatedBy: '3Mc6vR5BEgPGAkgqPLS8HjLfn5VwhVyKjRnGHJdqZzaB', timestamp: now - 86400 * 90, ipfsCid: 'QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn', txSignature: '' },
    { datasetId: 'ds_protein_fold_2024', versionNumber: 2, previousHash: H.PV1, fileHash: H.PV2, changeDescription: 'Expanded to 10,000 structures with CASP15 targets',          updatedBy: '3Mc6vR5BEgPGAkgqPLS8HjLfn5VwhVyKjRnGHJdqZzaB', timestamp: now - 86400 * 70, ipfsCid: 'QmVNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn', txSignature: '' },
    { datasetId: 'ds_protein_fold_2024', versionNumber: 3, previousHash: H.PV2, fileHash: H.PV3, changeDescription: 'Added ESMFold predictions and TM-score comparisons',          updatedBy: '3Mc6vR5BEgPGAkgqPLS8HjLfn5VwhVyKjRnGHJdqZzaB', timestamp: now - 86400 * 40, ipfsCid: 'QmWNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn', txSignature: '' },
    { datasetId: 'ds_protein_fold_2024', versionNumber: 4, previousHash: H.PV3, fileHash: H.PV4, changeDescription: 'Full expansion to 15,000 structures with cryo-EM data',       updatedBy: '3Mc6vR5BEgPGAkgqPLS8HjLfn5VwhVyKjRnGHJdqZzaB', timestamp: now - 86400 * 15, ipfsCid: 'QmXNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn', txSignature: '' },
    { datasetId: 'ds_protein_fold_2024', versionNumber: 5, previousHash: H.PV4, fileHash: H.PV5, changeDescription: 'Added RMSD analysis pipeline outputs and comparison matrices', updatedBy: '3Mc6vR5BEgPGAkgqPLS8HjLfn5VwhVyKjRnGHJdqZzaB', timestamp: now - 86400 * 1,  ipfsCid: 'QmYNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn', txSignature: '' },
    // Quantum: QV1 → QV2
    { datasetId: 'ds_quantum_sim_2024', versionNumber: 1, previousHash: '',    fileHash: H.QV1, changeDescription: 'Initial error rate measurements — 25,000 circuit executions',                                     updatedBy: '6FoKg6F7H5MToYjVzjGpLfPfYXuHKApDfEwRo8WKDNR4', timestamp: now - 86400 * 45, ipfsCid: 'QmPZ9gcCEpqKTo6aq61g2nXGUhM4iCL3ewB6LDXZCtioEB', txSignature: '' },
    { datasetId: 'ds_quantum_sim_2024', versionNumber: 2, previousHash: H.QV1, fileHash: H.QV2, changeDescription: 'Extended to 50,000 executions with gate fidelity and noise characterization', updatedBy: '6FoKg6F7H5MToYjVzjGpLfPfYXuHKApDfEwRo8WKDNR4', timestamp: now - 86400 * 5,  ipfsCid: 'QmQZ9gcCEpqKTo6aq61g2nXGUhM4iCL3ewB6LDXZCtioEB', txSignature: '' },
  ];

  await Version.insertMany(allVersions);
  console.log('✅ Demo data seeded to MongoDB');
}

// ─── Service Methods ─────────────────────────────────────────────────────────

export async function getAllDatasets(): Promise<IDataset[]> {
  return Dataset.find({ isActive: true }).sort({ createdAt: -1 }).lean();
}

export async function getDataset(datasetId: string): Promise<IDataset | null> {
  return Dataset.findOne({ datasetId }).lean();
}

export async function getVersions(datasetId: string): Promise<IVersion[]> {
  return Version.find({ datasetId }).sort({ versionNumber: 1 }).lean();
}

export async function searchDatasets(query: string): Promise<IDataset[]> {
  const regex = new RegExp(query, 'i');
  return Dataset.find({
    isActive: true,
    $or: [{ name: regex }, { description: regex }, { datasetId: regex }],
  }).sort({ createdAt: -1 }).lean();
}

export async function getStats() {
  const [totalDatasets, totalVersions, researchers, verifiedCount] = await Promise.all([
    Dataset.countDocuments({ isActive: true }),
    Version.countDocuments(),
    Dataset.distinct('authority', { isActive: true }),
    Dataset.countDocuments({ isActive: true, verificationStatus: 'verified' }),
  ]);
  return {
    totalDatasets,
    totalVersions,
    totalResearchers: researchers.length,
    totalVerifications: verifiedCount,
  };
}

export interface RegisterPayload {
  name: string;
  description: string;
  fileHash: string;
  ipfsCid?: string;
  metadataUri?: string;
  authority: string;
  txSignature?: string;
  isAuthenticated?: boolean;
}

/**
 * Register a new dataset.
 */
export async function registerDataset({
  name,
  description,
  fileHash,
  ipfsCid = '',
  metadataUri = '',
  authority,
  txSignature = '',
  isAuthenticated = false,
}: RegisterPayload) {
  const datasetId = generateDatasetId(name, authority);
  const now = Math.floor(Date.now() / 1000);
  const verificationStatus = txSignature ? 'pending' : 'demo';

  const session = await mongoose.startSession();
  let record: any;
  try {
    await session.withTransaction(async () => {
      [record] = await Dataset.create([{
        datasetId,
        name,
        description,
        currentHash: fileHash,
        versionCount: 1,
        createdAt: now,
        updatedAt: now,
        ipfsCid,
        metadataUri,
        authority,
        isActive: true,
        txSignature,
        verificationStatus,
      }], { session });

      await Version.create([{
        datasetId,
        versionNumber: 1,
        previousHash: '',
        fileHash,
        changeDescription: 'Initial dataset registration',
        updatedBy: authority,
        timestamp: now,
        ipfsCid,
        txSignature,
      }], { session });
    });
  } finally {
    await session.endSession();
  }

  return { datasetId, record: record.toObject(), txSignature, verificationStatus };
}

export interface UpdatePayload {
  datasetId: string;
  newFileHash: string;
  changeDescription: string;
  ipfsCid?: string;
  authority: string;
  txSignature?: string;
}

/**
 * Publish a new version of an existing dataset.
 */
export async function updateDataset({
  datasetId,
  newFileHash,
  changeDescription,
  ipfsCid = '',
  authority,
  txSignature = '',
}: UpdatePayload) {
  const dataset = await Dataset.findOne({ datasetId, isActive: true });
  if (!dataset) throw new Error('Dataset not found or inactive');

  if (newFileHash === dataset.currentHash) {
    throw new Error('New file hash is identical to the current version — no changes detected');
  }

  if (dataset.authority !== authority) {
    throw new Error('Unauthorized: only the dataset owner can publish a new version');
  }

  const now = Math.floor(Date.now() / 1000);
  const newVersionNumber = dataset.versionCount + 1;
  const verificationStatus = txSignature ? 'pending' : 'demo';

  const session = await mongoose.startSession();
  let versionRecord: any;
  try {
    await session.withTransaction(async () => {
      [versionRecord] = await Version.create([{
        datasetId,
        versionNumber: newVersionNumber,
        previousHash: dataset.currentHash,
        fileHash: newFileHash,
        changeDescription: changeDescription || 'Version update',
        updatedBy: authority,
        timestamp: now,
        ipfsCid,
        txSignature,
      }], { session });

      await Dataset.updateOne(
        { datasetId },
        {
          $set: {
            currentHash: newFileHash,
            updatedAt: now,
            txSignature,
            verificationStatus,
          },
          $inc: { versionCount: 1 },
        },
        { session },
      );
    });
  } finally {
    await session.endSession();
  }

  return { versionRecord: versionRecord.toObject(), txSignature, verificationStatus };
}

export async function verifyHash(hash: string) {
  const currentMatch = await Dataset.findOne({ currentHash: hash, isActive: true }).lean();
  if (currentMatch) {
    return { found: true, isCurrent: true, dataset: currentMatch, versionNumber: currentMatch.versionCount };
  }

  const versionMatch = await Version.findOne({ fileHash: hash }).lean();
  if (versionMatch) {
    const dataset = await Dataset.findOne({ datasetId: versionMatch.datasetId }).lean();
    return { found: true, isCurrent: false, dataset, versionNumber: versionMatch.versionNumber, versionRecord: versionMatch };
  }

  return { found: false };
}

export async function transferOwnership(datasetId: string, newAuthority: string, authority: string) {
  const dataset = await Dataset.findOne({ datasetId, isActive: true });
  if (!dataset) throw new Error('Dataset not found or inactive');

  if (dataset.authority !== authority) {
    throw new Error('Unauthorized: only dataset owner can perform this action');
  }

  dataset.authority = newAuthority;
  dataset.updatedAt = Math.floor(Date.now() / 1000);
  await dataset.save();

  return { success: true, newAuthority };
}

export async function deactivateDataset(datasetId: string, authority: string) {
  const dataset = await Dataset.findOne({ datasetId, isActive: true });
  if (!dataset) throw new Error('Dataset not found or already inactive');

  if (dataset.authority !== authority) {
    throw new Error('Unauthorized: only dataset owner can perform this action');
  }

  dataset.isActive = false;
  dataset.updatedAt = Math.floor(Date.now() / 1000);
  await dataset.save();

  return { success: true };
}

export async function setVerificationStatus(datasetId: string, status: 'verified' | 'failed') {
  return Dataset.updateOne({ datasetId }, { $set: { verificationStatus: status } });
}
