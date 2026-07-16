import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IColdInwardDraft extends Document {
  tenantId?: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId;
  userEmail?: string;
  formData: any;
  createdAt: Date;
  updatedAt: Date;
}

const ColdInwardDraftSchema: Schema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant' },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    userEmail: { type: String },
    formData: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

const ColdInwardDraft: Model<IColdInwardDraft> =
  mongoose.models.ColdInwardDraft || mongoose.model<IColdInwardDraft>('ColdInwardDraft', ColdInwardDraftSchema);

export default ColdInwardDraft;
