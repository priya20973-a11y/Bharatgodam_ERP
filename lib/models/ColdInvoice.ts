import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IColdInvoiceItem {
  inwardId: mongoose.Types.ObjectId;
  inwardDate: Date;
  outwardDate?: Date;
  commodityId: mongoose.Types.ObjectId;
  commodityName: string;
  quantityKg: number;
  outwardKg: number;
  balanceKg: number;
  bagsLarge: number;
  bagsSmall: number;
  bagsMixed: number;
  totalBags: number;
  days: number;
  rateApplied: number;
  subtotal: number;
  calculationPath: string; // e.g. "Weight × Price × Days" or "Wet Formula"
}

export interface IColdInvoice extends Document {
  invoiceId: string;
  clientId: mongoose.Types.ObjectId;
  warehouseId: mongoose.Types.ObjectId;
  fromDate: Date;
  toDate: Date;
  items: IColdInvoiceItem[];
  additionalCharges?: { name: string; amount: number }[];
  totalAmount: number;
  taxGroup?: string;
  billingState?: string;
  adjustment?: number;
  status: 'ACTIVE' | 'PAID' | 'OVERDUE';
  generatedAt: Date;
  userId?: mongoose.Types.ObjectId;
  userEmail?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ColdInvoiceSchema: Schema = new Schema(
  {
    invoiceId: { type: String, required: true, unique: true },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    fromDate: { type: Date, required: true },
    toDate: { type: Date, required: true },
    items: [
      {
        inwardId: { type: Schema.Types.ObjectId, ref: 'ColdInward' },
        inwardDate: Date,
        outwardDate: Date,
        commodityId: { type: Schema.Types.ObjectId, ref: 'ColdCommodity' },
        commodityName: String,
        quantityKg: Number,
        outwardKg: Number,
        balanceKg: Number,
        bagsLarge: Number,
        bagsSmall: Number,
        bagsMixed: Number,
        totalBags: Number,
        days: Number,
        rateApplied: Number,
        subtotal: Number,
        calculationPath: String,
      },
    ],
    additionalCharges: [
      {
        name: String,
        amount: Number,
      }
    ],
    totalAmount: { type: Number, default: 0 },
    taxGroup: { type: String, default: 'Non-GST Supply' },
    billingState: { type: String, default: '' },
    adjustment: { type: Number, default: 0 },
    status: { type: String, enum: ['ACTIVE', 'PAID', 'OVERDUE'], default: 'ACTIVE' },
    generatedAt: { type: Date, default: Date.now },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    userEmail: { type: String, required: false },
  },
  { timestamps: true }
);

const ColdInvoice: Model<IColdInvoice> =
  mongoose.models.ColdInvoice || mongoose.model<IColdInvoice>('ColdInvoice', ColdInvoiceSchema);

export default ColdInvoice;
