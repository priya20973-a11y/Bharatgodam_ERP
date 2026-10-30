/**
 * Daily Average Inventory Ledger Calculation Engine
 * Implements the "Bucket" algorithm for warehouse storage rent calculation
 * Rent formula: ₹10 per day per MT
 */

export interface Transaction {
  _id: string;
  transactionId?: string;
  receiptNumber?: string;
  date: string; // ISO date string
  direction: 'INWARD' | 'OUTWARD';
  mt: number;
  clientName: string;
  commodityName: string;
  gatePass: string;
  actualWeight?: number;
  netWeightLoss?: number;
  warehouseId?: string;
  warehouseName?: string;
  partyName?: string;
}

export interface Payment {
  _id: string;
  transactionId?: string;
  receiptNumber?: string;
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
    transactionId?: string;
    receiptNumber?: string;
    direction: 'INWARD' | 'OUTWARD';
    gatePass: string;
    actualWeight?: number;
    netWeightLoss?: number;
    partyName?: string;
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
 * Check if a value is a 24-character hexadecimal MongoDB ObjectId string
 */
export function isMongoObjectId(val: any): boolean {
  if (!val) return false;
  const str = typeof val === 'string' ? val.trim() : String(val || '').trim();
  return /^[0-9a-fA-F]{24}$/.test(str);
}

/**
 * Sanitize client name so that MongoDB ObjectIds, null, undefined, or empty strings
 * are never displayed as client names.
 */
export function sanitizeClientName(name: any, fallback = 'Unknown Client'): string {
  if (!name || typeof name !== 'string') return fallback;
  const trimmed = name.trim();
  if (!trimmed || isMongoObjectId(trimmed) || trimmed.toLowerCase() === 'null' || trimmed.toLowerCase() === 'undefined') {
    return fallback;
  }
  return trimmed;
}

/**
 * Sanitize transaction ID / reference so that MongoDB ObjectIds, null, undefined,
 * or empty strings are never displayed as business transaction identifiers.
 * Returns fallback (default '-') if invalid, empty, or a 24-hex MongoDB ObjectId.
 */
export function sanitizeTransactionId(txId: any, fallback = '-'): string {
  if (!txId) return fallback;
  const str = typeof txId === 'string' ? txId.trim() : String(txId || '').trim();
  if (!str || isMongoObjectId(str) || str.toLowerCase() === 'null' || str.toLowerCase() === 'undefined') {
    return fallback;
  }
  return str;
}

/**
 * Resolve the best business transaction reference from available fields on a record.
 * Checks business reference fields in priority order, rejecting any raw MongoDB ObjectIds.
 */
export function resolveTransactionReference(record: any, fallback = '-'): string {
  if (!record) return fallback;
  const candidates = [
    record.transactionId,
    record.transactionNumber,
    record.transactionNo,
    record.receiptNumber,
    record.receiptNo,
    record.referenceNumber,
    record.referenceNo,
    record.inwardReceiptNumber,
    record.outwardReceiptNumber,
    record.gatePass,
    record.gatePassNo,
    record.doNumber,
    record.cadNo,
    record.cdfNo,
    record.weighbridgeSlipNo,
    record.slipNo,
    record.batchId,
    record.lotNo,
  ];

  for (const candidate of candidates) {
    if (candidate) {
      const sanitized = sanitizeTransactionId(candidate, '');
      if (sanitized) return sanitized;
    }
  }
  return fallback;
}

/**
 * Parse ISO date string or Date object to Date object, handling timezone correctly
 */
export function parseDate(dateStr: string | Date): Date {
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
export function formatDateToString(date: string | Date): string {
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
export function calculateDaysDifference(startDate: Date, endDate: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.ceil((endDate.getTime() - startDate.getTime()) / msPerDay);
}

/**
 * Round to 2 decimal places for currency
 */
export function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

export function normalizeCommodityName(value: string | undefined | null): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

/**
 * Consolidates consecutive ledger entries for the same commodity and inward/stock reference
 * when quantity, rate, and pricing conditions remain unchanged.
 * - Shows one row with earliest Start Date and latest End Date.
 * - Recalculates total Days and Rent Amount.
 * - Keeps separate rows whenever quantity, rate, stock reference, or pricing conditions change.
 */
export function consolidateLedgerSteps(rawSteps: LedgerStep[]): LedgerStep[] {
  if (rawSteps.length === 0) return [];

  // Group steps by commodity
  const commodityGroups = new Map<string, LedgerStep[]>();
  for (const step of rawSteps) {
    const key = normalizeCommodityName(step.commodity);
    if (!commodityGroups.has(key)) {
      commodityGroups.set(key, []);
    }
    commodityGroups.get(key)!.push(step);
  }

  const consolidatedList: LedgerStep[] = [];

  for (const steps of commodityGroups.values()) {
    // Sort steps chronologically
    steps.sort((a, b) => {
      const sa = parseDate(a.startDate).getTime();
      const sb = parseDate(b.startDate).getTime();
      return sa - sb;
    });

    const mergedForCommodity: LedgerStep[] = [];

    for (const current of steps) {
      if (mergedForCommodity.length === 0) {
        mergedForCommodity.push({ ...current });
        continue;
      }

      const prev = mergedForCommodity[mergedForCommodity.length - 1];

      // Check consolidation criteria:
      // 1. Same commodity
      const sameCommodity = normalizeCommodityName(prev.commodity) === normalizeCommodityName(current.commodity);
      // 2. Consecutive dates: prev.endDate === current.startDate
      const consecutive = prev.endDate === current.startDate;
      // 3. Same quantity (within floating point precision)
      const sameQuantity = Math.abs(Number(prev.quantityMT || 0) - Number(current.quantityMT || 0)) < 0.0001;
      // 4. Same rent rate
      const sameRate = Math.abs(Number(prev.ratePerDayPerMT || 0) - Number(current.ratePerDayPerMT || 0)) < 0.0001;

      // 5. Inward / Stock Reference check:
      // If current introduces a new distinct stock reference, keep separate rows.
      const prevRef = prev.transaction ? sanitizeTransactionId(prev.transaction.transactionId || prev.transaction.receiptNumber || prev.transaction.gatePass, '') : '';
      const currRef = current.transaction ? sanitizeTransactionId(current.transaction.transactionId || current.transaction.receiptNumber || current.transaction.gatePass, '') : '';
      const sameStockRef = !currRef || currRef === prevRef;

      if (sameCommodity && consecutive && sameQuantity && sameRate && sameStockRef) {
        // Consolidate current into prev:
        // - Earliest start date is prev.startDate (already set)
        // - Latest end date is current.endDate
        prev.endDate = current.endDate;
        // Recalculate total Days and Rent Amount
        prev.daysDifference = calculateDaysDifference(parseDate(prev.startDate), parseDate(current.endDate));
        prev.rentAmount = roundCurrency(prev.quantityMT * prev.ratePerDayPerMT * prev.daysDifference);
        // Preserve inventory balances from the latest step
        if (current.inventoryBalances) {
          prev.inventoryBalances = { ...current.inventoryBalances };
        }
        // If prev had no transaction and current has one, inherit
        if (!prev.transaction && current.transaction) {
          prev.transaction = current.transaction;
        }
      } else {
        mergedForCommodity.push({ ...current });
      }
    }

    consolidatedList.push(...mergedForCommodity);
  }

  // Sort consolidated steps chronologically by startDate
  consolidatedList.sort((a, b) => {
    const startA = parseDate(a.startDate).getTime();
    const startB = parseDate(b.startDate).getTime();
    if (startA !== startB) return startA - startB;

    const endA = parseDate(a.endDate).getTime();
    const endB = parseDate(b.endDate).getTime();
    if (endA !== endB) return endA - endB;

    return (a.commodity || '').localeCompare(b.commodity || '');
  });

  // Re-number stepNo sequentially
  consolidatedList.forEach((step, idx) => {
    step.stepNo = idx + 1;
  });

  return consolidatedList;
}

/**
 * Calculates unique calendar days stored across multiple commodities,
 * taking the union of overlapping intervals so days are not duplicated.
 */
export function calculateTotalDaysStored(steps: LedgerStep[]): number {
  if (steps.length === 0) return 0;

  const intervals: { start: number; end: number }[] = steps
    .map((s) => ({
      start: parseDate(s.startDate).getTime(),
      end: parseDate(s.endDate).getTime(),
    }))
    .filter((inv) => inv.end > inv.start);

  if (intervals.length === 0) return 0;

  intervals.sort((a, b) => a.start - b.start);

  const merged: { start: number; end: number }[] = [intervals[0]];
  for (let i = 1; i < intervals.length; i++) {
    const current = intervals[i];
    const prev = merged[merged.length - 1];

    if (current.start <= prev.end) {
      prev.end = Math.max(prev.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }

  const msPerDay = 24 * 60 * 60 * 1000;
  return merged.reduce((total, inv) => total + Math.ceil((inv.end - inv.start) / msPerDay), 0);
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
  const safeClientName = sanitizeClientName(clientName);
  // Sort transactions by date — guard against missing/invalid date fields.
  const sortedTransactions = [...transactions].sort((a, b) => {
    const ta = a.date ? new Date(a.date).getTime() : 0;
    const tb = b.date ? new Date(b.date).getTime() : 0;
    return ta - tb;
  });

  void _outstandingInvoices;

  // Helper function to get rate for a commodity
  const getRate = (commodityName: string): number => {
    const normalized = normalizeCommodityName(commodityName || '');
    const rate = commodityRates.get(normalized) ?? DEFAULT_RATE_PER_DAY_PER_MT;
    console.log(`[LEDGER] Rate lookup for '${commodityName}' -> normalized: '${normalized}' -> rate: ₹${rate}/MT/day`);
    return rate;
  };

  const commodityDisplayNames = new Map<string, string>();
  sortedTransactions.forEach((t) => {
    const norm = normalizeCommodityName(t.commodityName);
    if (norm && !commodityDisplayNames.has(norm)) {
      commodityDisplayNames.set(norm, t.commodityName || norm);
    }
  });

  // Map transactions by start date and commodity to attach to ledger steps accurately
  const transactionsByDateAndCommodity = new Map<string, Transaction[]>();
  for (const txn of sortedTransactions) {
    const dStr = formatDateToString(txn.date);
    const cNorm = normalizeCommodityName(txn.commodityName);
    const key = `${dStr}|${cNorm}`;
    if (!transactionsByDateAndCommodity.has(key)) {
      transactionsByDateAndCommodity.set(key, []);
    }
    transactionsByDateAndCommodity.get(key)!.push(txn);
  }

  const getTransactionPayload = (startDateStr: string, commodityNorm: string) => {
    const key = `${startDateStr}|${commodityNorm}`;
    const txns = transactionsByDateAndCommodity.get(key);
    if (!txns || txns.length === 0) return undefined;
    const latestTxn = txns[txns.length - 1];
    const resolvedTxId = sanitizeTransactionId(
      latestTxn.transactionId || latestTxn.receiptNumber || latestTxn.gatePass,
      '-'
    );
    return {
      id: latestTxn._id,
      transactionId: resolvedTxId,
      receiptNumber: latestTxn.receiptNumber,
      direction: latestTxn.direction,
      gatePass: latestTxn.gatePass || '',
      actualWeight: latestTxn.actualWeight,
      netWeightLoss: latestTxn.netWeightLoss,
      partyName: latestTxn.partyName,
    };
  };

  const rawSteps: LedgerStep[] = [];
  const inventory = new Map<string, number>();

  // If no transactions, return empty ledger
  if (sortedTransactions.length === 0) {
    return {
      clientName: safeClientName,
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

        // Option 2: Separate row for each active commodity with qty > 0
        const activeCommodities = Array.from(inventory.entries()).filter(([_, qty]) => qty > 0);

        for (const [commodityKey, qty] of activeCommodities) {
          const commodityRate = getRate(commodityKey);
          const itemRent = roundCurrency(qty * commodityRate * bucketDays);
          const displayName = commodityDisplayNames.get(commodityKey) || commodityKey;
          const startStr = formatDateToString(cursor);
          const txnPayload = getTransactionPayload(startStr, commodityKey);

          rawSteps.push({
            stepNo: 0,
            startDate: startStr,
            endDate: formatDateToString(bucketEnd),
            daysDifference: bucketDays,
            quantityMT: qty,
            commodity: displayName,
            inventoryBalances: Object.fromEntries(inventory),
            ratePerDayPerMT: commodityRate,
            rentAmount: itemRent,
            transaction: txnPayload,
          });
        }

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

        // Option 2: Separate row for each active commodity with qty > 0
        const activeCommodities = Array.from(inventory.entries()).filter(([_, qty]) => qty > 0);

        for (const [commodityKey, qty] of activeCommodities) {
          const commodityRate = getRate(commodityKey);
          const itemRent = roundCurrency(qty * commodityRate * bucketDays);
          const displayName = commodityDisplayNames.get(commodityKey) || commodityKey;
          const startStr = formatDateToString(cursor);
          const txnPayload = getTransactionPayload(startStr, commodityKey);

          rawSteps.push({
            stepNo: 0,
            startDate: startStr,
            endDate: formatDateToString(bucketEnd),
            daysDifference: bucketDays,
            quantityMT: qty,
            commodity: displayName,
            inventoryBalances: Object.fromEntries(inventory),
            ratePerDayPerMT: commodityRate,
            rentAmount: itemRent,
            transaction: txnPayload,
          });
        }

        cursor = bucketEnd;
      }
    }
  }

  // Consolidate consecutive entries for the same commodity and inward/stock reference
  // when quantity, rent rate, and pricing conditions remain unchanged.
  const ledgerSteps = consolidateLedgerSteps(rawSteps);

  // Calculate totals
  const totalRent = roundCurrency(ledgerSteps.reduce((sum, step) => sum + step.rentAmount, 0));
  // Guard against undefined date on payments to prevent NaN sort.
  const sortedPayments = [...payments].sort((a, b) => {
    const pa = a.date ? new Date(a.date).getTime() : 0;
    const pb = b.date ? new Date(b.date).getTime() : 0;
    return pa - pb;
  });
  const totalPaid = roundCurrency(sortedPayments.reduce((sum, p) => sum + p.amount, 0));
  const rentPaid = roundCurrency(Math.min(totalPaid, totalRent));

  // Balance = Total Rent - Total Paid
  const balance = roundCurrency(totalRent - totalPaid);

  const calculationDate = new Date();
  calculationDate.setHours(0, 0, 0, 0);

  return {
    clientName: safeClientName,
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
  const formatCSVCell = (val: any) => `"${String(val ?? '').replace(/"/g, '""')}"`;
  const safeClient = sanitizeClientName(summary.clientName);

  lines.push(`Client Name,${formatCSVCell(safeClient)}`);
  lines.push(`Calculation Date,${formatCSVCell(summary.calculationDate)}`);
  lines.push('');
  lines.push('LEDGER STEPS');
  lines.push('Step No,Commodity,Start Date,End Date,Days,Quantity (MT),Rate (₹/day/MT),Rent Amount (₹),Transaction Id,Gate Pass');
  
  summary.ledgerSteps.forEach(step => {
    lines.push([
      step.stepNo,
      step.commodity || '-',
      step.startDate,
      step.endDate,
      step.daysDifference,
      step.quantityMT,
      step.ratePerDayPerMT,
      step.rentAmount,
      sanitizeTransactionId(step.transaction?.transactionId, '-'),
      step.transaction?.gatePass || '-'
    ].map(formatCSVCell).join(','));
  });
  
  lines.push('');
  lines.push('SUMMARY');
  lines.push(`Total Rent,${formatCSVCell(summary.totalRent)}`);
  lines.push(`Total Paid,${formatCSVCell(summary.totalPaid)}`);
  lines.push(`Outstanding Balance,${formatCSVCell(summary.balance)}`);
  
  return lines.join('\n');
}
