import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IManufacturingUnit extends Document {
  name: string;
  code: string;
  unitType: 'PLANT' | 'UNIT' | 'LINE';
  address: string;
  state?: string;
  status: 'ACTIVE' | 'INACTIVE';
  userId?: mongoose.Types.ObjectId;
  userEmail?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ManufacturingUnitSchema: Schema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    unitType: {
      type: String,
      enum: ['PLANT', 'UNIT', 'LINE'],
      required: true,
      default: 'UNIT',
    },
    address: { type: String, required: true, trim: true },
    state: { type: String, required: false, trim: true },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE',
    },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    userEmail: { type: String, required: false },
  },
  { timestamps: true }
);

ManufacturingUnitSchema.index({ userId: 1, code: 1 }, { unique: true });
ManufacturingUnitSchema.index({ userId: 1, name: 1 }, { unique: true });

const ManufacturingUnit: Model<IManufacturingUnit> =
  mongoose.models.ManufacturingUnit || mongoose.model<IManufacturingUnit>('ManufacturingUnit', ManufacturingUnitSchema);

export default ManufacturingUnit;
