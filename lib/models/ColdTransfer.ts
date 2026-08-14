import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IColdTransfer extends Document {
  fromClientId: mongoose.Types.ObjectId;
  toClientId: mongoose.Types.ObjectId;
  toClientModel?: string;
  originalInwardId: mongoose.Types.ObjectId;
  newInwardId: mongoose.Types.ObjectId;
  outwardId?: mongoose.Types.ObjectId;
  warehouseId: mongoose.Types.ObjectId;
  commodityId: mongoose.Types.ObjectId;
  transferType?: 'Self' | 'Purchase';
  stackAllocations: {
    chamberName: string;
    chamberNo?: number;
    floorNo: number;
    floorName?: string;
    stackNo: number;
    allocatedWeight: number;
    bagsCount?: number;
  }[];
  quantityKg: number;
  bagsCount: number;
  date: Date;
  userId?: mongoose.Types.ObjectId;
  userEmail?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ColdTransferSchema: Schema = new Schema(
  {
    fromClientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    toClientId: { type: Schema.Types.ObjectId, refPath: 'toClientModel', required: true },
    toClientModel: { type: String, enum: ['Client', 'ColdWarehouse'], default: 'Client' },
    originalInwardId: { type: Schema.Types.ObjectId, ref: 'ColdInward', required: true },
    newInwardId: { type: Schema.Types.ObjectId, ref: 'ColdInward', required: false },
    outwardId: { type: Schema.Types.ObjectId, ref: 'ColdOutward', required: false },
    warehouseId: { type: Schema.Types.ObjectId, ref: 'ColdWarehouse', required: true },
    commodityId: { type: Schema.Types.ObjectId, ref: 'ColdCommodity', required: true },
    transferType: { type: String, enum: ['Self', 'Purchase'], default: 'Self' },
    stackAllocations: [{
      chamberName: { type: String, required: true },
      chamberNo: { type: Number, required: false },
      floorNo: { type: Number, required: true, min: 1 },
      floorName: { type: String, required: false },
      stackNo: { type: Number, required: true, min: 1 },
      allocatedWeight: { type: Number, required: true, min: 0 },
      bagsCount: { type: Number, required: false, min: 0 },
    }],
    quantityKg: { type: Number, required: true, min: 0 },
    bagsCount: { type: Number, required: true, min: 0 },
    date: { type: Date, default: Date.now },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    userEmail: { type: String, required: false },
  },
  { timestamps: true }
);

if (mongoose.models.ColdTransfer) {
  delete mongoose.models.ColdTransfer;
}

const ColdTransfer: Model<IColdTransfer> = mongoose.model<IColdTransfer>('ColdTransfer', ColdTransferSchema);

export default ColdTransfer;
