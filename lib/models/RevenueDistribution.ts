import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IRevenueDistribution extends Document {
  inwardId: mongoose.Types.ObjectId;
  clientId: mongoose.Types.ObjectId;
  warehouseId: mongoose.Types.ObjectId;
  totalAmount: number;
  ownerShare: number;   // 60%
  platformShare: number; // 40%
  timestamp: Date;
  userId?: mongoose.Types.ObjectId;
  userEmail?: string;
  createdAt: Date;
  updatedAt: Date;
}

const RevenueDistributionSchema: Schema = new Schema(
  {
    inwardId: { type: Schema.Types.ObjectId, ref: 'Inward', required: true },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    totalAmount: { type: Number, required: true },
    ownerShare: { type: Number, required: true },
    platformShare: { type: Number, required: true },
    timestamp: { type: Date, default: Date.now },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    userEmail: { type: String, required: false },
  },
  { timestamps: true }
);

const RevenueDistribution: Model<IRevenueDistribution> =
  mongoose.models.RevenueDistribution || mongoose.model<IRevenueDistribution>('RevenueDistribution', RevenueDistributionSchema);

export default RevenueDistribution;
