/**
 * Returns true if the date is the last day of its month
 */
function isMonthEnd(date: Date): boolean {
  const d = new Date(date);
  return d.getDate() === new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}
import { differenceInDays, max, min, startOfMonth, endOfMonth, isLastDayOfMonth } from 'date-fns';

/**
 * Helper function to calculate days for storage periods.
 * - ACTIVE periods are inclusive of the end date.
 * - COMPLETED periods are exclusive of the end date (transaction boundary).
 */
function calculateStorageDays(
  fromDate: string | Date,
  toDate: string | Date,
  status: 'ACTIVE' | 'COMPLETED'
): number {
  const from = typeof fromDate === 'string' ? new Date(fromDate) : fromDate;
  const to = typeof toDate === 'string' ? new Date(toDate) : toDate;

  // Edge case: same day
  if (from.getTime() === to.getTime()) {
    return 1;
  }

  if (status === 'ACTIVE') {
    return Math.max(1, differenceInDays(to, from) + 1);
  }

  return Math.max(0, differenceInDays(to, from));
}

export interface Transaction {
  date: string | Date; // YYYY-MM-DD or Date object
  type: 'INWARD' | 'OUTWARD';
  qty: number; // in MT
  clientId: string;
  commodityId: string;
  warehouseId: string;
}

export interface StoragePeriod {
  fromDate: string;
  toDate: string;
  qty: number;
  days: number;
  rate: number;
  rent: number;
  status: 'ACTIVE' | 'COMPLETED';
}

export interface DaySnapshot {
  date: string;
  totalQty: number;
  rentPerDay: number;
}

/**
 * Splits a storage period that crosses month boundaries into multiple periods
 * Each period stays within a single month
 */
export function splitPeriodByMonth(period: StoragePeriod): StoragePeriod[] {
  const result: StoragePeriod[] = [];
  let currentStart = new Date(period.fromDate);
  const end = new Date(period.toDate);

  while (currentStart <= end) {
    // Get the end of the current month
    const monthEnd = endOfMonth(currentStart);
    
    // The segment ends at either the month end or the period end, whichever is earlier
    const segmentEnd = end < monthEnd ? end : monthEnd;

    // Calculate days for this segment based on whether the period is active or completed
    const days = calculateStorageDays(currentStart, segmentEnd, period.status);
    
    // Calculate rent for this segment
    const rent = period.qty * period.rate * days;

    result.push({
      fromDate: currentStart.toISOString().split('T')[0],
      toDate: segmentEnd.toISOString().split('T')[0],
      qty: period.qty,
      days,
      rate: period.rate,
      rent,
      status: period.status
    });

    // Move to the next day after the segment end
    currentStart = new Date(segmentEnd);
    currentStart.setDate(currentStart.getDate() + 1);
  }

  return result;
}

/**
 * Generates continuous storage periods based on running balance
 * Used for both ledger and invoice calculations
 */
export function generateStoragePeriods(
  transactions: Transaction[],
  month?: string, // YYYY-MM
  rate: number = 10 // daily rate per MT
): StoragePeriod[] {
  console.log(`generateStoragePeriods called with ${transactions.length} transactions, month: ${month}, rate: ${rate}`);
  console.log('Transactions:', transactions);

  if (!transactions.length) return [];

  // Step 1: Normalize transactions
  const normalizedTxns = transactions.map(t => ({
    date: typeof t.date === 'string' && t.date.includes('T') ? t.date.split('T')[0] :
          t.date instanceof Date ? t.date.toISOString().split('T')[0] :
          t.date,
    qty: t.type === 'INWARD' ? t.qty : -t.qty
  }));
  console.log('Normalized transactions:', normalizedTxns);

  // Step 2: Group by date to get daily net changes (CRITICAL FIX)
  const groupedByDate: Record<string, number> = {};
  normalizedTxns.forEach(txn => {
    if (!groupedByDate[txn.date]) groupedByDate[txn.date] = 0;
    groupedByDate[txn.date] += txn.qty;
  });
  console.log('Grouped by date (daily net changes):', groupedByDate);

  // Step 3: Convert to sorted daily transactions
  const dailyTxns = Object.entries(groupedByDate)
    .map(([date, qty]) => ({ date, qty }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  console.log('Daily transactions (sorted):', dailyTxns);

  // Step 4: Generate periods using running balance
  let balance = 0;
  const periods: StoragePeriod[] = [];

  for (let i = 0; i < dailyTxns.length; i++) {
    const current = dailyTxns[i];
    const next = dailyTxns[i + 1];

    balance += current.qty;

    if (!next) break;

    // Calculate days between dates (boundary-based, no +1)
    const days = differenceInDays(new Date(next.date), new Date(current.date));

    if (days > 0) {
      const rent = balance * rate * days;
      periods.push({
        fromDate: current.date,
        toDate: next.date,
        qty: balance,
        days,
        rate,
        rent,
        status: 'COMPLETED'
      });
      console.log(`Added period: ${current.date} to ${next.date}, balance: ${balance}, days: ${days}`);
    }
  }

  // Step 5: Handle last period
  if (dailyTxns.length > 0) {
    const lastTxn = dailyTxns[dailyTxns.length - 1];
    const fromDate = lastTxn.date;
    let toDate: string;

    if (month) {
      // For invoice: use month end
      const monthEnd = endOfMonth(new Date(month + '-01'));
      toDate = monthEnd.toISOString().split('T')[0];
    } else {
      // For ledger: use today or ongoing
      toDate = new Date().toISOString().split('T')[0];
    }

    const status = balance > 0 ? 'ACTIVE' : 'COMPLETED';
    const days = calculateStorageDays(fromDate, toDate, status);

    console.log(`Last period: ${fromDate} to ${toDate}, balance: ${balance}, status: ${status}, days: ${days}`);

    if (days > 0 && balance > 0) {
      const rent = balance * rate * days;
      periods.push({
        fromDate,
        toDate,
        qty: balance,
        days,
        rate,
        rent,
        status: balance > 0 ? 'ACTIVE' : 'COMPLETED'
      });
      console.log(`Added last period: ${fromDate} to ${toDate}, ${balance}MT, ${days} days`);
    }
  }

  // Step 6: Apply month filtering if specified
  if (month) {
    const monthStart = startOfMonth(new Date(month + '-01'));
    const monthEnd = endOfMonth(new Date(month + '-01'));

    const filteredPeriods = periods
      .flatMap(period => {
        // Split period by month first
        const splits = splitPeriodByMonth(period);
        return splits;
      })
      .map(period => {
        const effectiveFrom = max([new Date(period.fromDate), monthStart]);
        const effectiveTo = min([new Date(period.toDate), monthEnd]);

        if (effectiveFrom <= effectiveTo) {
          const days = calculateStorageDays(effectiveFrom, effectiveTo, period.status);
          const rent = period.qty * rate * days;
          return {
            ...period,
            fromDate: effectiveFrom.toISOString().split('T')[0],
            toDate: effectiveTo.toISOString().split('T')[0],
            days,
            rent
          };
        }
        return null;
      })
      .filter(Boolean) as StoragePeriod[];

    console.log("RAW PERIODS:", periods);
    console.log("FILTERED PERIODS:", filteredPeriods);
    return filteredPeriods;
  }

  // Split all periods by month boundaries (for ledger view with all months)
  const splitPeriods = periods.flatMap(p => splitPeriodByMonth(p));
  
  console.log("RAW PERIODS (no month filter):", periods);
  console.log("SPLIT PERIODS (by month):", splitPeriods);
  return splitPeriods;
}
