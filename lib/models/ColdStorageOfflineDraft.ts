import mongoose, { Document, Model, Schema } from 'mongoose';

export type ColdStorageOfflineDraftType = 'COLD_INWARD' | 'COLD_OUTWARD';

export interface IColdStorageOfflineDraft extends Document<string> {
  _id: string;
  userId: mongoose.Types.ObjectId;
  type: ColdStorageOfflineDraftType;
  payload: Record<string, unknown>;
  status: 'DRAFT' | 'SUBMITTED';
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

const ColdStorageOfflineDraftSchema = new Schema<IColdStorageOfflineDraft>(
  {
    _id: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['COLD_INWARD', 'COLD_OUTWARD'], required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    status: { type: String, enum: ['DRAFT', 'SUBMITTED'], default: 'DRAFT', required: true },
    revision: { type: Number, default: 1, min: 1, required: true },
  },
  { timestamps: true, versionKey: false, collection: 'coldStorageOfflineDrafts' },
);

ColdStorageOfflineDraftSchema.index({ userId: 1, status: 1, updatedAt: -1 });

const ColdStorageOfflineDraft: Model<IColdStorageOfflineDraft> =
  mongoose.models.ColdStorageOfflineDraft ||
  mongoose.model<IColdStorageOfflineDraft>('ColdStorageOfflineDraft', ColdStorageOfflineDraftSchema);

export default ColdStorageOfflineDraft;
