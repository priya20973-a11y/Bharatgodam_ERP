import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IReceiptConfig {
  numberingType: 'GLOBAL' | 'CHAMBER_WISE';
  prefix?: string;
  startingNumber: number;
  numberPadding?: number;
  suffix?: string;
}

export interface IReferencePerson {
  name: string;
  mobile: string;
  email: string;
  designation: string;
}

export interface IColdStack {
  name: string;
  stackNo: number;
  capacity: number;
}

export interface IColdFloor {
  name: string;
  floorNo: number;
  stacks: IColdStack[];
  stackLayout?: 'ROW_WISE' | 'COLUMN_WISE' | 'REVERSE_ROW_WISE' | 'REVERSE_COLUMN_WISE' | 'CUSTOM';
  gridRows?: number;
  gridCols?: number;
  customLayout?: ICustomStackMapping[];
}

export interface IColdChamber {
  name: string;
  chamberNo?: number;
  floors: IColdFloor[];
}

export interface ICustomStackMapping {
  rowIndex: number;
  colIndex: number;
  stackNo: number;
}

export interface IColdWarehouse extends Document {
  warehouseId?: string;
  name: string;
  address: string;
  noOfChambers: number;
  noOfFloors: number;
  noOfStacks: number;
  stackCapacity: number; // in Kg
  bufferCapacity: number; // buffer allowed in Kg
  totalCapacity: number; // calculated total in Kg

  // Hierarchy Configuration Options
  sameFloorsPerChamber?: boolean;
  sameStacksPerFloor?: boolean;
  sameStackLayoutPerFloor?: boolean;
  stackNumberingOption?: 'RESTART_PER_FLOOR' | 'CONTINUE_ACROSS_FLOORS';
  chamberFloorsConfig?: number[];
  floorStacksConfig?: Record<string, number>;
  customStackCapacities?: Record<string, number>;

  aadhaarNo?: string;
  panNo?: string;
  gstin?: string;
  bankDetails?: {
    bankName: string;
    accountNo: string;
    ifsc: string;
    branch: string;
  };
  warehouseLogo?: string;
  termsAndConditions?: string;
  
  // Layout Configuration
  stackLayout: 'ROW_WISE' | 'COLUMN_WISE' | 'REVERSE_ROW_WISE' | 'REVERSE_COLUMN_WISE' | 'CUSTOM';
  gridRows?: number;
  gridCols?: number;
  customLayout?: ICustomStackMapping[];

  // Receipt Numbering Configuration
  receiptConfig?: {
    inward: IReceiptConfig;
    outward: IReceiptConfig;
    invoice: IReceiptConfig;
  };

  referencePersons: IReferencePerson[];
  status: 'ACTIVE' | 'INACTIVE';
  chambers: IColdChamber[];
  userId?: mongoose.Types.ObjectId;
  userEmail?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ReferencePersonSchema = new Schema({
  name: { type: String, required: true },
  mobile: { type: String },
  email: { type: String },
  designation: { type: String }
});

const StackSchema = new Schema({
  name: { type: String, required: true },
  stackNo: { type: Number, required: true },
  capacity: { type: Number, required: true }
});

const CustomStackMappingSchema = new Schema({
  rowIndex: { type: Number, required: true },
  colIndex: { type: Number, required: true },
  stackNo: { type: Number, required: true }
}, { _id: false });

const FloorSchema = new Schema({
  name: { type: String, required: true },
  floorNo: { type: Number, required: true },
  stacks: [StackSchema],
  stackLayout: { 
    type: String, 
    enum: ['ROW_WISE', 'COLUMN_WISE', 'REVERSE_ROW_WISE', 'REVERSE_COLUMN_WISE', 'CUSTOM'],
    default: 'ROW_WISE'
  },
  gridRows: { type: Number, required: false },
  gridCols: { type: Number, required: false },
  customLayout: [CustomStackMappingSchema]
});

const ChamberSchema = new Schema({
  name: { type: String, required: true },
  chamberNo: { type: Number, required: false },
  floors: [FloorSchema]
});

const ColdWarehouseSchema: Schema = new Schema(
  {
    warehouseId: { type: String, required: false },
    name: { type: String, required: true },
    address: { type: String, required: true },
    noOfChambers: { type: Number, required: true, min: 1 },
    noOfFloors: { type: Number, required: true, min: 1 },
    noOfStacks: { type: Number, required: true, min: 1 },
    stackCapacity: { type: Number, required: true, min: 0 },
    bufferCapacity: { type: Number, required: true, default: 0, min: 0 },
    totalCapacity: { type: Number, required: true, min: 0 },
    
    sameFloorsPerChamber: { type: Boolean, default: true },
    sameStacksPerFloor: { type: Boolean, default: true },
    sameStackLayoutPerFloor: { type: Boolean, default: true },
    stackNumberingOption: {
      type: String,
      enum: ['RESTART_PER_FLOOR', 'CONTINUE_ACROSS_FLOORS'],
      default: 'RESTART_PER_FLOOR'
    },
    chamberFloorsConfig: [Number],
    floorStacksConfig: { type: Schema.Types.Mixed, required: false },
    customStackCapacities: { type: Schema.Types.Mixed, required: false },
    
    receiptConfig: {
      inward: {
        numberingType: { type: String, enum: ['GLOBAL', 'CHAMBER_WISE'], default: 'GLOBAL' },
        prefix: { type: String, required: false },
        startingNumber: { type: Number, required: true, default: 1 },
        numberPadding: { type: Number, required: false },
        suffix: { type: String, required: false }
      },
      outward: {
        numberingType: { type: String, enum: ['GLOBAL', 'CHAMBER_WISE'], default: 'GLOBAL' },
        prefix: { type: String, required: false },
        startingNumber: { type: Number, required: true, default: 1 },
        numberPadding: { type: Number, required: false },
        suffix: { type: String, required: false }
      },
      invoice: {
        numberingType: { type: String, enum: ['GLOBAL', 'CHAMBER_WISE'], default: 'GLOBAL' },
        prefix: { type: String, required: false },
        startingNumber: { type: Number, required: true, default: 1 },
        numberPadding: { type: Number, required: false },
        suffix: { type: String, required: false }
      }
    },
    
    aadhaarNo: { type: String, required: false },
    panNo: { type: String, required: false },
    gstin: { type: String, required: false },
    bankDetails: {
      bankName: { type: String, required: false },
      accountNo: { type: String, required: false },
      ifsc: { type: String, required: false },
      branch: { type: String, required: false }
    },
    warehouseLogo: { type: String, required: false },
    termsAndConditions: { type: String, required: false },
    
    stackLayout: { 
      type: String, 
      enum: ['ROW_WISE', 'COLUMN_WISE', 'REVERSE_ROW_WISE', 'REVERSE_COLUMN_WISE', 'CUSTOM'],
      default: 'ROW_WISE'
    },
    gridRows: { type: Number, required: false },
    gridCols: { type: Number, required: false },
    customLayout: [CustomStackMappingSchema],

    referencePersons: [ReferencePersonSchema],
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE',
    },
    chambers: [ChamberSchema],
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    userEmail: { type: String, required: false },
  },
  { timestamps: true }
);

ColdWarehouseSchema.index({ userId: 1, name: 1 }, { unique: true });

if (mongoose.models.ColdWarehouse) {
  delete mongoose.models.ColdWarehouse;
}

const ColdWarehouse: Model<IColdWarehouse> = mongoose.model<IColdWarehouse>('ColdWarehouse', ColdWarehouseSchema);

export default ColdWarehouse;
