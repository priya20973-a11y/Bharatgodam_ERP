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
    warehouseId?: mongoose.Types.ObjectId;
    chamberName: string;
    chamberNo?: number;
    floorNo: number;
    floorName?: string;
    stackNo: number;
    allocatedWeight: number;
    bagsCount?: number;
    stockType?: string;
    isStockShifting?: boolean;
  }[];
  quantityKg: number; // Net Weight
  bagsCount: number; // Bags
  stockType?: string;
  purchaseQuantityKg?: number;
  purchaseBagsCount?: number;
  selfQuantityKg?: number;
  selfBagsCount?: number;
  status?: string;
  unit?: string;
  remainingQuantityKg?: number;
  remainingBagsCount?: number;
  qrId?: string;
  receiptNumber?: string;
  grade?: string; // Large, Small, Mixed
  gradingType?: string; // Grading, Wet
  gradingApplied?: boolean;
  gradingChargeType?: string; // Per Bag, Per Kg
  gradingRate?: number;
  gradingCharge?: number;
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
  villageName?: string;
  lotNo?: string;
  largeBag?: number;
  smallBag?: number;
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
      warehouseId: { type: Schema.Types.ObjectId, ref: 'ColdWarehouse', required: false },
      chamberName: { type: String, required: true },
      chamberNo: { type: Number, required: false },
      floorNo: { type: Number, required: true, min: 1 },
      floorName: { type: String, required: false },
      stackNo: { type: Number, required: true, min: 1 },
      allocatedWeight: { type: Number, required: true, min: 0 },
      bagsCount: { type: Number, required: false, min: 0 },
      stockType: { type: String, enum: ['Self', 'Purchase'], required: false },
      isStockShifting: { type: Boolean, default: false },
      rowId: { type: String, required: false },
    }],
    quantityKg: { type: Number, required: true, min: 0 },
    bagsCount: { type: Number, required: true, min: 0 },
    stockType: { type: String, enum: ['Self', 'Purchase', 'Both'], default: 'Self' },
    purchaseQuantityKg: { type: Number, required: false },
    purchaseBagsCount: { type: Number, required: false },
    selfQuantityKg: { type: Number, required: false },
    selfBagsCount: { type: Number, required: false },
    unit: { type: String, default: 'KG' },
    status: { type: String, enum: ['Active', 'Partial', 'Completed'], default: 'Active' },
    remainingQuantityKg: { type: Number, required: false },
    remainingBagsCount: { type: Number, required: false },
    qrId: { type: String, unique: true, sparse: true },
    receiptNumber: { type: String, required: false },
    grade: { type: String, enum: ['Large', 'Small', 'Mixed'], required: false },
    gradingType: { type: String, required: false },
    gradingApplied: { type: Boolean, required: false },
    gradingChargeType: { type: String, enum: ['Per Bag', 'Per Kg'], required: false },
    gradingRate: { type: Number, required: false },
    gradingCharge: { type: Number, required: false },
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
    villageName: { type: String, required: false },
    lotNo: { type: String, required: false },
    largeBag: { type: Number, required: false },
    smallBag: { type: Number, required: false },
  },
  { timestamps: true }
);

ColdInwardSchema.index({ 'stackAllocations.rowId': 1 }, { unique: true, sparse: true });

if (mongoose.models.ColdInward) {
  delete mongoose.models.ColdInward;
}

const ColdInward: Model<IColdInward> = mongoose.model<IColdInward>('ColdInward', ColdInwardSchema);

export default ColdInward;
