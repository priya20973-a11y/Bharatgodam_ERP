import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IReceiptTemplateField {
  key: string;
  x: number;
  y: number;
  fontSize: number;
  fontWeight: string;
  align: 'left' | 'center' | 'right';
  visible: boolean;
  width?: number; // Optional, for alignment boundaries
}

export interface IReceiptTemplate extends Document {
  warehouseId: mongoose.Types.ObjectId;
  receiptType: 'inward' | 'outward' | 'transfer' | 'invoice';
  templateName: string;
  paperWidth: number; // in mm
  paperHeight: number; // in mm
  orientation: 'portrait' | 'landscape';
  backgroundImage?: string;
  imagePixelWidth?: number;
  imagePixelHeight?: number;
  imageAspectRatio?: number;
  fields: IReceiptTemplateField[];
  createdAt: Date;
  updatedAt: Date;
}

const ReceiptTemplateFieldSchema = new Schema({
  key: { type: String, required: true },
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  fontSize: { type: Number, default: 12 },
  fontWeight: { type: String, default: 'normal' },
  align: { type: String, enum: ['left', 'center', 'right'], default: 'left' },
  visible: { type: Boolean, default: true },
  width: { type: Number },
});

const ReceiptTemplateSchema: Schema = new Schema(
  {
    warehouseId: { type: Schema.Types.ObjectId, ref: 'ColdWarehouse', required: true },
    receiptType: { type: String, enum: ['inward', 'outward', 'transfer', 'invoice'], required: true },
    templateName: { type: String, required: true },
    paperWidth: { type: Number, required: true, default: 210 }, // A4 width mm
    paperHeight: { type: Number, required: true, default: 297 }, // A4 height mm
    orientation: { type: String, enum: ['portrait', 'landscape'], default: 'portrait' },
    backgroundImage: { type: String },
    imagePixelWidth: { type: Number },
    imagePixelHeight: { type: Number },
    imageAspectRatio: { type: Number },
    fields: [ReceiptTemplateFieldSchema],
  },
  { timestamps: true }
);

// Ensure a warehouse can only have one template per receipt type
ReceiptTemplateSchema.index({ warehouseId: 1, receiptType: 1 }, { unique: true });

if (mongoose.models.ReceiptTemplate) {
  delete mongoose.models.ReceiptTemplate;
}

const ReceiptTemplate: Model<IReceiptTemplate> = mongoose.model<IReceiptTemplate>('ReceiptTemplate', ReceiptTemplateSchema);

export default ReceiptTemplate;
