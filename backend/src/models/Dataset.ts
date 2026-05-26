import { Schema, model } from 'mongoose';

export interface IDataset {
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
  txSignature: string;
  verificationStatus: 'pending' | 'verified' | 'demo' | 'failed';
}

const datasetSchema = new Schema<IDataset>({
  datasetId:          { type: String, required: true, unique: true, index: true },
  name:               { type: String, required: true, maxlength: 128 },
  description:        { type: String, default: '', maxlength: 2048 },
  currentHash:        { type: String, required: true },
  versionCount:       { type: Number, default: 1 },
  createdAt:          { type: Number, required: true },  // Unix timestamp (seconds)
  updatedAt:          { type: Number, required: true },
  ipfsCid:            { type: String, default: '' },
  metadataUri:        { type: String, default: '' },
  authority:          { type: String, required: true },  // wallet public key
  isActive:           { type: Boolean, default: true, index: true },
  txSignature:        { type: String, default: '' },
  verificationStatus: {
    type: String,
    enum: ['pending', 'verified', 'demo', 'failed'],
    default: 'demo',
    index: true,
  },
}, { versionKey: false });

datasetSchema.index({ currentHash: 1 });
datasetSchema.index({ isActive: 1, createdAt: -1 });
datasetSchema.index({ authority: 1, isActive: 1 });

export const Dataset = model<IDataset>('Dataset', datasetSchema);
export default Dataset;
