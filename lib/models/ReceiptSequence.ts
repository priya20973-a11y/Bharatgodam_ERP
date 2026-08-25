import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IReceiptSequence extends Document {
  warehouseId: mongoose.Types.ObjectId;
  type: 'INWARD' | 'OUTWARD' | 'INVOICE';
  chamberName?: string;
  lastNumber: number;
}

const ReceiptSequenceSchema = new Schema(
  {
    warehouseId: { type: Schema.Types.ObjectId, ref: 'ColdWarehouse', required: true },
    type: { type: String, enum: ['INWARD', 'OUTWARD', 'INVOICE'], required: true },
    chamberName: { type: String, required: false },
    lastNumber: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

// Unique index to ensure one sequence per warehouse/type/chamber
ReceiptSequenceSchema.index(
  { warehouseId: 1, type: 1, chamberName: 1 },
  { unique: true }
);

if (mongoose.models.ReceiptSequence) {
  delete mongoose.models.ReceiptSequence;
}

const ReceiptSequence: Model<IReceiptSequence> = mongoose.model<IReceiptSequence>('ReceiptSequence', ReceiptSequenceSchema);

export default ReceiptSequence;
