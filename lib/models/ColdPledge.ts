import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IColdPledgeItem {
  inwardId: mongoose.Types.ObjectId;
  storageType: 'COLD';
  commodityId: mongoose.Types.ObjectId;
  warehouseId: mongoose.Types.ObjectId;
  chamberName?: string;
  floorNo?: number;
  stackNo?: number;
  pledgedQuantity: number; // in KG
  pledgedBags: number;
  releasedQuantity: number;
  releasedBags: number;
}

export interface IColdPledgeReleaseItem {
  inwardId: mongoose.Types.ObjectId;
  warehouseName: string;
  warehouseAddress: string;
  warehouseIdentifier: string;
  commodityName: string;
  totalNetWtKg: number;
  previousReleasedKg: number;
  currentReleasedKg: number;
  balanceNetWtKg: number;
  releasedQuantity: number;
  releasedBags: number;
}

export interface IColdPledgeRelease {
  receiptNo: string;
  releaseDate: Date;
  clientName: string;
  clientLocation: string;
  clientIdString: string;
  items: IColdPledgeReleaseItem[];
  releasedBy?: string;
  remarks?: string;
}

export interface IColdPledge extends Document {
  pledgeNo: string;
  loanDate: Date;
  repaymentDate: Date;
  clientId: mongoose.Types.ObjectId;
  lenderName: string;
  lenderId?: mongoose.Types.ObjectId;
  loanAmount: number;
  remarks?: string;
  status: 'ACTIVE' | 'RELEASED' | 'PARTIAL';
  releaseDate?: Date;
  items: IColdPledgeItem[];
  releaseHistory: IColdPledgeRelease[];
  userId?: mongoose.Types.ObjectId;
  userEmail?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ColdPledgeItemSchema = new Schema(
  {
    inwardId: { type: Schema.Types.ObjectId, ref: 'ColdInward', required: true },
    storageType: { type: String, default: 'COLD', enum: ['COLD'], required: true },
    commodityId: { type: Schema.Types.ObjectId, ref: 'ColdCommodity', required: true },
    warehouseId: { type: Schema.Types.ObjectId, ref: 'ColdWarehouse', required: true },
    chamberName: { type: String },
    floorNo: { type: Number },
    stackNo: { type: Number },
    pledgedQuantity: { type: Number, required: true, min: 0 },
    pledgedBags: { type: Number, required: true, min: 0 },
    releasedQuantity: { type: Number, default: 0, min: 0 },
    releasedBags: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const ColdPledgeReleaseItemSchema = new Schema(
  {
    inwardId: { type: Schema.Types.ObjectId, ref: 'ColdInward', required: true },
    warehouseName: { type: String },
    warehouseAddress: { type: String },
    warehouseIdentifier: { type: String },
    commodityName: { type: String },
    totalNetWtKg: { type: Number },
    previousReleasedKg: { type: Number },
    currentReleasedKg: { type: Number },
    balanceNetWtKg: { type: Number },
    releasedQuantity: { type: Number, required: true, min: 0 },
    releasedBags: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const ColdPledgeReleaseSchema = new Schema({
  receiptNo: { type: String, required: true },
  releaseDate: { type: Date, required: true, default: Date.now },
  clientName: { type: String },
  clientLocation: { type: String },
  clientIdString: { type: String },
  items: [ColdPledgeReleaseItemSchema],
  releasedBy: { type: String },
  remarks: { type: String },
});

const ColdPledgeSchema: Schema = new Schema(
  {
    pledgeNo: { type: String, required: true, trim: true },
    loanDate: { type: Date, required: true },
    repaymentDate: { type: Date, required: true },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    lenderName: { type: String, required: true, trim: true },
    lenderId: { type: Schema.Types.ObjectId, ref: 'ColdPledgee', required: false },
    loanAmount: { type: Number, required: true, min: 0 },
    remarks: { type: String, trim: true },
    status: {
      type: String,
      enum: ['ACTIVE', 'RELEASED', 'PARTIAL'],
      default: 'ACTIVE',
    },
    releaseDate: { type: Date },
    items: [ColdPledgeItemSchema],
    releaseHistory: { type: [ColdPledgeReleaseSchema], default: [] },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    userEmail: { type: String, required: false },
  },
  { timestamps: true }
);

ColdPledgeSchema.index({ userId: 1, pledgeNo: 1 }, { unique: true });
ColdPledgeSchema.index(
  { userEmail: 1, pledgeNo: 1 },
  {
    unique: true,
    partialFilterExpression: {
      $or: [{ userId: { $exists: false } }, { userId: null }],
      userEmail: { $exists: true, $ne: null },
    },
  }
);
ColdPledgeSchema.index({ clientId: 1 });
ColdPledgeSchema.index({ status: 1 });
ColdPledgeSchema.index({ 'items.inwardId': 1 });
ColdPledgeSchema.index({ status: 1, 'items.inwardId': 1 });

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.ColdPledge;
}

const ColdPledge: Model<IColdPledge> =
  mongoose.models.ColdPledge || mongoose.model<IColdPledge>('ColdPledge', ColdPledgeSchema);

export default ColdPledge;
