import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IInward extends Document {
  clientId: mongoose.Types.ObjectId;
  commodityId: mongoose.Types.ObjectId;
  warehouseId: mongoose.Types.ObjectId;
  quantityMT: number;
  bagsCount: number;
  stackNo?: string;
  lotNo?: string;
  gatePass?: string;
  date: Date;
  outwardDate: Date;
  userId?: mongoose.Types.ObjectId;
  userEmail?: string;
  createdAt: Date;
  updatedAt: Date;
}

const InwardSchema: Schema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    commodityId: { type: Schema.Types.ObjectId, ref: 'Commodity', required: true },
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    quantityMT: { type: Number, required: true, min: 0 },
    bagsCount: { type: Number, required: true, min: 0 },
    stackNo: { type: String, trim: true },
    lotNo: { type: String, trim: true },
    gatePass: { type: String, trim: true },
    date: { type: Date, default: Date.now },
    outwardDate: { type: Date, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    userEmail: { type: String, required: false },
  },
  { timestamps: true }
);

const Inward: Model<IInward> =
  mongoose.models.Inward || mongoose.model<IInward>('Inward', InwardSchema);

export default Inward;
