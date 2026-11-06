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
  packagingMaterial?: string;
  packagingSize?: string;
  gslNo?: string;
  dailyReportSrNo?: string;
  gatePassNo?: string;
  agentName?: string;
  authorityPerson?: string;
  variety?: string;
  vehicleNumber?: string;
  transportationName?: string;
  driverName?: string;
  rsnNo?: string;
  weighbridgeNameAddress?: string;
  inTime?: string;
  outTime?: string;
  grossWeight?: number;
  tareWeight?: number;
  netWeight?: number;
  moisture?: string;
  deliveryOrderNo?: string;
  idProofNo?: string;
  notes?: string;
  note?: string;
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
    packagingMaterial: { type: String, trim: true },
    packagingSize: { type: String, trim: true },
    gslNo: { type: String, trim: true },
    dailyReportSrNo: { type: String, trim: true },
    gatePassNo: { type: String, trim: true },
    agentName: { type: String, trim: true },
    authorityPerson: { type: String, trim: true },
    variety: { type: String, trim: true },
    vehicleNumber: { type: String, trim: true },
    transportationName: { type: String, trim: true },
    driverName: { type: String, trim: true },
    rsnNo: { type: String, trim: true },
    weighbridgeNameAddress: { type: String, trim: true },
    inTime: { type: String, trim: true },
    outTime: { type: String, trim: true },
    grossWeight: { type: Number },
    tareWeight: { type: Number },
    netWeight: { type: Number },
    moisture: { type: String, trim: true },
    deliveryOrderNo: { type: String, trim: true },
    idProofNo: { type: String, trim: true },
    notes: { type: String, trim: true },
    note: { type: String, trim: true },
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
OutwardSchema.index({ dailyReportSrNo: 1 });
OutwardSchema.index({ gatePassNo: 1 });
OutwardSchema.index({ receiptNumber: 1 });

const Outward: Model<IOutward> =
  mongoose.models.Outward || mongoose.model<IOutward>('Outward', OutwardSchema);

export default Outward;

