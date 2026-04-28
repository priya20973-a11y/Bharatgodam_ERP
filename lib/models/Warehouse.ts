import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IWarehouse extends Document {
  name: string;
  address: string;
  totalCapacity: number; // in MT
  occupiedCapacity: number; // in MT
  status: 'ACTIVE' | 'INACTIVE' | 'FULL';
  userId?: mongoose.Types.ObjectId;
  userEmail?: string;
  createdAt: Date;
  updatedAt: Date;
}

const WarehouseSchema: Schema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    address: { type: String, required: true },
    totalCapacity: { type: Number, required: true, min: 0 },
    occupiedCapacity: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE', 'FULL'],
      default: 'ACTIVE',
    },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    userEmail: { type: String, required: false },
  },
  { timestamps: true }
);

const Warehouse: Model<IWarehouse> =
  mongoose.models.Warehouse || mongoose.model<IWarehouse>('Warehouse', WarehouseSchema);

export default Warehouse;
