import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ISourceStackAllocation {
  warehouseId: mongoose.Types.ObjectId;
  chamberName: string;
  chamberNo?: number;
  floorNo: number;
  floorName?: string;
  stackNo: number;
  shiftWeight: number;
  shiftBags: number;
}

export interface IDestStackAllocation {
  warehouseId: mongoose.Types.ObjectId;
  chamberName: string;
  chamberNo?: number;
  floorNo: number;
  floorName?: string;
  stackNo: number;
  allocatedWeight: number;
  bagsCount: number;
}

export interface IColdStockShifting extends Document {
  receiptNo: string;
  date: Date;
  clientId: mongoose.Types.ObjectId;
  inwardId: mongoose.Types.ObjectId;
  commodityId: mongoose.Types.ObjectId;
  
  // Multi-source Stack Allocations
  sourceAllocations: ISourceStackAllocation[];

  // Multi-destination Stack Allocations
  destAllocations: IDestStackAllocation[];

  // Legacy single source & dest fields for backward compatibility
  sourceWarehouseId?: mongoose.Types.ObjectId;
  sourceChamberName?: string;
  sourceChamberNo?: number;
  sourceFloorNo?: number;
  sourceFloorName?: string;
  sourceStackNo?: number;
  
  destWarehouseId?: mongoose.Types.ObjectId;
  destChamberName?: string;
  destChamberNo?: number;
  destFloorNo?: number;
  destFloorName?: string;
  destStackNo?: number;
  
  quantityKg: number;
  bagsCount: number;
  
  remarks?: string;
  note?: string;
  qrId?: string;
  
  userId?: mongoose.Types.ObjectId;
  userEmail?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SourceStackAllocationSchema = new Schema({
  warehouseId: { type: Schema.Types.ObjectId, ref: 'ColdWarehouse', required: true },
  chamberName: { type: String, required: true },
  chamberNo: { type: Number, required: false },
  floorNo: { type: Number, required: true },
  floorName: { type: String, required: false },
  stackNo: { type: Number, required: true },
  shiftWeight: { type: Number, required: true, min: 0 },
  shiftBags: { type: Number, required: true, min: 0 },
}, { _id: false });

const DestStackAllocationSchema = new Schema({
  warehouseId: { type: Schema.Types.ObjectId, ref: 'ColdWarehouse', required: true },
  chamberName: { type: String, required: true },
  chamberNo: { type: Number, required: false },
  floorNo: { type: Number, required: true },
  floorName: { type: String, required: false },
  stackNo: { type: Number, required: true },
  allocatedWeight: { type: Number, required: true, min: 0 },
  bagsCount: { type: Number, required: true, min: 0 },
}, { _id: false });

const ColdStockShiftingSchema: Schema = new Schema(
  {
    receiptNo: { type: String, required: true },
    date: { type: Date, default: Date.now },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    inwardId: { type: Schema.Types.ObjectId, ref: 'ColdInward', required: true },
    commodityId: { type: Schema.Types.ObjectId, ref: 'ColdCommodity', required: true },
    
    sourceAllocations: [SourceStackAllocationSchema],
    destAllocations: [DestStackAllocationSchema],

    // Legacy fields
    sourceWarehouseId: { type: Schema.Types.ObjectId, ref: 'ColdWarehouse', required: false },
    sourceChamberName: { type: String, required: false },
    sourceChamberNo: { type: Number, required: false },
    sourceFloorNo: { type: Number, required: false },
    sourceStackNo: { type: Number, required: false },
    
    destWarehouseId: { type: Schema.Types.ObjectId, ref: 'ColdWarehouse', required: false },
    destChamberName: { type: String, required: false },
    destChamberNo: { type: Number, required: false },
    destFloorNo: { type: Number, required: false },
    destStackNo: { type: Number, required: false },
    
    quantityKg: { type: Number, required: true, min: 0 },
    bagsCount: { type: Number, required: true, min: 0 },
    
    remarks: { type: String, required: false },
    note: { type: String, required: false },
    qrId: { type: String, required: false, unique: true, sparse: true },
    
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    userEmail: { type: String, required: false },
  },
  { timestamps: true }
);

if (mongoose.models.ColdStockShifting) {
  delete mongoose.models.ColdStockShifting;
}

const ColdStockShifting: Model<IColdStockShifting> = mongoose.model<IColdStockShifting>('ColdStockShifting', ColdStockShiftingSchema);

export default ColdStockShifting;
