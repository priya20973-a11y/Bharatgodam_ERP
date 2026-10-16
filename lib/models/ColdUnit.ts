import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IColdUnit extends Document {
  name: string;
  code: string;
  unitType?: 'Unit' | 'SI Unit' | 'Both';
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ColdUnitSchema = new Schema<IColdUnit>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      trim: true,
    },
    unitType: {
      type: String,
      enum: ['Unit', 'SI Unit', 'Both'],
      default: 'Unit',
      required: true,
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

ColdUnitSchema.index({ unitType: 1, name: 1 });
ColdUnitSchema.index({ unitType: 1, code: 1 });

const ColdUnit: Model<IColdUnit> =
  mongoose.models.ColdUnit || mongoose.model<IColdUnit>('ColdUnit', ColdUnitSchema);

export default ColdUnit;

