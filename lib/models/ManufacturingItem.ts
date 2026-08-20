import mongoose, { Schema, Document, Model } from 'mongoose';

export type ManufacturingItemType = 'RAW_MATERIAL' | 'FINISHED_GOOD' | 'WASTE';
export type ManufacturingItemStatus = 'ACTIVE' | 'INACTIVE';

export interface IManufacturingItem extends Document {
  code?: string;
  name: string;
  type: ManufacturingItemType;
  itemType?: ManufacturingItemType;
  category?: string;
  subCategory?: string;
  grade?: string;
  variety?: string;
  unit: string;
  primaryUom?: string;
  secondaryUom?: string;
  conversionFactor?: number;
  hsnCode?: string;
  gstRate?: number;
  purchaseRate?: number;
  openingRate?: number;
  openingStock?: number;
  openingStockValue?: number;
  minimumStock?: number;
  reorderLevel?: number;
  maximumStock?: number;
  storageLocation?: string;
  batchTrackingRequired?: boolean;
  lotTrackingRequired?: boolean;
  expiryTrackingRequired?: boolean;
  qualityTrackingRequired?: boolean;
  wasteType?: string;
  saleApplicable?: boolean;
  saleRate?: number;
  reusable?: boolean;
  recoverable?: boolean;
  status?: ManufacturingItemStatus;
  description?: string;
  remarks?: string;
  supplierId?: mongoose.Types.ObjectId;
  supplierName?: string;
  isActive: boolean;
  userId?: mongoose.Types.ObjectId;
  userEmail?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ManufacturingItemSchema: Schema = new Schema(
  {
    code: { type: String, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['RAW_MATERIAL', 'FINISHED_GOOD', 'WASTE'],
      required: true,
    },
    itemType: {
      type: String,
      enum: ['RAW_MATERIAL', 'FINISHED_GOOD', 'WASTE'],
      required: false,
    },
    category: { type: String, trim: true },
    subCategory: { type: String, trim: true },
    grade: { type: String, trim: true },
    variety: { type: String, trim: true },
    unit: { type: String, required: true, trim: true, default: 'KG' },
    primaryUom: { type: String, trim: true },
    secondaryUom: { type: String, trim: true },
    conversionFactor: { type: Number, min: 0, default: 1 },
    hsnCode: { type: String, trim: true },
    gstRate: { type: Number, min: 0, default: 0 },
    purchaseRate: { type: Number, min: 0, default: 0 },
    openingRate: { type: Number, min: 0, default: 0 },
    openingStock: { type: Number, min: 0, default: 0 },
    openingStockValue: { type: Number, min: 0, default: 0 },
    minimumStock: { type: Number, min: 0, default: 0 },
    reorderLevel: { type: Number, min: 0, default: 0 },
    maximumStock: { type: Number, min: 0, default: 0 },
    storageLocation: { type: String, trim: true },
    batchTrackingRequired: { type: Boolean, default: true },
    lotTrackingRequired: { type: Boolean, default: true },
    expiryTrackingRequired: { type: Boolean, default: false },
    qualityTrackingRequired: { type: Boolean, default: true },
    wasteType: { type: String, trim: true },
    saleApplicable: { type: Boolean, default: false },
    saleRate: { type: Number, min: 0, default: 0 },
    reusable: { type: Boolean, default: false },
    recoverable: { type: Boolean, default: false },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
    description: { type: String, trim: true },
    remarks: { type: String, trim: true },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', required: false },
    supplierName: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    userEmail: { type: String, required: false },
  },
  { timestamps: true }
);

ManufacturingItemSchema.index({ userId: 1, name: 1, type: 1 }, { unique: true });
ManufacturingItemSchema.index({ userId: 1, type: 1, code: 1 }, { unique: true, sparse: true });

const ManufacturingItem: Model<IManufacturingItem> =
  mongoose.models.ManufacturingItem || mongoose.model<IManufacturingItem>('ManufacturingItem', ManufacturingItemSchema);

export default ManufacturingItem;
