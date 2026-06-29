/**
 * Invoice Data Types
 * Defines the structure for warehouse invoices matching "POSSIBLE WAREHOUSING LLP" format
 */

export interface CompanyInfo {
  name: string;
  address: string;
  email: string;
  website: string;
  phone: string;
  gstin: string;
  pan?: string;
  logo?: string; // Base64 or URL
}

export interface CustomerInfo {
  name: string;
  shopNo?: string;
  area: string;
  marketYard?: string;
  city: string;
  district: string;
  state: string;
  pincode?: string;
  contact?: string;
  gstin?: string;
  pan?: string;
}

export interface InvoiceMetadata {
  invoiceId?: string;
  invoiceNo: string;
  invoiceNumber?: string;
  invoiceDate: string; // Format: DD/MM/YYYY
  gstin?: string;
}

export interface BankDetails {
  bankName: string;
  accountName?: string;
  branchName: string;
  accountNumber: string;
  ifscCode: string;
}

export interface LineItem {
  whCode: string;
  billFrom: string;
  itemName: string;
  corNo: string;
  billTo: string;
  quantity: number;
  weight: number; // MT
  month: string;
  days: number;
  ratePerUnit: number;
  storageChargesPerMonth: number;
  amount: number;
}

export interface FinancialSummary {
  basicTotal: number;
  roundOff: number;
  netAmount: number;
}

export interface TermsAndCondition {
  title: string;
  description: string;
}

export interface InvoiceData {
  company: CompanyInfo;
  customer: CustomerInfo;
  metadata: InvoiceMetadata;
  lineItems: LineItem[];
  financial: FinancialSummary;
  bankDetails: BankDetails;
  termsAndConditions: TermsAndCondition[];
  authorizedBy?: string; // Signatory name
  notes?: string;
}
