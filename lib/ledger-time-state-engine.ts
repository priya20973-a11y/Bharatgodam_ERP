/**
 * TIME-STATE SYSTEM: Ledger Engine
 * 
 * Implements continuous time-state tracking for warehouse stock with automatic period splitting.
 * Tracks stock presence over time, showing full continuity and status changes.
 * 
 * Core Features:
 * 1. Continuous time tracking: Shows stock quantity for each period
 * 2. Automatic period splitting: When stock changes mid-period, entries are split
 * 3. Historical integrity: Past data never overwritten, only new entries added
 * 4. Status tracking: Shows Active/Removed/Partial Removal status
 */

import { Transaction } from './ledger-engine';

export interface TimeStatePeriod {
  periodNo: number;
  periodStartDate: string; // ISO date (YYYY-MM-DD)
  periodEndDate: string; // ISO date (YYYY-MM-DD)
  quantityMT: number;
  status: 'ACTIVE' | 'REMOVED' | 'PARTIAL_REMOVAL' | 'CLOSED';
  daysInPeriod: number;
  ratePerDayPerMT: number;
  rentCalculated: number;
  transaction?: {
    id: string;
    direction: 'INWARD' | 'OUTWARD';
    quantity: number;
    date: string;
  };
  reasonForChange?: string;
}

export interface TimeStateLedgerSummary {
  clientName: string;
  totalPeriods: number;
  timeStatePeriods: TimeStatePeriod[];
  totalRent: number;
  totalQuantityDays: number; // Sum of (quantity * days) for analysis
  calculationDate: string;
}

const RATE_PER_DAY_PER_MT = 10;

/**
 * Parse ISO date string to Date object
 */
function parseDate(dateStr: string): Date {
  const normalized = String(dateStr || '').trim().split('T')[0];
  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(normalized);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    return new Date(Date.UTC(year, month, day));
  }
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return new Date();
  }
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Format a date as YYYY-MM-DD using UTC values
 */
function formatDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get the first day of month for a given date in UTC
 */
function getFirstDayOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

/**
 * Get the last day of month for a given date in UTC
 */
function getLastDayOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

/**
 * Get end of day (23:59:59 UTC)
 */
function getEndOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

/**
 * Calculate days between two dates (inclusive on both ends)
 */
function calculateDaysBetween(startDate: Date, endDate: Date): number {
  if (startDate > endDate) return 0;
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.ceil((getEndOfDay(endDate).getTime() - startDate.getTime()) / msPerDay) + 1;
}

/**
 * Get all month start/end dates from first inward to today
 */
function getMonthBoundaries(fromDate: Date, toDate: Date): Array<{ start: Date; end: Date }> {
  const boundaries: Array<{ start: Date; end: Date }> = [];
  let currentMonth = getFirstDayOfMonth(fromDate);

  while (currentMonth <= toDate) {
    const monthEnd = getLastDayOfMonth(currentMonth);
    const periodEnd = monthEnd > toDate ? toDate : monthEnd;

    boundaries.push({
      start: currentMonth,
      end: periodEnd,
    });

    currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
  }

  return boundaries;
}

/**
 * Round to 2 decimal places
 */
function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Generate TIME-STATE ledger entries with automatic period splitting
 * 
 * Algorithm:
 * 1. Sort transactions chronologically
 * 2. For each month period, track stock quantity
 * 3. When transaction occurs in middle of period, split that period
 * 4. Calculate rent for each period based on quantity and days
 * 5. Track status changes (ACTIVE → PARTIAL_REMOVAL → CLOSED as needed)
 * 
 * @param transactions - Sorted list of inward/outward transactions
 * @param clientName - Client name for ledger
 * @returns TimeStateLedgerSummary with all periods and rent calculations
 */
export function generateTimeStateLedger(
  transactions: Transaction[],
  clientName: string
): TimeStateLedgerSummary {
  if (transactions.length === 0) {
    return {
      clientName,
      totalPeriods: 0,
      timeStatePeriods: [],
      totalRent: 0,
      totalQuantityDays: 0,
      calculationDate: formatDate(new Date()),
    };
  }

  // Sort transactions chronologically
  const sortedTxns = [...transactions].sort((a, b) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const firstInwardDate = parseDate(sortedTxns[0].date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const periods: TimeStatePeriod[] = [];
  let periodNo = 1;
  let currentStock = 0;
  let periodsMap = new Map<string, TimeStatePeriod>();

  // Get all month boundaries
  const monthBoundaries = getMonthBoundaries(firstInwardDate, today);

  // Process each month
  for (const boundary of monthBoundaries) {
    const periodStartStr = formatDate(boundary.start);
    const periodEndStr = formatDate(boundary.end);
    const periodKey = `${periodStartStr}_${periodEndStr}`;

    // Get transactions affecting this period
    const affectingTransactions = sortedTxns.filter(txn => {
      const txnDate = parseDate(txn.date);
      return txnDate >= boundary.start && txnDate <= boundary.end;
    });

    // If there are mid-period transactions, split them
    if (affectingTransactions.length > 0) {
      let periodStart = boundary.start;

      for (let i = 0; i < affectingTransactions.length; i++) {
        const txn = affectingTransactions[i];
        const txnDate = parseDate(txn.date);

        // Create period BEFORE transaction
        if (txnDate > periodStart && currentStock > 0) {
          const beforePeriodStart = formatDate(periodStart);
          const beforePeriodEnd = formatDate(new Date(txnDate.getTime() - 24 * 60 * 60 * 1000));

          const daysInPeriod = calculateDaysBetween(periodStart, 
            new Date(txnDate.getTime() - 24 * 60 * 60 * 1000));
          const rent = roundCurrency(currentStock * RATE_PER_DAY_PER_MT * daysInPeriod);

          periods.push({
            periodNo: periodNo++,
            periodStartDate: beforePeriodStart,
            periodEndDate: beforePeriodEnd,
            quantityMT: currentStock,
            status: 'ACTIVE',
            daysInPeriod,
            ratePerDayPerMT: RATE_PER_DAY_PER_MT,
            rentCalculated: rent,
            reasonForChange: undefined,
          });
        }

        // Update stock for this transaction
        if (txn.direction === 'INWARD') {
          currentStock += txn.mt;
        } else {
          currentStock -= txn.mt;
        }

        // Determine status after transaction
        const status = currentStock > 0 ? 'ACTIVE' 
                     : currentStock === 0 ? 'CLOSED'
                     : 'REMOVED';

        // Create period AT transaction (single day entry to mark change)
        periods.push({
          periodNo: periodNo++,
          periodStartDate: formatDate(txnDate),
          periodEndDate: formatDate(txnDate),
          quantityMT: currentStock,
          status,
          daysInPeriod: 1,
          ratePerDayPerMT: RATE_PER_DAY_PER_MT,
          rentCalculated: roundCurrency(currentStock * RATE_PER_DAY_PER_MT * 1),
          transaction: {
            id: txn._id,
            direction: txn.direction,
            quantity: txn.mt,
            date: formatDate(txnDate),
          },
          reasonForChange: `${txn.direction} - ${txn.mt} MT (${txn.gatePass})`,
        });

        periodStart = txnDate;
      }

      // Create period AFTER last transaction in month
      const lastTxnDate = parseDate(affectingTransactions[affectingTransactions.length - 1].date);
      const afterStart = new Date(lastTxnDate.getTime() + 24 * 60 * 60 * 1000);

      if (afterStart <= boundary.end && currentStock > 0) {
        const afterPeriodStart = formatDate(afterStart);
        const afterPeriodEnd = formatDate(boundary.end);
        const daysInPeriod = calculateDaysBetween(afterStart, boundary.end);
        const rent = roundCurrency(currentStock * RATE_PER_DAY_PER_MT * daysInPeriod);

        periods.push({
          periodNo: periodNo++,
          periodStartDate: afterPeriodStart,
          periodEndDate: afterPeriodEnd,
          quantityMT: currentStock,
          status: 'ACTIVE',
          daysInPeriod,
          ratePerDayPerMT: RATE_PER_DAY_PER_MT,
          rentCalculated: rent,
          reasonForChange: undefined,
        });
      }
    } else {
      // No transactions in this period - continue with same stock
      const daysInPeriod = calculateDaysBetween(boundary.start, boundary.end);
      const rent = roundCurrency(currentStock * RATE_PER_DAY_PER_MT * daysInPeriod);

      // Only add if there's stock
      if (currentStock > 0) {
        periods.push({
          periodNo: periodNo++,
          periodStartDate: periodStartStr,
          periodEndDate: periodEndStr,
          quantityMT: currentStock,
          status: 'ACTIVE',
          daysInPeriod,
          ratePerDayPerMT: RATE_PER_DAY_PER_MT,
          rentCalculated: rent,
          reasonForChange: undefined,
        });
      }
    }
  }

  // Calculate totals
  const totalRent = roundCurrency(periods.reduce((sum, p) => sum + p.rentCalculated, 0));
  const totalQuantityDays = periods.reduce((sum, p) => sum + (p.quantityMT * p.daysInPeriod), 0);

  return {
    clientName,
    totalPeriods: periods.length,
    timeStatePeriods: periods,
    totalRent,
    totalQuantityDays,
    calculationDate: formatDate(new Date()),
  };
}

/**
 * Export TIME-STATE ledger as CSV
 */
export function exportTimeStateLedgerAsCSV(summary: TimeStateLedgerSummary): string {
  const lines: string[] = [];

  lines.push(`Client Name,${summary.clientName}`);
  lines.push(`Calculation Date,${summary.calculationDate}`);
  lines.push(`Total Rent,${summary.totalRent}`);
  lines.push('');
  lines.push('TIME-STATE LEDGER PERIODS');
  lines.push('Period,Start Date,End Date,Quantity (MT),Days,Rate,Status,Rent,Reason');

  summary.timeStatePeriods.forEach(period => {
    const reasonStr = period.reasonForChange || 'Continuous Storage';
    lines.push(
      `${period.periodNo},${period.periodStartDate},${period.periodEndDate},${period.quantityMT},${period.daysInPeriod},${period.ratePerDayPerMT},${period.status},${period.rentCalculated},${reasonStr}`
    );
  });

  lines.push('');
  lines.push(`Total Periods,${summary.totalPeriods}`);
  lines.push(`Total MT-Days,${summary.totalQuantityDays}`);
  lines.push(`Total Rent,${summary.totalRent}`);

  return lines.join('\n');
}

/**
 * Format TIME-STATE ledger for display
 * Groups continuous periods with same quantity for cleaner display
 */
export function formatTimeStateForDisplay(summary: TimeStateLedgerSummary) {
  const grouped: Array<{
    periodRange: string;
    quantityMT: number;
    status: string;
    daysTotal: number;
    rentTotal: number;
    transactions: string[];
  }> = [];

  let currentGroup: any = null;

  for (const period of summary.timeStatePeriods) {
    if (
      currentGroup &&
      currentGroup.quantityMT === period.quantityMT &&
      currentGroup.status === period.status &&
      !period.transaction
    ) {
      // Extend current group
      currentGroup.daysTotal += period.daysInPeriod;
      currentGroup.rentTotal += period.rentCalculated;
      currentGroup.periodEndDate = period.periodEndDate;
    } else {
      // Start new group
      if (currentGroup) {
        grouped.push({
          ...currentGroup,
          periodRange: `${currentGroup.periodStartDate} – ${currentGroup.periodEndDate}`,
        });
      }

      currentGroup = {
        periodStartDate: period.periodStartDate,
        periodEndDate: period.periodEndDate,
        quantityMT: period.quantityMT,
        status: period.status,
        daysTotal: period.daysInPeriod,
        rentTotal: period.rentCalculated,
        transactions: period.transaction ? [`${period.transaction.direction}: ${period.transaction.quantity} MT`] : [],
      };
    }
  }

  // Add last group
  if (currentGroup) {
    grouped.push({
      ...currentGroup,
      periodRange: `${currentGroup.periodStartDate} – ${currentGroup.periodEndDate}`,
    });
  }

  return grouped;
}
