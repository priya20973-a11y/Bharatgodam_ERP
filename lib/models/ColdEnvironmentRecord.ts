import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IColdEnvironmentRecord extends Document {
  warehouseId: mongoose.Types.ObjectId;
  chamberName: string;
  floorNo: number;
  date: Date;
  temperature: number;
  moisture: number;
  co2?: number;
  notes?: string;
  userId?: mongoose.Types.ObjectId;
  userEmail?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ColdEnvironmentRecordSchema: Schema = new Schema(
  {
    warehouseId: { type: Schema.Types.ObjectId, ref: 'ColdWarehouse', required: true },
    chamberName: { type: String, required: true },
    floorNo: { type: Number, required: true },
    date: { type: Date, required: true, default: Date.now },
    temperature: { type: Number, required: true },
    moisture: { type: Number, required: true, min: 0, max: 100 },
    co2: { type: Number, required: false, min: 0 },
    notes: { type: String, required: false },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    userEmail: { type: String, required: false },
  },
  { timestamps: true }
);

if (mongoose.models.ColdEnvironmentRecord) {
  delete mongoose.models.ColdEnvironmentRecord;
}

const ColdEnvironmentRecord: Model<IColdEnvironmentRecord> = mongoose.model<IColdEnvironmentRecord>('ColdEnvironmentRecord', ColdEnvironmentRecordSchema);

export default ColdEnvironmentRecord;
