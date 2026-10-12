import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IGradingParameter {
  name?: string;
  remarks?: string;
  lowRange?: number;
  highRange?: number;
}

export interface ICommodity extends Document {
  name: string;
  ratePerMtPerDay: number; // ₹ per MT per Day
  ratePerMtMonth?: number; // ₹ per MT per Month
  gradingParameters?: IGradingParameter[];
  userId?: mongoose.Types.ObjectId;
  userEmail?: string;
  createdAt: Date;
  updatedAt: Date;
}

const GradingParameterSchema = new Schema({
  name: { type: String, required: false },
  remarks: { type: String, required: false },
  lowRange: { type: Number, required: false },
  highRange: { type: Number, required: false },
});

const CommoditySchema: Schema = new Schema(
  {
    name: { type: String, required: true, uppercase: true },
    ratePerMtPerDay: { type: Number, required: true, min: 0 },
    ratePerMtMonth: { type: Number, min: 0 },
    gradingParameters: { type: [GradingParameterSchema], required: false, default: [] },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    userEmail: { type: String, required: false },
  },
  { timestamps: true }
);

CommoditySchema.index({ userId: 1, name: 1 }, { unique: true });
CommoditySchema.index({ userEmail: 1, name: 1 });

// Ensure we don't use a cached version of the model during development
if (mongoose.models.Commodity) {
  delete mongoose.models.Commodity;
}

const Commodity: Model<ICommodity> = mongoose.model<ICommodity>('Commodity', CommoditySchema);

export default Commodity;

