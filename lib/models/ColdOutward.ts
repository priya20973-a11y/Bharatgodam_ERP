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
  commodityId: mongoose.Types.ObjectId;
  warehouseId: mongoose.Types.ObjectId;
  chamberNo: number;
  floorNo: number;
  stackNo: number;
  quantityKg: number; // Net Weight
  bagsCount: number; // Bags
  grade?: string; // Large, Small, Mixed
  gradingType?: string; // Grading, Wet
  seed?: string;
  tableLabel?: string;
  jin?: number;
  mixed?: number;
  plusMinus?: number;
  totalBags?: number;
  truckNo?: string;
  farmerName?: string;
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
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    commodityId: { type: Schema.Types.ObjectId, ref: 'ColdCommodity', required: true },
    warehouseId: { type: Schema.Types.ObjectId, ref: 'ColdWarehouse', required: true },
    chamberNo: { type: Number, required: true, min: 1 },
    floorNo: { type: Number, required: true, min: 1 },
    stackNo: { type: Number, required: true, min: 1 },
    quantityKg: { type: Number, required: true, min: 0 },
    bagsCount: { type: Number, required: true, min: 0 },
    grade: { type: String, enum: ['Large', 'Small', 'Mixed'], required: false },
    gradingType: { type: String, required: false },
    seed: { type: String, required: false },
    tableLabel: { type: String, required: false },
    jin: { type: Number, required: false, default: 0 },
    mixed: { type: Number, required: false, default: 0 },
    plusMinus: { type: Number, required: false, default: 0 },
    totalBags: { type: Number, required: false },
    truckNo: { type: String, required: false },
    farmerName: { type: String, required: false },
    weighbridgeSlipNo: { type: String, required: false },
    grossWeight: { type: Number, required: false },
    emptyWeight: { type: Number, required: false },
    kataBharati: { type: Number, required: false },
    marko: { type: String, required: false },
    remarks: { type: String, required: false },
    note: { type: String, required: false },
    rentRs: { type: Number, required: false },
    rentReason: { type: String, required: false },
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
