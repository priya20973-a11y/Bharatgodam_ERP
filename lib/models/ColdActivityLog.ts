import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IColdActivityLog extends Document {
  userId: string;
  userName: string;
  userRole: string;
  actionType: 'CREATE' | 'UPDATE' | 'DELETE' | 'OTHER';
  module: string;
  recordId?: string;
  description: string;
  previousValue?: any;
  newValue?: any;
  storageType?: 'Cold Storage' | 'Dry Storage';
  createdAt: Date;
  updatedAt: Date;
}

const ColdActivityLogSchema = new Schema(
  {
    userId: { type: String, required: true },
    userName: { type: String, required: true },
    userRole: { type: String, required: true },
    actionType: {
      type: String,
      enum: ['CREATE', 'UPDATE', 'DELETE', 'OTHER'],
      required: true,
    },
    module: { type: String, required: true },
    recordId: { type: String, required: false },
    description: { type: String, required: true },
    previousValue: { type: Schema.Types.Mixed, required: false },
    newValue: { type: Schema.Types.Mixed, required: false },
    storageType: { type: String, enum: ['Cold Storage', 'Dry Storage'], required: false, default: 'Cold Storage' },
  },
  { timestamps: true }
);

ColdActivityLogSchema.index({ userId: 1 });
ColdActivityLogSchema.index({ module: 1 });
ColdActivityLogSchema.index({ actionType: 1 });
ColdActivityLogSchema.index({ storageType: 1 });
ColdActivityLogSchema.index({ createdAt: -1 });

if (mongoose.models.ColdActivityLog) {
  delete mongoose.models.ColdActivityLog;
}

const ColdActivityLog: Model<IColdActivityLog> = mongoose.model<IColdActivityLog>('ColdActivityLog', ColdActivityLogSchema);

export default ColdActivityLog;
