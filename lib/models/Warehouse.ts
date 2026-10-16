import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IInsurance {
  policyName?: string;
  companyName?: string;
  policyNumber?: string;
  amount?: number;
  validityStart?: Date;
  validityEnd?: Date;
}

export interface IWarehouse extends Document {
  warehouseId?: string;
  name: string;
  address: string;
  state?: string;
  totalCapacity: number; // in MT
  occupiedCapacity: number; // in MT
  status: 'ACTIVE' | 'INACTIVE' | 'FULL';
  warehouseType?: 'Rented' | 'Owner';
  platformCommission?: number;
  ownerEarnings?: number;
  ownerEquity?: number;
  insurances?: IInsurance[];
  userId?: mongoose.Types.ObjectId;
  userEmail?: string;
  createdAt: Date;
  updatedAt: Date;
}

const InsuranceSchema = new Schema({
  policyName: { type: String, required: false },
  companyName: { type: String, required: false },
  policyNumber: { type: String, required: false },
  amount: { type: Number, required: false },
  validityStart: { type: Date, required: false },
  validityEnd: { type: Date, required: false },
});

const WarehouseSchema: Schema = new Schema(
  {
    warehouseId: { type: String, required: false },
    name: { type: String, required: true },
    address: { type: String, required: true },
    state: { type: String, required: false },
    totalCapacity: { type: Number, required: true, min: 0 },
    occupiedCapacity: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE', 'FULL'],
      default: 'ACTIVE',
    },
    warehouseType: {
      type: String,
      enum: ['Rented', 'Owner'],
      default: 'Owner',
    },
    platformCommission: {
      type: Number,
      min: 0,
      max: 100,
      default: 40,
    },
    ownerEarnings: {
      type: Number,
      min: 0,
      max: 100,
      default: 60,
    },
    ownerEquity: {
      type: Number,
      min: 0,
      max: 100,
      default: 60,
    },
    insurances: { type: [InsuranceSchema], required: false, default: [] },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    userEmail: { type: String, required: false },
  },
  { timestamps: true, strict: false }
);

WarehouseSchema.index({ userId: 1, name: 1 }, { unique: true });
WarehouseSchema.index({ userEmail: 1, name: 1 });
WarehouseSchema.index({ status: 1 });

if (mongoose.models.Warehouse) {
  delete (mongoose.models as any).Warehouse;
}

const Warehouse: Model<IWarehouse> =
  mongoose.models.Warehouse || mongoose.model<IWarehouse>('Warehouse', WarehouseSchema);

export default Warehouse;
