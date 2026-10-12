import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IInward extends Document {
  clientId: mongoose.Types.ObjectId;
  commodityId: mongoose.Types.ObjectId;
  warehouseId: mongoose.Types.ObjectId;
  quantityMT: number;
  bagsCount: number;
  stackNo?: string;
  lotNo?: string;
  gatePass?: string;
  vehicleNumber?: string;
  transportationName?: string;
  driverName?: string;
  note?: string;
  date: Date;
  outwardDate?: Date;
  qrId?: string;
  receiptNumber?: string;
  isAssayingRequired?: boolean;
  assayerId?: mongoose.Types.ObjectId;
  assayingDate?: Date;
  assayingExpiryDate?: Date;
  marketValuePerMT?: number;
  totalMarketValue?: number;
  gradingResults?: {
    parameterName: string;
    observedValue: string;
    status?: string;
  }[];
  approvedGradingResults?: {
    parameterName: string;
    observedValue: string;
    status?: string;
  }[];
  gradingStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
  gradingDecisionDate?: Date;
  gradingDecisionBy?: mongoose.Types.ObjectId;
  gradingDecisionByName?: string;
  gradingDecisionByEmail?: string;
  gradingDecisionRole?: string;
  gradingDecisionRemarks?: string;
  userId?: mongoose.Types.ObjectId;
  userEmail?: string;
  createdAt: Date;
  updatedAt: Date;
}

const InwardSchema: Schema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    commodityId: { type: Schema.Types.ObjectId, ref: 'Commodity', required: true },
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    quantityMT: { type: Number, required: true, min: 0 },
    bagsCount: { type: Number, required: true, min: 0 },
    stackNo: { type: String, trim: true },
    lotNo: { type: String, trim: true },
    gatePass: { type: String, trim: true },
    vehicleNumber: { type: String, trim: true },
    transportationName: { type: String, trim: true },
    driverName: { type: String, trim: true },
    note: { type: String, trim: true },
    date: { type: Date, default: Date.now },
    outwardDate: { type: Date },
    qrId: { type: String, unique: true, sparse: true },
    receiptNumber: { type: String, trim: true },
    isAssayingRequired: { type: Boolean, default: false },
    assayerId: { type: Schema.Types.ObjectId, ref: 'Assayer', required: false },
    assayingDate: { type: Date, required: false },
    assayingExpiryDate: { type: Date, required: false },
    marketValuePerMT: { type: Number, required: false, min: 0 },
    totalMarketValue: { type: Number, required: false, min: 0 },
    gradingResults: { 
      type: [{ 
        parameterName: String, 
        observedValue: String,
        status: String
      }], 
      required: false,
      default: []
    },
    approvedGradingResults: { 
      type: [{ 
        parameterName: String, 
        observedValue: String,
        status: String
      }], 
      required: false,
      default: []
    },
    gradingStatus: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED'],
      default: 'PENDING',
    },
    gradingDecisionDate: { type: Date, required: false },
    gradingDecisionBy: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    gradingDecisionByName: { type: String, required: false },
    gradingDecisionByEmail: { type: String, required: false },
    gradingDecisionRole: { type: String, required: false },
    gradingDecisionRemarks: { type: String, required: false },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    userEmail: { type: String, required: false },
  },
  { timestamps: true }
);

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.Inward;
}

InwardSchema.index({ userId: 1, date: -1 });
InwardSchema.index({ userEmail: 1, date: -1 });
InwardSchema.index({ warehouseId: 1, date: -1 });
InwardSchema.index({ clientId: 1, date: -1 });
InwardSchema.index({ receiptNumber: 1 });
InwardSchema.index({ commodityId: 1 });

const Inward: Model<IInward> =
  mongoose.models.Inward || mongoose.model<IInward>('Inward', InwardSchema);

export default Inward;

