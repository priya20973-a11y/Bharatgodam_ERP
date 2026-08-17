import mongoose, { Schema, Document, Model } from 'mongoose';

export type ManufacturingItemType = 'RAW_MATERIAL' | 'FINISHED_GOOD' | 'WASTE';

export interface IManufacturingItem extends Document {
  name: string;
  type: ManufacturingItemType;
  unit: string;
  description?: string;
  isActive: boolean;
  userId?: mongoose.Types.ObjectId;
  userEmail?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ManufacturingItemSchema: Schema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['RAW_MATERIAL', 'FINISHED_GOOD', 'WASTE'],
      required: true,
    },
    unit: { type: String, required: true, trim: true, default: 'KG' },
    description: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    userEmail: { type: String, required: false },
  },
  { timestamps: true }
);

ManufacturingItemSchema.index({ userId: 1, name: 1, type: 1 }, { unique: true });

const ManufacturingItem: Model<IManufacturingItem> =
  mongoose.models.ManufacturingItem || mongoose.model<IManufacturingItem>('ManufacturingItem', ManufacturingItemSchema);

export default ManufacturingItem;
