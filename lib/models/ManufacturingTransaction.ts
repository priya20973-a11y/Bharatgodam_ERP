import mongoose, { Schema, Document, Model } from 'mongoose';

export type ManufacturingTransactionType = 'PROCUREMENT' | 'INWARD' | 'PRODUCTION' | 'OUTWARD' | 'WASTE';

export interface IManufacturingTransaction extends Document {
  type: ManufacturingTransactionType;
  transactionDate: Date;
  referenceNo?: string;
  itemId: mongoose.Types.ObjectId;
  quantity: number;
  unit: string;
  lotNo?: string;
  supplierOrCustomer?: string;
  notes?: string;
  bomId?: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId;
  userEmail?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ManufacturingTransactionSchema: Schema = new Schema(
  {
    type: {
      type: String,
      enum: ['PROCUREMENT', 'INWARD', 'PRODUCTION', 'OUTWARD', 'WASTE'],
      required: true,
    },
    transactionDate: { type: Date, default: Date.now },
    referenceNo: { type: String, trim: true },
    itemId: { type: Schema.Types.ObjectId, ref: 'ManufacturingItem', required: true },
    quantity: { type: Number, required: true, min: 0 },
    unit: { type: String, required: true, trim: true },
    lotNo: { type: String, trim: true },
    supplierOrCustomer: { type: String, trim: true },
    notes: { type: String, trim: true },
    bomId: { type: Schema.Types.ObjectId, ref: 'ManufacturingBOM', required: false },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    userEmail: { type: String, required: false },
  },
  { timestamps: true }
);

const ManufacturingTransaction: Model<IManufacturingTransaction> =
  mongoose.models.ManufacturingTransaction || mongoose.model<IManufacturingTransaction>('ManufacturingTransaction', ManufacturingTransactionSchema);

export default ManufacturingTransaction;
