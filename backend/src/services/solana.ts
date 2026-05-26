import { computeHash, generateDatasetId } from '../utils/hash.js';

export interface ISolanaDataset {
  datasetId: string;
  name: string;
  description: string;
  currentHash: string;
  versionCount: number;
  createdAt: number;
  updatedAt: number;
  ipfsCid: string;
  metadataUri: string;
  authority: string;
  isActive: boolean;
}

export interface ISolanaVersion {
  datasetId: string;
  versionNumber: number;
  previousHash: string;
  fileHash: string;
  changeDescription: string;
  updatedBy: string;
  timestamp: number;
  ipfsCid: string;
}

export class SolanaService {
  private datasets: Map<string, ISolanaDataset>;
  private versions: Map<string, ISolanaVersion[]>;

  constructor() {
    this.datasets = new Map();
    this.versions = new Map();
    this._seedDemoData();
  }

  private _seedDemoData() {
    const now = Math.floor(Date.now() / 1000);
    const demoDatasets: ISolanaDataset[] = [
      {
        datasetId: 'ds_genomics_2024_001',
        name: 'Human Genome Variant Analysis Dataset',
        description: 'Comprehensive dataset of human genome variants from 10,000 participants across diverse populations. Includes SNPs, indels, and structural variants with phenotype associations.',
        currentHash: 'a7f1d92e3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e',
        versionCount: 3,
        createdAt: now - 86400 * 30,
        updatedAt: now - 86400 * 2,
        ipfsCid: 'QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco',
        metadataUri: 'https://research.example.com/genomics/2024/001',
        authority: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
        isActive: true,
      },
      {
        datasetId: 'ds_climate_model_2024',
        name: 'Global Climate Simulation Output v4.2',
        description: 'High-resolution climate model outputs for 2020-2100 under SSP2-4.5 scenario. Contains temperature, precipitation, sea level data at 25km grid resolution.',
        currentHash: 'b8e2f03a4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1',
        versionCount: 2,
        createdAt: now - 86400 * 60,
        updatedAt: now - 86400 * 10,
        ipfsCid: 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
        metadataUri: 'https://research.example.com/climate/2024/v4',
        authority: '5ZWj7a1f8tWkjBESHKgrLmXshuXxqeY9SYcfbshpAqPG',
        isActive: true,
      },
      {
        datasetId: 'ds_neural_imaging_2024',
        name: 'fMRI Brain Connectivity Dataset',
        description: 'Resting-state fMRI data from 500 subjects with parcellated brain connectivity matrices. Includes demographic variables and cognitive test scores.',
        currentHash: 'c9f3a14b5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2',
        versionCount: 1,
        createdAt: now - 86400 * 15,
        updatedAt: now - 86400 * 15,
        ipfsCid: 'QmZTR5bcpQD7cFgTorqxZDYaew1Wqgfbd2ud9QqGPAkK2V',
        metadataUri: 'https://research.example.com/neuro/fmri/2024',
        authority: '9aE2UhkgKLsqTqR3PJvwzNnHJq5v5dEj3nXBfM3jKP4k',
        isActive: true,
      },
      {
        datasetId: 'ds_protein_fold_2024',
        name: 'Protein Structure Prediction Benchmark',
        description: 'Benchmark dataset for protein structure prediction containing 15,000 experimentally determined structures with AlphaFold2 predictions and RMSD comparisons.',
        currentHash: 'd0a4b25c6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3',
        versionCount: 5,
        createdAt: now - 86400 * 90,
        updatedAt: now - 86400 * 1,
        ipfsCid: 'QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn',
        metadataUri: 'https://research.example.com/protein/2024/benchmark',
        authority: '3Mc6vR5BEgPGAkgqPLS8HjLfn5VwhVyKjRnGHJdqZzaB',
        isActive: true,
      },
      {
        datasetId: 'ds_quantum_sim_2024',
        name: 'Quantum Computing Error Rate Dataset',
        description: 'Error rate measurements from 72-qubit quantum processor across 50,000 circuit executions. Includes gate fidelity data and noise characterization.',
        currentHash: 'e1b5c36d7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4',
        versionCount: 2,
        createdAt: now - 86400 * 45,
        updatedAt: now - 86400 * 5,
        ipfsCid: 'QmPZ9gcCEpqKTo6aq61g2nXGUhM4iCL3ewB6LDXZCtioEB',
        metadataUri: 'https://research.example.com/quantum/2024/error-rates',
        authority: '6FoKg6F7H5MToYjVzjGpLfPfYXuHKApDfEwRo8WKDNR4',
        isActive: true,
      },
    ];

    for (const ds of demoDatasets) {
      this.datasets.set(ds.datasetId, ds);
      this.versions.set(ds.datasetId, []);
    }

    // Add version history for genomics dataset
    this.versions.set('ds_genomics_2024_001', [
      {
        datasetId: 'ds_genomics_2024_001',
        versionNumber: 1,
        previousHash: '',
        fileHash: 'f2c6d47e8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5',
        changeDescription: 'Initial dataset upload — 10,000 participant genomes',
        updatedBy: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
        timestamp: now - 86400 * 30,
        ipfsCid: 'QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco',
      },
      {
        datasetId: 'ds_genomics_2024_001',
        versionNumber: 2,
        previousHash: 'f2c6d47e8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
        fileHash: '83a7e58f9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
        changeDescription: 'Added phenotype association data for cardiovascular biomarkers',
        updatedBy: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
        timestamp: now - 86400 * 15,
        ipfsCid: 'QmYzg5p4BaZLwAd7LMLqGP6KLFiJnKLwHCnL72vedxjQkD',
      },
      {
        datasetId: 'ds_genomics_2024_001',
        versionNumber: 3,
        previousHash: '83a7e58f9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
        fileHash: 'a7f1d92e3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e',
        changeDescription: 'Incorporated structural variant calls using long-read sequencing',
        updatedBy: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
        timestamp: now - 86400 * 2,
        ipfsCid: 'QmZxR5bcpQD7cFgTorqxZDYaew1Wqgfbd2ud9QqGPAkK2V',
      },
    ]);

    // Add versions for climate dataset
    this.versions.set('ds_climate_model_2024', [
      {
        datasetId: 'ds_climate_model_2024',
        versionNumber: 1,
        previousHash: '',
        fileHash: '74b8e9c0d1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b',
        changeDescription: 'Initial upload — SSP2-4.5 scenario base run',
        updatedBy: '5ZWj7a1f8tWkjBESHKgrLmXshuXxqeY9SYcfbshpAqPG',
        timestamp: now - 86400 * 60,
        ipfsCid: 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
      },
      {
        datasetId: 'ds_climate_model_2024',
        versionNumber: 2,
        previousHash: '74b8e9c0d1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b',
        fileHash: 'b8e2f03a4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1',
        changeDescription: 'Added ocean temperature depth profiles and ice sheet dynamics',
        updatedBy: '5ZWj7a1f8tWkjBESHKgrLmXshuXxqeY9SYcfbshpAqPG',
        timestamp: now - 86400 * 10,
        ipfsCid: 'QmRwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
      },
    ]);

    // Add versions for protein dataset
    this.versions.set('ds_protein_fold_2024', [
      {
        datasetId: 'ds_protein_fold_2024',
        versionNumber: 1,
        previousHash: '',
        fileHash: '11a4b25c6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3',
        changeDescription: 'Initial benchmark set — 5,000 structures',
        updatedBy: '3Mc6vR5BEgPGAkgqPLS8HjLfn5VwhVyKjRnGHJdqZzaB',
        timestamp: now - 86400 * 90,
        ipfsCid: 'QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn',
      },
      {
        datasetId: 'ds_protein_fold_2024',
        versionNumber: 2,
        previousHash: '11a4b25c6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3',
        fileHash: '22b5c36d7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4',
        changeDescription: 'Expanded to 10,000 structures with CASP15 targets',
        updatedBy: '3Mc6vR5BEgPGAkgqPLS8HjLfn5VwhVyKjRnGHJdqZzaB',
        timestamp: now - 86400 * 70,
        ipfsCid: 'QmVNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn',
      },
      {
        datasetId: 'ds_protein_fold_2024',
        versionNumber: 3,
        previousHash: '22b5c36d7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4',
        fileHash: '33c6d47e8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5',
        changeDescription: 'Added ESMFold predictions and TM-score comparisons',
        updatedBy: '3Mc6vR5BEgPGAkgqPLS8HjLfn5VwhVyKjRnGHJdqZzaB',
        timestamp: now - 86400 * 40,
        ipfsCid: 'QmWNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn',
      },
      {
        datasetId: 'ds_protein_fold_2024',
        versionNumber: 4,
        previousHash: '33c6d47e8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5',
        fileHash: '44d7e58f9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
        changeDescription: 'Full expansion to 15,000 structures with cryo-EM data',
        updatedBy: '3Mc6vR5BEgPGAkgqPLS8HjLfn5VwhVyKjRnGHJdqZzaB',
        timestamp: now - 86400 * 15,
        ipfsCid: 'QmXNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn',
      },
      {
        datasetId: 'ds_protein_fold_2024',
        versionNumber: 5,
        previousHash: '44d7e58f9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
        fileHash: 'd0a4b25c6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3',
        changeDescription: 'Added RMSD analysis pipeline outputs and comparison matrices',
        updatedBy: '3Mc6vR5BEgPGAkgqPLS8HjLfn5VwhVyKjRnGHJdqZzaB',
        timestamp: now - 86400 * 1,
        ipfsCid: 'QmYNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn',
      },
    ]);
  }

  /**
   * Register a new dataset
   */
  registerDataset({ name, description, fileHash, ipfsCid, metadataUri, authority }: {
    name: string;
    description: string;
    fileHash: string;
    ipfsCid?: string;
    metadataUri?: string;
    authority: string;
  }) {
    const datasetId = generateDatasetId(name, authority);
    const now = Math.floor(Date.now() / 1000);

    const record: ISolanaDataset = {
      datasetId,
      name,
      description,
      currentHash: fileHash,
      versionCount: 1,
      createdAt: now,
      updatedAt: now,
      ipfsCid: ipfsCid || '',
      metadataUri: metadataUri || '',
      authority,
      isActive: true,
    };

    this.datasets.set(datasetId, record);
    this.versions.set(datasetId, [{
      datasetId,
      versionNumber: 1,
      previousHash: '',
      fileHash,
      changeDescription: 'Initial dataset registration',
      updatedBy: authority,
      timestamp: now,
      ipfsCid: ipfsCid || '',
    }]);

    // Simulate transaction signature
    const txSignature = computeHash(`tx-${datasetId}-${now}`);

    return { datasetId, record, txSignature };
  }

  /**
   * Update a dataset with a new version
   */
  updateDataset({ datasetId, newFileHash, changeDescription, ipfsCid, authority }: {
    datasetId: string;
    newFileHash: string;
    changeDescription: string;
    ipfsCid?: string;
    authority: string;
  }) {
    const dataset = this.datasets.get(datasetId);
    if (!dataset) throw new Error('Dataset not found');
    if (dataset.authority !== authority) throw new Error('Unauthorized');

    const now = Math.floor(Date.now() / 1000);
    const newVersion = dataset.versionCount + 1;

    const versionRecord: ISolanaVersion = {
      datasetId,
      versionNumber: newVersion,
      previousHash: dataset.currentHash,
      fileHash: newFileHash,
      changeDescription,
      updatedBy: authority,
      timestamp: now,
      ipfsCid: ipfsCid || '',
    };

    // Update dataset
    dataset.currentHash = newFileHash;
    dataset.versionCount = newVersion;
    dataset.updatedAt = now;

    // Store version
    const versions = this.versions.get(datasetId) || [];
    versions.push(versionRecord);
    this.versions.set(datasetId, versions);

    const txSignature = computeHash(`tx-update-${datasetId}-${now}`);

    return { versionRecord, txSignature };
  }

  /**
   * Get dataset by ID
   */
  getDataset(datasetId: string): ISolanaDataset | null {
    return this.datasets.get(datasetId) || null;
  }

  /**
   * Get all datasets
   */
  getAllDatasets(): ISolanaDataset[] {
    return Array.from(this.datasets.values()).filter(d => d.isActive);
  }

  /**
   * Get version history for a dataset
   */
  getVersions(datasetId: string): ISolanaVersion[] {
    return this.versions.get(datasetId) || [];
  }

  /**
   * Verify a hash — returns matching dataset info if found
   */
  verifyHash(hash: string) {
    // Check current hashes
    for (const [, dataset] of this.datasets) {
      if (dataset.currentHash === hash) {
        return {
          found: true,
          isCurrent: true,
          dataset,
          versionNumber: dataset.versionCount,
        };
      }
    }

    // Check version history
    for (const [id, versions] of this.versions) {
      for (const v of versions) {
        if (v.fileHash === hash) {
          return {
            found: true,
            isCurrent: false,
            dataset: this.datasets.get(id),
            versionNumber: v.versionNumber,
            versionRecord: v,
          };
        }
      }
    }

    return { found: false };
  }

  /**
   * Search datasets by query
   */
  searchDatasets(query: string): ISolanaDataset[] {
    const q = query.toLowerCase();
    return this.getAllDatasets().filter(d =>
      d.name.toLowerCase().includes(q) ||
      d.description.toLowerCase().includes(q) ||
      d.datasetId.toLowerCase().includes(q)
    );
  }
}

export default SolanaService;
