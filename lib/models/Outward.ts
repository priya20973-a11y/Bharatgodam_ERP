import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IOutward extends Document {
  clientId: mongoose.Types.ObjectId;
  commodityId: mongoose.Types.ObjectId;
  warehouseId: mongoose.Types.ObjectId;
  quantityMT: number;
  actualWeight?: number;
  netWeightLoss?: number;
  bagsCount?: number;
  stackNo?: string;
    lotNo?: string;
  gatePass?: string;
  partyName?: string;
  unit?: string;
  unitRate?: number;
  date: Date;
  userId?: mongoose.Types.ObjectId;
  userEmail?: string;
  createdAt: Date;
  updatedAt: Date;
}

const OutwardSchema: Schema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    commodityId: { type: Schema.Types.ObjectId, ref: 'Commodity', required: true },
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    quantityMT: { type: Number, required: true, min: 0 },
    actualWeight: { type: Number, min: 0 },
    netWeightLoss: { type: Number },
    bagsCount: { type: Number, min: 0 },
    stackNo: { type: String, trim: true },
    lotNo: { type: String, trim: true },
    gatePass: { type: String, trim: true },
    partyName: { type: String, trim: true },
    unit: { type: String, default: 'MT' },
    unitRate: { type: Number, required: false },
    date: { type: Date, default: Date.now },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    userEmail: { type: String, required: false },
  },
  { timestamps: true }
);

OutwardSchema.index({ inwardId: 1 });
OutwardSchema.index({ userId: 1, date: -1 });
OutwardSchema.index({ userEmail: 1, date: -1 });
OutwardSchema.index({ warehouseId: 1, date: -1 });
OutwardSchema.index({ clientId: 1, date: -1 });
OutwardSchema.index({ receiptNumber: 1 });

const Outward: Model<IOutward> =
  mongoose.models.Outward || mongoose.model<IOutward>('Outward', OutwardSchema);

export default Outward;

