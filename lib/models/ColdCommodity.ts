import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ISeasonalPrice {
  fromDate: Date;
  toDate: Date;
  pricePerKg?: number;
  priceLarge?: number;
  priceSmall?: number;
  priceMixed?: number;
}

export interface IQualityParameter {
  name: string;
  unit?: string;
  minValue: number;
  maxValue: number;
}

export interface IColdCommodity extends Document {
  name: string;
  type: string;
  unit: string;
  gradingType?: 'Grading' | 'Wet';
  priceType?: 'Same Price' | 'Different Price';
  seasonalPrices: ISeasonalPrice[];
  qualityParameters?: IQualityParameter[];
  userId?: mongoose.Types.ObjectId;
  userEmail?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SeasonalPriceSchema = new Schema<ISeasonalPrice>(
  {
    fromDate: { type: Date, required: true },
    toDate: { type: Date, required: true },
    pricePerKg: { type: Number, required: false, min: 0.01 },
    priceLarge: { type: Number, required: false, min: 0.01 },
    priceSmall: { type: Number, required: false, min: 0.01 },
    priceMixed: { type: Number, required: false, min: 0.01 },
  },
  { _id: false } // No need for separate IDs on subdocuments
);

const QualityParameterSchema = new Schema<IQualityParameter>(
  {
    name: { type: String, required: true },
    unit: { type: String, required: false },
    minValue: { type: Number, required: true },
    maxValue: { type: Number, required: true },
  },
  { _id: false }
);

const ColdCommoditySchema: Schema = new Schema(
  {
    name: { type: String, required: true, uppercase: true },
    type: { type: String, required: true },
    unit: { type: String, required: true, default: 'KG', uppercase: true },
    gradingType: { type: String, enum: ['Grading', 'Wet'], required: false },
    priceType: { type: String, enum: ['Same Price', 'Different Price'], required: false },
    seasonalPrices: { type: [SeasonalPriceSchema], required: true, default: [] },
    qualityParameters: { type: [QualityParameterSchema], required: false, default: [] },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    userEmail: { type: String, required: false },
  },
  { timestamps: true }
);

// Ensure a user can't create two cold commodities with the exact same name AND type
ColdCommoditySchema.index({ userId: 1, name: 1, type: 1 }, { unique: true });

if (mongoose.models.ColdCommodity) {
  delete mongoose.models.ColdCommodity;
}

const ColdCommodity: Model<IColdCommodity> =
  mongoose.model<IColdCommodity>('ColdCommodity', ColdCommoditySchema);

export default ColdCommodity;
