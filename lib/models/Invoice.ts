import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IInvoiceItem {
  inwardId: mongoose.Types.ObjectId;
  commodityId: mongoose.Types.ObjectId;
  commodityName: string;
  quantityMT: number;
  durationDays: number;
  rateApplied: number;
  subtotal: number;
  calculationPath: string;
}

export interface IInvoice extends Document {
  invoiceId: string;
  clientId: mongoose.Types.ObjectId;
  warehouseId: mongoose.Types.ObjectId;
  cycleName: string; // e.g., "2026-04"
  items: IInvoiceItem[];
  totalAmount: number;
  paidAmount: number;
  status: 'ACTIVE' | 'PAID' | 'OVERDUE';
  generatedAt: Date;
  userId?: mongoose.Types.ObjectId;
  userEmail?: string;
  createdAt: Date;
  updatedAt: Date;
}

const InvoiceSchema: Schema = new Schema(
  {
    invoiceId: { type: String, required: true, unique: true },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    cycleName: { type: String, required: true },
    items: [
      {
        inwardId: { type: Schema.Types.ObjectId, ref: 'Inward' },
        commodityId: { type: Schema.Types.ObjectId, ref: 'Commodity' },
        commodityName: String,
        quantityMT: Number,
        durationDays: Number,
        rateApplied: Number,
        subtotal: Number,
        calculationPath: String,
      },
    ],
    totalAmount: { type: Number, default: 0 },
    paidAmount: { type: Number, default: 0 },
    status: { type: String, enum: ['ACTIVE', 'PAID', 'OVERDUE'], default: 'ACTIVE' },
    generatedAt: { type: Date, default: Date.now },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    userEmail: { type: String, required: false },
  },
  { timestamps: true }
);

const Invoice: Model<IInvoice> =
  mongoose.models.Invoice || mongoose.model<IInvoice>('Invoice', InvoiceSchema);

export default Invoice;
