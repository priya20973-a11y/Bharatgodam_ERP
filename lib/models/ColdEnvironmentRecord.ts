import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IColdEnvironmentRecord extends Document {
  warehouseId: mongoose.Types.ObjectId;
  chamberNo: number;
  floorNo: number;
  temperature: number;
  moisture: number;
  recordedAt: Date;
  notes?: string;
  userId?: mongoose.Types.ObjectId;
  userEmail?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ColdEnvironmentRecordSchema: Schema = new Schema(
  {
    warehouseId: { type: Schema.Types.ObjectId, ref: 'ColdWarehouse', required: true },
    chamberNo: { type: Number, required: true },
    floorNo: { type: Number, required: true },
    temperature: { type: Number, required: true },
    moisture: { type: Number, required: true },
    recordedAt: { type: Date, required: true },
    notes: { type: String, required: false },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    userEmail: { type: String, required: false },
  },
  { timestamps: true }
);

const ColdEnvironmentRecord: Model<IColdEnvironmentRecord> =
  mongoose.models.ColdEnvironmentRecord || mongoose.model<IColdEnvironmentRecord>('ColdEnvironmentRecord', ColdEnvironmentRecordSchema);

export default ColdEnvironmentRecord;
