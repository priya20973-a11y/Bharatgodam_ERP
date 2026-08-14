import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IClient extends Document {
  name: string;
  nameKey: string;
  address: string;
  clientType: 'FARMER' | 'FPO' | 'COMPANY' | 'PURCHASE';
  mobile: string;
  panNumber: string;
  aadharNumber: string;
  gstNumber: string;
  state?: string;
  commodityIds?: mongoose.Types.ObjectId[];
  userId?: mongoose.Types.ObjectId;
  userEmail?: string;
  email?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ClientSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    nameKey: { type: String, required: true, uppercase: true },
    address: { type: String, required: true },
    state: { type: String, required: false },
    clientType: {
      type: String,
      enum: ['FARMER', 'FPO', 'COMPANY', 'PURCHASE'],
      required: true,
    },
    mobile: { type: String, required: true },
    panNumber: { type: String, required: true },
    aadharNumber: { type: String, required: true },
    gstNumber: { type: String, required: true },
    commodityIds: [{ type: Schema.Types.ObjectId, ref: 'Commodity' }],
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    userEmail: { type: String, required: false },
    email: { type: String, required: function() { return this.isNew === true; } },
  },
  { timestamps: true }
);

ClientSchema.index({ userId: 1, nameKey: 1 }, { unique: true });
ClientSchema.index(
  { userEmail: 1, nameKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      $or: [{ userId: { $exists: false } }, { userId: null }],
      userEmail: { $exists: true, $ne: null },
      nameKey: { $exists: true, $ne: null }
    }
  }
);

const Client: Model<IClient> =
  mongoose.models.Client || mongoose.model<IClient>('Client', ClientSchema);

export default Client;
