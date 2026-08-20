import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ISupplier extends Document {
  supplierId: string;
  supplierName: string;
  companyName: string;
  contactPerson: string;
  mobile: string;
  alternateMobile?: string;
  email?: string;
  alternateEmail?: string;
  gstin?: string;
  pan?: string;
  address?: string;
  city?: string;
  state?: string;
  pinCode?: string;
  country?: string;
  paymentTerms?: string;
  creditPeriod?: number;
  openingBalance?: number;
  bankName?: string;
  accountNumber?: string;
  ifsc?: string;
  status: 'ACTIVE' | 'INACTIVE';
  remarks?: string;
  userId?: mongoose.Types.ObjectId;
  userEmail?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SupplierSchema: Schema = new Schema(
  {
    supplierId: { type: String, required: true, trim: true, uppercase: true },
    supplierName: { type: String, required: true, trim: true },
    companyName: { type: String, required: true, trim: true },
    contactPerson: { type: String, required: true, trim: true },
    mobile: { type: String, required: true, trim: true },
    alternateMobile: { type: String, trim: true },
    email: { type: String, trim: true },
    alternateEmail: { type: String, trim: true },
    gstin: { type: String, trim: true },
    pan: { type: String, trim: true },
    address: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    pinCode: { type: String, trim: true },
    country: { type: String, trim: true, default: 'India' },
    paymentTerms: { type: String, trim: true },
    creditPeriod: { type: Number, default: 0 },
    openingBalance: { type: Number, default: 0 },
    bankName: { type: String, trim: true },
    accountNumber: { type: String, trim: true },
    ifsc: { type: String, trim: true },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
    remarks: { type: String, trim: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    userEmail: { type: String, required: false },
  },
  { timestamps: true }
);

SupplierSchema.index({ userId: 1, supplierId: 1 }, { unique: true });
SupplierSchema.index({ userId: 1, supplierName: 1 }, { unique: true });

const Supplier: Model<ISupplier> =
  mongoose.models.Supplier || mongoose.model<ISupplier>('Supplier', SupplierSchema);

export default Supplier;
