/**
 * Daily Average Inventory Ledger Calculation Engine
 * Implements the "Bucket" algorithm for warehouse storage rent calculation
 * Rent formula: ₹10 per day per MT
 */

export interface Transaction {
  _id: string;
  date: string; // ISO date string
  direction: 'INWARD' | 'OUTWARD';
  mt: number;
  clientName: string;
  commodityName: string;
  gatePass: string;
  warehouseId?: string;
  warehouseName?: string;
}

export interface Payment {
  _id: string;
  date: string; // ISO date string
  amount: number;
  clientName: string;
}

export interface LedgerStep {
  stepNo: number;
  startDate: string;
  endDate: string;
  daysDifference: number;
  quantityMT: number;
  commodity: string;
  inventoryBalances: { [commodity: string]: number };
  ratePerDayPerMT: number;
  rentAmount: number;
  transaction?: {
    id: string;
    direction: 'INWARD' | 'OUTWARD';
    gatePass: string;
  };
}

export interface MatchedRecord {
  _id: string;
  clientName: string;
  date: string;
  location?: string;
  commodity?: string;
  totalMT?: number;
}

export interface InvoiceAdjustmentItem {
  id?: string;
  name: string;
  amount: number;
  note?: string;
}

export interface InvoiceAdjustmentSummary {
  invoiceId: string;
  invoiceMonth?: string;
  invoiceDate?: string;
  dueDate?: string;
  status?: string;
  totalAmount: number;
  additionalCharges: number;
  totalInvoiceAmount: number;
  additionalChargeItems: InvoiceAdjustmentItem[];
}

export interface LedgerEntry {
  _id: string;
  clientId: string;
  clientName: string;
  type: 'invoice_generated' | 'invoice_payment' | 'manual_entry';
  referenceId: string;
  referenceType: 'invoice' | 'payment' | 'manual';
  description: string;
  amount: number;
  debit: number;
  credit: number;
  balance: number;
  date: string;
  createdAt: Date;
}

export interface WarehouseBreakdown {
  warehouseId: string;
  warehouseName: string;
  ledgerSummary: LedgerSummary;
}

export interface LedgerSummary {
  clientName: string;
  ledgerSteps: LedgerStep[];
  totalRent: number;
  totalPaid: number;
  rentPaid?: number;
  balance: number;
  paymentHistory: Payment[];
  calculationDate: string; // Today's date when calculation was run
  invoiceSummaries?: InvoiceAdjustmentSummary[];
  invoiceOutstandingTotal?: number;
  warehouseBreakdowns?: WarehouseBreakdown[];
}

export interface AggregatedLedgerSummary extends LedgerSummary {
  matchedRecords: MatchedRecord[];
  recordCount: number;
  isAggregated: boolean;
}

// Default rate: ₹10 per day per MT (fallback if commodity rate not found)
const DEFAULT_RATE_PER_DAY_PER_MT = 10;

/**
 * Parse ISO date string or Date object to Date object, handling timezone correctly
 */
function parseDate(dateStr: string | Date): Date {
  if (dateStr instanceof Date) {
    return new Date(Date.UTC(dateStr.getUTCFullYear(), dateStr.getUTCMonth(), dateStr.getUTCDate()));
  }
  if (typeof dateStr !== 'string') {
    return new Date();
  }
  const str = dateStr.trim();
  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(str.split('T')[0]);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    return new Date(Date.UTC(year, month, day));
  }
  // Try standard parsing directly (avoid splitting by 'T' if it might contain timezone info like GMT)
  const date = new Date(str);
  if (!Number.isNaN(date.getTime())) {
    return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  }
  // Fallback split
  const normalized = str.split('T')[0];
  const secondDate = new Date(normalized);
  if (!Number.isNaN(secondDate.getTime())) {
    return new Date(Date.UTC(secondDate.getUTCFullYear(), secondDate.getUTCMonth(), secondDate.getUTCDate()));
  }
  return new Date();
}

/**
 * Format a date to YYYY-MM-DD string, handling both Date objects and strings
 */
function formatDateToString(date: string | Date): string {
  if (date instanceof Date) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  if (typeof date === 'string') {
    return date.split('T')[0];
  }
  return new Date().toISOString().split('T')[0];
}

/**
 * Calculate days between two dates (inclusive of start, exclusive of end)
 */
function calculateDaysDifference(startDate: Date, endDate: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.ceil((endDate.getTime() - startDate.getTime()) / msPerDay);
}

/**
 * Round to 2 decimal places for currency
 */
function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Main Ledger Calculation Engine
 * Implements the bucket algorithm: process all transactions chronologically,
 * calculate rent for each interval based on current stock, and include outstanding invoices
 */
export function calculateLedger(
  transactions: Transaction[],
  payments: Payment[],
  clientName: string,
  _outstandingInvoices: number = 0,
  commodityRates: Map<string, number> = new Map()
): LedgerSummary {
  // Sort transactions by date
  const sortedTransactions = [...transactions].sort((a, b) => {
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });

  void _outstandingInvoices;

  const normalizeCommodityName = (value: string): string => value?.trim().toUpperCase();

  // Helper function to get rate for a commodity
  const getRate = (commodityName: string): number => {
    const normalized = normalizeCommodityName(commodityName || '');
    const rate = commodityRates.get(normalized) ?? DEFAULT_RATE_PER_DAY_PER_MT;
    console.log(`[LEDGER] Rate lookup for '${commodityName}' -> normalized: '${normalized}' -> rate: ₹${rate}/MT/day`);
    return rate;
  };

  const ledgerSteps: LedgerStep[] = [];
  const inventory = new Map<string, number>();
  let stepNo = 1;

  // If no transactions, return empty ledger
  if (sortedTransactions.length === 0) {
    return {
      clientName,
      ledgerSteps: [],
      totalRent: 0,
      totalPaid: payments.reduce((sum, p) => sum + p.amount, 0),
      balance: 0,
      paymentHistory: payments.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
      calculationDate: new Date().toISOString().split('T')[0],
    };
  }

  // Process each transaction interval
  for (let i = 0; i < sortedTransactions.length; i++) {
    const currentTxn = sortedTransactions[i];
    const currentDate = parseDate(currentTxn.date);
    
    // Get the previous date (or today if first transaction)
    let previousDate: Date;
    if (i === 0) {
      // For the first transaction, we assume storage started from transaction date
      // But in practice, rent calculation starts from inward date to now
      previousDate = currentDate;
    } else {
      previousDate = parseDate(sortedTransactions[i - 1].date);
    }

    // Calculate rent from previous date to current date
    if (i > 0) {
      // Split the interval between previousDate and currentDate into month-aligned buckets
      let cursor = new Date(Date.UTC(previousDate.getUTCFullYear(), previousDate.getUTCMonth(), previousDate.getUTCDate()));
      const normalizedEnd = new Date(Date.UTC(currentDate.getUTCFullYear(), currentDate.getUTCMonth(), currentDate.getUTCDate()));

      while (cursor < normalizedEnd) {
        const nextMonth = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
        const bucketEnd = nextMonth < normalizedEnd ? nextMonth : normalizedEnd;
        const bucketDays = calculateDaysDifference(cursor, bucketEnd);

        // Calculate rent for this bucket
        let bucketRent = 0;
        for (const [commodity, qty] of inventory) {
          const commodityRate = getRate(commodity);
          bucketRent += qty * commodityRate * bucketDays;
        }
        const rentAmount = roundCurrency(bucketRent);
        const totalQuantity = Array.from(inventory.values()).reduce((sum, q) => sum + q, 0);

        ledgerSteps.push({
          stepNo,
          startDate: formatDateToString(cursor),
          endDate: formatDateToString(bucketEnd),
          daysDifference: bucketDays,
          quantityMT: totalQuantity,
          commodity: sortedTransactions[i - 1].commodityName,
          inventoryBalances: Object.fromEntries(inventory),
          ratePerDayPerMT: getRate(sortedTransactions[i - 1].commodityName),
          rentAmount,
        });

        stepNo++;
        cursor = bucketEnd;
      }
    }

    // Update inventory after transaction
    const commodity = normalizeCommodityName(currentTxn.commodityName);
    const currentQty = inventory.get(commodity) || 0;
    if (currentTxn.direction === 'INWARD') {
      inventory.set(commodity, currentQty + currentTxn.mt);
    } else {
      inventory.set(commodity, Math.max(0, currentQty - currentTxn.mt)); // Prevent negative
    }

    // Add transaction record
    const lastStep = ledgerSteps[ledgerSteps.length - 1];
    if (lastStep) {
      lastStep.transaction = {
        id: currentTxn._id,
        direction: currentTxn.direction,
        gatePass: currentTxn.gatePass,
      };
    }
  }

  // Final period: from last transaction to today's as-of date
  if (sortedTransactions.length > 0) {
    const lastTxnDate = parseDate(sortedTransactions[sortedTransactions.length - 1].date);
    const now = new Date();
    const asOfDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const daysDiff = calculateDaysDifference(lastTxnDate, asOfDate);
    const totalQuantity = Array.from(inventory.values()).reduce((sum, qty) => sum + qty, 0);
    if (daysDiff > 0 && totalQuantity > 0) {
      // Split final period into month-aligned buckets to ensure each calendar month shows carried-forward rent
      let cursor = new Date(Date.UTC(lastTxnDate.getUTCFullYear(), lastTxnDate.getUTCMonth(), lastTxnDate.getUTCDate()));
      const normalizedEnd = new Date(Date.UTC(asOfDate.getUTCFullYear(), asOfDate.getUTCMonth(), asOfDate.getUTCDate()));

      while (cursor < normalizedEnd) {
        const nextMonth = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
        const bucketEnd = nextMonth < normalizedEnd ? nextMonth : normalizedEnd;
        const bucketDays = calculateDaysDifference(cursor, bucketEnd);

        let bucketRent = 0;
        for (const [commodity, qty] of inventory) {
          const commodityRate = getRate(commodity);
          bucketRent += qty * commodityRate * bucketDays;
        }

        const rentAmount = roundCurrency(bucketRent);

        ledgerSteps.push({
          stepNo,
          startDate: formatDateToString(cursor),
          endDate: formatDateToString(bucketEnd),
          daysDifference: bucketDays,
          quantityMT: totalQuantity,
          commodity: sortedTransactions[sortedTransactions.length - 1].commodityName,
          inventoryBalances: Object.fromEntries(inventory),
          ratePerDayPerMT: getRate(sortedTransactions[sortedTransactions.length - 1].commodityName),
          rentAmount,
        });

        stepNo++;
        cursor = bucketEnd;
      }
    }
  }

  // Calculate totals
  const totalRent = roundCurrency(ledgerSteps.reduce((sum, step) => sum + step.rentAmount, 0));
  const sortedPayments = payments.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const totalPaid = roundCurrency(sortedPayments.reduce((sum, p) => sum + p.amount, 0));
  const rentPaid = roundCurrency(Math.min(totalPaid, totalRent));

  // Balance = Total Rent - Total Paid
  const balance = roundCurrency(totalRent - totalPaid);

  const calculationDate = new Date();
  calculationDate.setHours(0, 0, 0, 0);

  return {
    clientName,
    ledgerSteps,
    totalRent,
    totalPaid,
    rentPaid,
    balance,
    paymentHistory: sortedPayments,
    calculationDate: formatDateToString(calculationDate),
  };
}

/**
 * Export ledger as CSV (for audit trails)
 */
export function exportLedgerAsCSV(summary: LedgerSummary): string {
  const lines: string[] = [];
  
  lines.push(`Client Name,${summary.clientName}`);
  lines.push(`Calculation Date,${summary.calculationDate}`);
  lines.push('');
  lines.push('LEDGER STEPS');
  lines.push('Step No,Start Date,End Date,Days,Quantity (MT),Rate (₹/day/MT),Rent Amount (₹)');
  
  summary.ledgerSteps.forEach(step => {
    lines.push(
      `${step.stepNo},${step.startDate},${step.endDate},${step.daysDifference},${step.quantityMT},${step.ratePerDayPerMT},${step.rentAmount}`
    );
  });
  
  lines.push('');
  lines.push('SUMMARY');
  lines.push(`Total Rent,${summary.totalRent}`);
  lines.push(`Total Paid,${summary.totalPaid}`);
  lines.push(`Outstanding Balance,${summary.balance}`);
  
  return lines.join('\n');
}
