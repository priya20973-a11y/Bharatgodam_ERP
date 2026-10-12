import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IAssayer extends Document {
  name: string;
  licenceNumber: string;
  status: 'Active' | 'Expired';
  userId?: mongoose.Types.ObjectId;
  userEmail?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AssayerSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    licenceNumber: { type: String, required: true },
    status: { type: String, enum: ['Active', 'Expired'], default: 'Active', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    userEmail: { type: String, required: false },
  },
  { timestamps: true }
);

AssayerSchema.index({ userId: 1, licenceNumber: 1 }, { unique: true });
AssayerSchema.index(
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
  delete mongoose.models.Assayer;
}

const Assayer: Model<IAssayer> = mongoose.models.Assayer || mongoose.model<IAssayer>('Assayer', AssayerSchema);

export default Assayer;
