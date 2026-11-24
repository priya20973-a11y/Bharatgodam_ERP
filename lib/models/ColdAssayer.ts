import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IColdAssayer extends Document {
  name: string;
  licenceNumber: string;
  status: 'Active' | 'Expired';
  userId?: mongoose.Types.ObjectId;
  userEmail?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ColdAssayerSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    licenceNumber: { type: String, required: true },
    status: { type: String, enum: ['Active', 'Expired'], default: 'Active', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    userEmail: { type: String, required: false },
  },
  { timestamps: true }
);

ColdAssayerSchema.index({ userId: 1, licenceNumber: 1 }, { unique: true });
ColdAssayerSchema.index(
  { userEmail: 1, licenceNumber: 1 },
  {
    unique: true,
    partialFilterExpression: {
      $or: [{ userId: { $exists: false } }, { userId: null }],
      userEmail: { $exists: true, $ne: null },
    }
  }
);

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.ColdAssayer;
}

const ColdAssayer: Model<IColdAssayer> =
  mongoose.models.ColdAssayer || mongoose.model<IColdAssayer>('ColdAssayer', ColdAssayerSchema);

export default ColdAssayer;
