import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IManufacturingBOM extends Document {
  name: string;
  description?: string;
  finishedGoodId: mongoose.Types.ObjectId;
  ingredients: Array<{
    itemId: mongoose.Types.ObjectId;
    quantity: number;
    unit: string;
  }>;
  outputQuantity: number;
  isActive: boolean;
  userId?: mongoose.Types.ObjectId;
  userEmail?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ManufacturingBOMSchema: Schema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    finishedGoodId: { type: Schema.Types.ObjectId, ref: 'ManufacturingItem', required: true },
    ingredients: [
      {
        itemId: { type: Schema.Types.ObjectId, ref: 'ManufacturingItem', required: true },
        quantity: { type: Number, required: true, min: 0 },
        unit: { type: String, required: true, trim: true },
      },
    ],
    outputQuantity: { type: Number, required: true, min: 0 },
    isActive: { type: Boolean, default: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    userEmail: { type: String, required: false },
  },
  { timestamps: true }
);

const ManufacturingBOM: Model<IManufacturingBOM> =
  mongoose.models.ManufacturingBOM || mongoose.model<IManufacturingBOM>('ManufacturingBOM', ManufacturingBOMSchema);

export default ManufacturingBOM;
