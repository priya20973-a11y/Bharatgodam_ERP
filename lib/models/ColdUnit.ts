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

if (mongoose.models.ColdUnit) {
  delete mongoose.models.ColdUnit;
}
const ColdUnit = mongoose.model<IColdUnit>('ColdUnit', ColdUnitSchema);

export default ColdUnit;
