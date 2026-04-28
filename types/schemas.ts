import { ObjectId } from 'mongodb';

export interface IUser {
  _id?: ObjectId;
  email: string;
  passwordHash: string;
  role: 'ADMIN' | 'WSP' | 'MANAGER' | 'PICKER' | 'STAFF';
  createdAt: Date;
}

export interface IZone {
  _id?: ObjectId;
  name: string;
  totalCapacity: number;
  type: 'DRY_STORAGE' | 'COLD_STORAGE' | 'HAZARDOUS';
  pricePerSqFt: number;
}

export interface IWarehouse {
  _id?: ObjectId;
  name: string;
  ownerName: string;
  ownerEquity: number; // Percentage (e.g., 60 for 60%)
  location: string;
  capacity: number;
  occupiedCapacity: number; // Current occupied capacity in MT
  type: 'DRY_STORAGE' | 'COLD_STORAGE' | 'HAZARDOUS';
  userId?: ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * ClientAccount: Represents a unique ledger account for a client
 * Groups multiple bookings, commodities, and transactions under one account ID
 * Prevents name collisions by using unique bookingId as the account identifier
 */
export interface IClientAccount {
  _id?: ObjectId;
  bookingId: string; // Unique identifier (UUID or custom ID) - PRIMARY KEY for ledger grouping
  clientName: string;
  clientLocation?: string;
  contactInfo?: {
    email?: string;
    phone?: string;
    contactPerson?: string;
  };
  accountStatus: 'ACTIVE' | 'INACTIVE' | 'CLOSED';
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Transaction: Individual warehouse transaction linked to a ClientAccount
 * All transactions under the same accountId roll up into one consolidated ledger
 */
export interface ITransaction {
  _id?: ObjectId;
  accountId: string; // Reference to IClientAccount.bookingId
  date: string; // ISO date string (YYYY-MM-DD)
  direction: 'INWARD' | 'OUTWARD';
  commodityName: string;
  quantityMT: number;
  gatePass: string;
  warehouseName?: string;
  location?: string;
  userId?: ObjectId;
  createdAt: Date;
}

/**
 * Payment: Payment record linked to a ClientAccount
 * All payments under the same accountId contribute to the account balance
 */
export interface IPayment {
  _id?: ObjectId;
  accountId: string; // Reference to IClientAccount.bookingId
  date: string; // ISO date string (YYYY-MM-DD)
  amount: number;
  paymentMethod?: 'CASH' | 'CHEQUE' | 'BANK_TRANSFER' | 'NEFT' | 'RTGS';
  referenceNumber?: string;
  remarks?: string;
  recordedBy?: string;
  createdAt: Date;
}

/**
 * LedgerTimeState: TIME-STATE SYSTEM tracking
 * Tracks continuous stock presence over time with automatic period splitting
 * When stock is partially removed, entries are automatically split
 * History is never overwritten - only new entries added
 * 
 * Example:
 * Inward: 1 Jan 2026 (100 MT) → Outward: 20 Mar 2026 (remove 30 MT)
 * Creates entries:
 * - 1 Jan – 31 Jan: 100 MT, Active
 * - 1 Feb – 28 Feb: 100 MT, Active
 * - 1 Mar – 20 Mar: 100 MT, Active
 * - 20 Mar onwards: 70 MT, Active (split entry showing remainder)
 */
export interface ILedgerTimeState {
  _id?: ObjectId;
  accountId: string; // Reference to IClientAccount.bookingId
  periodStartDate: string; // ISO date string (YYYY-MM-DD)
  periodEndDate: string; // ISO date string (YYYY-MM-DD) - null for ongoing
  quantityMT: number; // Stock quantity during this period
  status: 'ACTIVE' | 'REMOVED' | 'PARTIAL_REMOVAL' | 'CLOSED'; // Stock status
  reasonForChange?: string; // Why status changed (e.g., "Outward - Partial Removal")
  affectedTransaction?: {
    transactionId: string;
    direction: 'INWARD' | 'OUTWARD';
    quantity: number;
    date: string;
  };
  commodityName?: string; // Commodity stored during this period
  ratePerDayPerMT?: number; // Storage rate for this period (₹10 default)
  rentCalculated?: number; // Pre-calculated rent for this period
  historicalRecord: boolean; // true = past period (immutable), false = ongoing
  createdAt: Date;
  updatedAt: Date;
}

export interface ILogisticsBooking {
  _id?: ObjectId;
  accountId?: string; // NEW: Reference to IClientAccount.bookingId for ledger grouping
  userId: ObjectId;
  customerName: string;      
  mobileNumber: string;      
  commodity: 'GRAINS' | 'ELECTRONICS' | 'CHEMICALS' | 'STEEL' | 'PERISHABLES'; 
  truckNumber: string;       
  weightTons: number;        
  startDate: Date;
  endDate: Date;
  warehouseId?: ObjectId; // Reference to warehouse
  warehouseName?: string; // Denormalized for performance
  
  // 1. Flow & Location
  direction: 'INWARD' | 'OUTWARD';
  date: string; // ISO Date String
  location: string;

  // 2. Stakeholders
  clientName: string;
  clientLocation?: string;
  suppliers?: string;

  // 3. Tracking Specs
  commodityName: string;
  cadNo?: string;
  stackNo?: string;
  lotNo?: string;
  doNumber?: string;
  cdfNo?: string;

  // 4. Gate & Quantities
  gatePass: string;
  pass?: string;
  bags: number;
  palaBags: number;
  mt: number;

  // 5. Billing Configuration
  storageDays: number;
  
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  createdAt: Date;
}

// Alias for detailed booking information used in reports
export type IDetailedBooking = ILogisticsBooking;

export interface IInvoice {
  _id?: ObjectId;
  bookingId: ObjectId;
  sNo?: number; // Mapping backwards compatibility to Legacy Array
  clientEmail: string;
  customerName: string;
  commodity: string;
  warehouseId?: ObjectId; // Reference to warehouse
  warehouseName?: string; // Denormalized for performance
  durationDays?: number; // Legacy daily tracker
  daysStored?: number; // New outward withdrawal tracker
  billingCycles?: number; // Monthly calculation brackets
  rateApplied: number;
  baseStorageCost?: number; // Decoupled storage vs handling
  handlingFee?: number;
  subtotal: number;
  totalAmount?: number; // Final total (no tax)
  finalTotal?: number; // Final Settlement sum
  paidAmount?: number; // Amount already paid
  pendingAmount?: number; // Amount still due (calculated)
  status: 'UNPAID' | 'PAID' | 'PENDING_SETTLEMENT' | 'PARTIALLY_PAID';
  invoiceType?: 'STANDARD_STORAGE' | 'FINAL_WITHDRAWAL';
  generatedAt: Date;
  createdBy?: string;
  userId?: ObjectId;
}

// NEW SCHEMAS FOR REDESIGNED LEDGER + INVOICE SYSTEM

/**
 * StockEntry: Unified record for inward and outward stock movements
 * Each entry represents a stock transaction with full metadata
 */
export interface IStockEntry {
  _id?: ObjectId;
  clientId: ObjectId; // Reference to clients collection
  warehouseId: ObjectId; // Reference to warehouses collection
  commodityId: ObjectId; // Reference to commodities collection
  direction: 'INWARD' | 'OUTWARD';
  quantityMT: number;
  bagsCount?: number;
  inwardDate: string; // ISO date string (YYYY-MM-DD)
  actualOutwardDate?: string; // Final actual date (for out wards)
  ratePerMTPerDay: number; // Storage rate
  gatePass?: string;
  remarks?: string;
  userId?: ObjectId;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  createdAt: Date;
  updatedAt: Date;
}

/**
 * LedgerEntry: Time-state segments for stock presence
 * Tracks continuous stock over time, splits on changes
 * Event-driven, never overwrites history
 */
export interface ILedgerEntry {
  _id?: ObjectId;
  stockEntryId: ObjectId; // Reference to IStockEntry
  clientId: ObjectId;
  warehouseId: ObjectId;
  commodityId: ObjectId;
  periodStartDate: string; // ISO date string
  periodEndDate?: string | null; // ISO date string, null for ongoing
  quantityMT: number; // Quantity present during this period
  status: 'ACTIVE' | 'CLOSED' | 'SPLIT';
  ratePerMTPerDay: number;
  version: number; // For audit trail, increments on changes
  changeReason?: string; // Why this entry was created/split
  previousEntryId?: ObjectId; // Link to previous version
  userId?: ObjectId;
  createdAt: Date;
  // Populated by aggregation lookups
  commodity?: ICommodity;
}

/**
 * InvoiceMaster: Monthly invoice header
 * Generated at month-end for each client-warehouse combination
 */
export interface IInvoiceMaster {
  _id?: ObjectId;
  clientId: ObjectId;
  warehouseId: ObjectId;
  invoiceId?: string;
  invoiceMonth: string; // YYYY-MM format
  totalAmount: number;
  status: 'DRAFT' | 'FINAL' | 'PAID' | 'OVERDUE';
  generatedAt: Date;
  dueDate: string; // ISO date string
  paidAmount?: number;
  userId?: ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * InvoiceLineItem: Detailed breakdown within invoice
 * Commodity-wise charges for the month
 */
export interface IInvoiceLineItem {
  _id?: ObjectId;
  invoiceMasterId: ObjectId;
  commodityId: ObjectId;
  commodityName?: string; // Added for display purposes
  daysOccupied: number;
  averageQuantityMT: number;
  ratePerMTPerDay: number;
  totalAmount: number;
  periodStart: string; // ISO date
  periodEnd: string; // ISO date
  userId?: ObjectId;
  createdAt: Date;
}

/**
 * Client: Master table for clients
 */
export interface IClient {
  _id?: ObjectId;
  name: string; // Unique, case-insensitive
  location?: string;
  contactInfo?: {
    email?: string;
    phone?: string;
    contactPerson?: string;
  };
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Commodity: Master table for commodities
 */
export interface ICommodity {
  _id?: ObjectId;
  name: string; // Unique
  category?: string;
  unit: 'MT' | 'KG' | 'TONS';
  ratePerMtPerDay?: number;
  ratePerMtMonth?: number;
  createdAt: Date;
}
