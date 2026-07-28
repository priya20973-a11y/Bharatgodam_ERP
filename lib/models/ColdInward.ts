import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IReferencePerson {
  name: string;
  mobile: string;
  email: string;
  designation: string;
}

export interface IColdInward extends Document {
  clientId: mongoose.Types.ObjectId;
  commodityId: mongoose.Types.ObjectId;
  warehouseId: mongoose.Types.ObjectId;
  stackAllocations: {
    chamberName: string;
    chamberNo?: number;
    floorNo: number;
    stackNo: number;
    allocatedWeight: number;
    bagsCount?: number;
  }[];
  quantityKg: number; // Net Weight
  bagsCount: number; // Bags
  grade?: string; // Large, Small, Mixed
  gradingType?: string; // Grading, Wet
  seed?: string;
  tableLabel?: string;
  jin?: number;
  mixed?: number;
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
  qualityEntries?: {
    parameterName: string;
    value: number;
    status: string;
    remark?: string;
  }[];
  referencePersons?: IReferencePerson[];
  date: Date;
  batchId?: string;
  userId?: mongoose.Types.ObjectId;
  userEmail?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ReferencePersonSchema = new Schema({
  name: { type: String, required: true },
  mobile: { type: String },
  email: { type: String },
  designation: { type: String }
});

const ColdInwardSchema: Schema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    commodityId: { type: Schema.Types.ObjectId, ref: 'ColdCommodity', required: true },
    warehouseId: { type: Schema.Types.ObjectId, ref: 'ColdWarehouse', required: true },
    stackAllocations: [{
      chamberName: { type: String, required: true },
      chamberNo: { type: Number, required: false },
      floorNo: { type: Number, required: true, min: 1 },
      stackNo: { type: Number, required: true, min: 1 },
      allocatedWeight: { type: Number, required: true, min: 0 },
      bagsCount: { type: Number, required: false, min: 0 },
    }],
    quantityKg: { type: Number, required: true, min: 0 },
    bagsCount: { type: Number, required: true, min: 0 },
    grade: { type: String, enum: ['Large', 'Small', 'Mixed'], required: false },
    gradingType: { type: String, required: false },
    seed: { type: String, required: false },
    tableLabel: { type: String, required: false },
    jin: { type: Number, required: false, default: 0 },
    mixed: { type: Number, required: false, default: 0 },
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
    qualityEntries: [{
      parameterName: { type: String, required: true },
      value: { type: Number, required: true },
      status: { type: String, required: true },
      remark: { type: String, required: false },
    }],
    referencePersons: [ReferencePersonSchema],
    date: { type: Date, default: Date.now },
    batchId: { type: String, required: false },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    userEmail: { type: String, required: false },
  },
  { timestamps: true }
);

if (mongoose.models.ColdInward) {
  delete mongoose.models.ColdInward;
}

const ColdInward: Model<IColdInward> = mongoose.model<IColdInward>('ColdInward', ColdInwardSchema);

export default ColdInward;
