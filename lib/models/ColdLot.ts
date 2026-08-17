import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IColdLot extends Document {
  lotNo: string;
  warehouseId: mongoose.Types.ObjectId;
  clientId?: mongoose.Types.ObjectId;
  commodityId?: mongoose.Types.ObjectId;
  totalQuantityKg: number;
  remainingQuantityKg: number;
  status: 'ACTIVE' | 'CLOSED' | 'EXHAUSTED';
  batchId?: string;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ColdLotSchema: Schema = new Schema(
  {
    lotNo: { type: String, required: true, trim: true, index: true },
    warehouseId: { type: Schema.Types.ObjectId, ref: 'ColdWarehouse', required: true },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: false },
    commodityId: { type: Schema.Types.ObjectId, ref: 'ColdCommodity', required: false },
    totalQuantityKg: { type: Number, required: true, min: 0 },
    remainingQuantityKg: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['ACTIVE', 'CLOSED', 'EXHAUSTED'], default: 'ACTIVE' },
    batchId: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

ColdLotSchema.index({ warehouseId: 1, lotNo: 1 }, { unique: true });

const ColdLot: Model<IColdLot> = mongoose.models.ColdLot || mongoose.model<IColdLot>('ColdLot', ColdLotSchema);

export default ColdLot;
