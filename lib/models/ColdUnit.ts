import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IColdUnit extends Document {
  name: string;
  code: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ColdUnitSchema = new Schema<IColdUnit>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

ColdUnitSchema.index({ userId: 1 });
ColdUnitSchema.index({ userEmail: 1 });

const ColdUnit: Model<IColdUnit> =
  mongoose.models.ColdUnit || mongoose.model<IColdUnit>('ColdUnit', ColdUnitSchema);

export default ColdUnit;

