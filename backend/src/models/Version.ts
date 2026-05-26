import { Schema, model } from 'mongoose';

export interface IVersion {
  datasetId: string;
  versionNumber: number;
  previousHash: string;
  fileHash: string;
  changeDescription: string;
  updatedBy: string;
  timestamp: number;
  ipfsCid: string;
  txSignature: string;
}

const versionSchema = new Schema<IVersion>({
  datasetId:         { type: String, required: true, index: true },
  versionNumber:     { type: Number, required: true },
  previousHash:      { type: String, default: '' },
  fileHash:          { type: String, required: true },
  changeDescription: { type: String, default: '', maxlength: 1024 },
  updatedBy:         { type: String, required: true },
  timestamp:         { type: Number, required: true }, // Unix timestamp (seconds)
  ipfsCid:           { type: String, default: '' },
  txSignature:       { type: String, default: '' },
}, { versionKey: false });

versionSchema.index({ datasetId: 1, versionNumber: 1 });
versionSchema.index({ fileHash: 1 });

export const Version = model<IVersion>('Version', versionSchema);
export default Version;
