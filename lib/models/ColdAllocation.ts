import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IColdAllocation extends Document {
  warehouseId: mongoose.Types.ObjectId;
  lotId: mongoose.Types.ObjectId;
  inwardId?: mongoose.Types.ObjectId; // optional link to inward record
  clientId?: mongoose.Types.ObjectId;
  commodityId?: mongoose.Types.ObjectId;
  floorNo: number;
  chamberNo: number;
  stackNo: number;
  allocatedQuantityKg: number;
  unit?: string;
  allocationDate: Date;
  status: 'ACTIVE' | 'RELEASED' | 'ADJUSTED';
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ColdAllocationSchema: Schema = new Schema(
  {
    warehouseId: { type: Schema.Types.ObjectId, ref: 'ColdWarehouse', required: true },
    lotId: { type: Schema.Types.ObjectId, ref: 'ColdLot', required: true },
    inwardId: { type: Schema.Types.ObjectId, ref: 'ColdInward', required: false },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: false },
    commodityId: { type: Schema.Types.ObjectId, ref: 'ColdCommodity', required: false },
    floorNo: { type: Number, required: true, min: 1 },
    chamberNo: { type: Number, required: true, min: 1 },
    stackNo: { type: Number, required: true, min: 1 },
    allocatedQuantityKg: { type: Number, required: true, min: 0 },
    unit: { type: String, default: 'KG' },
    allocationDate: { type: Date, default: Date.now },
    status: { type: String, enum: ['ACTIVE', 'RELEASED', 'ADJUSTED'], default: 'ACTIVE' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

ColdAllocationSchema.index({ warehouseId: 1, floorNo: 1, chamberNo: 1, stackNo: 1 });

const ColdAllocation: Model<IColdAllocation> = mongoose.models.ColdAllocation || mongoose.model<IColdAllocation>('ColdAllocation', ColdAllocationSchema);

export default ColdAllocation;
