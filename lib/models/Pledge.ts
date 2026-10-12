import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IPledgeItem {
  inwardId: mongoose.Types.ObjectId;
  storageType: 'DRY' | 'COLD';
  commodityId: mongoose.Types.ObjectId;
  warehouseId: mongoose.Types.ObjectId;
  pledgedQuantity: number;
  pledgedBags: number;
  releasedQuantity: number;
  releasedBags: number;
}

export interface IPledgeRelease {
  receiptNo: string;
  releaseDate: Date;
  clientName: string;
  clientLocation: string;
  clientIdString: string;
  items: {
    inwardId: mongoose.Types.ObjectId;
    warehouseName: string;
    warehouseAddress: string;
    warehouseIdentifier: string;
    commodityName: string;
    totalNetWtMT: number;
    previousReleasedMT: number;
    currentReleasedMT: number;
    balanceNetWtMT: number;
    releasedQuantity: number;
    releasedBags: number;
  }[];
  releasedBy?: string;
  remarks?: string;
}

export interface IPledge extends Document {
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
  items: IPledgeItem[];
  releaseHistory: IPledgeRelease[];
  userId?: mongoose.Types.ObjectId;
  userEmail?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PledgeItemSchema = new Schema({
  inwardId: { type: Schema.Types.ObjectId, required: true },
  storageType: { type: String, enum: ['DRY', 'COLD'], required: true },
  commodityId: { type: Schema.Types.ObjectId, required: true },
  warehouseId: { type: Schema.Types.ObjectId, required: true },
  pledgedQuantity: { type: Number, required: true, min: 0 },
  pledgedBags: { type: Number, required: true, min: 0 },
  releasedQuantity: { type: Number, default: 0, min: 0 },
  releasedBags: { type: Number, default: 0, min: 0 },
}, { _id: false });

const PledgeReleaseItemSchema = new Schema({
  inwardId: { type: Schema.Types.ObjectId, required: true },
  warehouseName: { type: String },
  warehouseAddress: { type: String },
  warehouseIdentifier: { type: String },
  commodityName: { type: String },
  totalNetWtMT: { type: Number },
  previousReleasedMT: { type: Number },
  currentReleasedMT: { type: Number },
  balanceNetWtMT: { type: Number },
  releasedQuantity: { type: Number, required: true, min: 0 },
  releasedBags: { type: Number, required: true, min: 0 },
}, { _id: false });

const PledgeReleaseSchema = new Schema({
  receiptNo: { type: String, required: true },
  releaseDate: { type: Date, required: true, default: Date.now },
  clientName: { type: String },
  clientLocation: { type: String },
  clientIdString: { type: String },
  items: [PledgeReleaseItemSchema],
  releasedBy: { type: String },
  remarks: { type: String }
});

const PledgeSchema: Schema = new Schema(
  {
    pledgeNo: { type: String, required: true, trim: true },
    loanDate: { type: Date, required: true },
    repaymentDate: { type: Date, required: true },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    lenderName: { type: String, required: true, trim: true },
    lenderId: { type: Schema.Types.ObjectId, ref: 'Pledgee', required: false },
    loanAmount: { type: Number, required: true, min: 0 },
    remarks: { type: String, trim: true },
    status: { 
      type: String, 
      enum: ['ACTIVE', 'RELEASED', 'PARTIAL'], 
      default: 'ACTIVE' 
    },
    releaseDate: { type: Date },
    items: [PledgeItemSchema],
    releaseHistory: { type: [PledgeReleaseSchema], default: [] },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    userEmail: { type: String, required: false },
  },
  { timestamps: true }
);

PledgeSchema.index({ userId: 1, pledgeNo: 1 }, { unique: true });
PledgeSchema.index({ clientId: 1 });
PledgeSchema.index({ status: 1 });

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.Pledge;
}

const Pledge: Model<IPledge> =
  mongoose.models.Pledge || mongoose.model<IPledge>('Pledge', PledgeSchema);

export default Pledge;
