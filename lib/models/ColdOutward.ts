import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IReferencePerson {
  name: string;
  mobile: string;
  email: string;
  designation: string;
}

export interface IColdOutward extends Document {
  inwardId?: mongoose.Types.ObjectId;
  clientId: mongoose.Types.ObjectId;
  clientModel?: string;
  commodityId: mongoose.Types.ObjectId;
  receiptNumber?: string;
  warehouseId: mongoose.Types.ObjectId;
  chamberName: string;
  chamberNo?: number;
  floorName?: string;
  floorNo: number;
  stackName?: string;
  stackNo: number;
  quantityKg: number; // Net Weight
  bagsCount: number; // Bags
  unit?: string;
  grade?: string; // Large, Small, Mixed
  serviceType?: string; // None, Grading, Wet
  serviceChargeType?: string; // Per Bag, Per Kg
  serviceRate?: number;
  serviceAmount?: number;
  gradingApplied?: boolean;
  gradingChargeType?: string; // Per Bag, Per Kg
  gradingRate?: number;
  gradingCharge?: number;
  seed?: string;
  tableLabel?: string;
  jin?: number;
  mixed?: number;
  plusMinus?: number;
  totalBags?: number;
  truckNo?: string;
  farmerName?: string;
  farmerId?: string;
  weighbridgeSlipNo?: string;
  grossWeight?: number;
  emptyWeight?: number;
  kataBharati?: number;
  marko?: string;
  remarks?: string;
  note?: string;
  referencePersons?: IReferencePerson[];
  rentRs?: number;
  rentReason?: string;
  unitRate?: number;
  date: Date;
  userId?: mongoose.Types.ObjectId;
  userEmail?: string;
  batchId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ReferencePersonSchema = new Schema({
  name: { type: String, required: true },
  mobile: { type: String },
  email: { type: String },
  designation: { type: String }
});

const ColdOutwardSchema: Schema = new Schema(
  {
    inwardId: { type: Schema.Types.ObjectId, ref: 'ColdInward', required: false },
    clientId: { type: Schema.Types.ObjectId, refPath: 'clientModel', required: true },
    clientModel: { type: String, enum: ['Client', 'ColdWarehouse'], default: 'Client' },
    commodityId: { type: Schema.Types.ObjectId, ref: 'ColdCommodity', required: true },
    receiptNumber: { type: String, required: false },
    warehouseId: { type: Schema.Types.ObjectId, ref: 'ColdWarehouse', required: true },
    chamberName: { type: String, required: true },
    chamberNo: { type: Number, required: false },
    floorName: { type: String, required: false },
    floorNo: { type: Number, required: true, min: 1 },
    stackName: { type: String, required: false },
    stackNo: { type: Number, required: true, min: 1 },
    quantityKg: { type: Number, required: true, min: 0 },
    bagsCount: { type: Number, required: true, min: 0 },
    unit: { type: String, default: 'KG' },
    grade: { type: String, enum: ['Large', 'Small', 'Mixed'], required: false },
    serviceType: { type: String, enum: ['None', 'Grading', 'Wet'], required: false, default: 'None' },
    serviceChargeType: { type: String, enum: ['Per Bag', 'Per Kg'], required: false },
    serviceRate: { type: Number, required: false },
    serviceAmount: { type: Number, required: false },
    gradingApplied: { type: Boolean, required: false },
    gradingChargeType: { type: String, enum: ['Per Bag', 'Per Kg'], required: false },
    gradingRate: { type: Number, required: false },
    gradingCharge: { type: Number, required: false },
    seed: { type: String, required: false },
    tableLabel: { type: String, required: false },
    jin: { type: Number, required: false, default: 0 },
    mixed: { type: Number, required: false, default: 0 },
    plusMinus: { type: Number, required: false, default: 0 },
    totalBags: { type: Number, required: false },
    truckNo: { type: String, required: false },
    farmerName: { type: String, required: false },
    farmerId: { type: String, required: false },
    weighbridgeSlipNo: { type: String, required: false },
    grossWeight: { type: Number, required: false },
    emptyWeight: { type: Number, required: false },
    kataBharati: { type: Number, required: false },
    marko: { type: String, required: false },
    remarks: { type: String, required: false },
    note: { type: String, required: false },
    rentRs: { type: Number, required: false },
    rentReason: { type: String, required: false },
    unitRate: { type: Number, required: false },
    referencePersons: [ReferencePersonSchema],
    date: { type: Date, default: Date.now },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    userEmail: { type: String, required: false },
    batchId: { type: String, required: false },
  },
  { timestamps: true }
);

if (mongoose.models.ColdOutward) {
  delete mongoose.models.ColdOutward;
}

const ColdOutward: Model<IColdOutward> = mongoose.model<IColdOutward>('ColdOutward', ColdOutwardSchema);

export default ColdOutward;
