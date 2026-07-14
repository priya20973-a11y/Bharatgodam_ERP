import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ICommodity extends Document {
  name: string;
  ratePerMtPerDay: number; // ₹ per MT per Day
  ratePerMtMonth?: number; // ₹ per MT per Month
  userId?: mongoose.Types.ObjectId;
  userEmail?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CommoditySchema: Schema = new Schema(
  {
    name: { type: String, required: true, uppercase: true },
    ratePerMtPerDay: { type: Number, required: true, min: 0 },
    ratePerMtMonth: { type: Number, min: 0 },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    userEmail: { type: String, required: false },
  },
  { timestamps: true }
);

CommoditySchema.index({ userId: 1, name: 1 }, { unique: true });

delete mongoose.models.Commodity;
const Commodity: Model<ICommodity> = mongoose.model<ICommodity>('Commodity', CommoditySchema);

export default Commodity;
