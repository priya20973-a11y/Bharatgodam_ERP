import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IColdPledgee extends Document {
  name: string;
  type: 'NBFC' | 'Bank' | 'Other';
  iifcCode?: string;
  address?: string;
  personName?: string;
  mobile?: string;
  userId?: mongoose.Types.ObjectId;
  userEmail?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ColdPledgeeSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    type: { type: String, enum: ['NBFC', 'Bank', 'Other'], required: true },
    iifcCode: { type: String, required: function(this: any) { return this.type === 'Bank'; } },
    address: { type: String },
    personName: { type: String },
    mobile: { type: String },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    userEmail: { type: String, required: false },
  },
  { timestamps: true }
);

ColdPledgeeSchema.index({ userId: 1, name: 1 }, { unique: true });
ColdPledgeeSchema.index(
  { userEmail: 1, name: 1 },
  {
    unique: true,
    partialFilterExpression: {
      $or: [{ userId: { $exists: false } }, { userId: null }],
      userEmail: { $exists: true, $ne: null },
    }
  }
);

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.ColdPledgee;
}

const ColdPledgee: Model<IColdPledgee> =
  mongoose.models.ColdPledgee || mongoose.model<IColdPledgee>('ColdPledgee', ColdPledgeeSchema);

export default ColdPledgee;
