/**
 * Pro-Rata Warehouse Storage Pricing Engine
 *
 * Formula: (Weight_MT × Rate_per_MT_per_month × Days) / 30
 *
 * The commodity rate is expressed as ₹/MT/month. Storage is billed
 * pro-rata on a 30-day standard month:
 *
 *   10 MT of Rice @ ₹90/MT/month for 20 days:
 *   = (10 × 90 × 20) / 30
 *   = ₹600.00 (no GST - total remains ₹600.00)
 *
 * Floating-point safety:
 *   All arithmetic is done in paise (× 100) and rounded via Math.round()
 *   at the final step, eliminating 0.9999... drift entirely.
 */

import { differenceInDays } from 'date-fns';

const DAYS_PER_MONTH = 30;  // Standard billing month

/**
 * Strip the time component from a date string so that day-difference
 * math always works in whole calendar days (Asia/Kolkata local midnight).
 * Handles both "YYYY-MM-DD" strings and full ISO timestamps.
 */
function toCalendarDay(date: string | Date): Date {
  const raw = typeof date === 'string' ? date : date.toISOString();
  // Take only the YYYY-MM-DD portion — avoids all timezone offset issues
  const datePart = raw.slice(0, 10); // "2026-04-01"
  return new Date(datePart + 'T00:00:00.000Z');
}

export interface RentBreakdown {
  totalDays:    number;   // Exact calendar days stored (minimum 1)
  weightMT:     number;   // MT at time of booking
  appliedRate:  number;   // ₹/MT/month from Rate Master
  monthlyRent:  number;   // weight × rate (cost for a full 30-day month)
  dailyRate:    number;   // monthlyRent ÷ 30
  storageRent:  number;   // dailyRate × totalDays (final total - no tax)
  totalAmount:  number;   // storageRent (no tax added)
}

/**
 * calculateRent — Pro-rata storage rent.
 *
 * @param weightMT     - Metric tons stored
 * @param ratePerMonth - Monthly rate in ₹/MT (from Rate Master or Commodity Master)
 * @param inwardDate   - Date cargo entered warehouse
 * @param outwardDate  - Date cargo was (or will be) removed
 */
export function calculateRent(
  quantity:     number,
  unitRate:     number,
  inwardDate?:  string | Date,
  outwardDate?: string | Date,
): RentBreakdown {
  // Rent = Transaction Quantity × Current Unit Rate
  // Bypassing all weight and time (days) multipliers.
  
  const totalDays = 1; // Retained as 1 to prevent division-by-zero in legacy UI components.
  
  // Calculate exactly: quantity * rate (rounded to 2 decimal places to avoid float issues)
  const exactRent = (Math.round(quantity * 100) / 100) * (Math.round(unitRate * 100) / 100);
  const storageRent = Math.round(exactRent * 100) / 100;
  const totalAmount = storageRent;

  return {
    totalDays,
    weightMT: quantity, // Still named weightMT in the interface, but stores quantity
    appliedRate: unitRate,
    monthlyRent: storageRent,
    dailyRate: storageRent, // Not mathematically divided by days anymore
    storageRent,
    totalAmount, // No gstAmount field
  };
}

/**
 * INVENTORY-BASED BILLING ENGINE
 * ════════════════════════════════════════════════════════════════════════════
 * 
 * Calculates storage rent based on actual inventory levels throughout the month.
 * When inventory changes (inward/outward), the billing rate adjusts accordingly.
 * 
 * Example (January 2026, ₹87/MT/month = ₹2.90/MT/day):
 * ──────────────────────────────────────────────────────
 *   Jan 15: +10 MT (A) +20 MT (B) → Inventory = 30 MT
 *   Jan 26: -5 MT outward        → Inventory = 25 MT
 *   Jan 28: +12 MT (C)           → Inventory = 37 MT
 * 
 *   Billing Periods:
 *   - Jan 15-26 (11 days):  30 MT × ₹2.90 × 11 = ₹957.00
 *   - Jan 26-28 (2 days):   25 MT × ₹2.90 × 2  = ₹145.00
 *   - Jan 28-31 (4 days):   37 MT × ₹2.90 × 4  = ₹429.20
 *   ────────────────────────────────────────────────────
 *   Total January 2026: ₹1,531.20
 */

export interface InventoryChange {
  date: string | Date;
  quantityMT: number;  // Positive for inward, negative for outward
  type: 'INWARD' | 'OUTWARD';
}

export interface InventoryBillingPeriod {
  startDate: string;    // YYYY-MM-DD
  endDate: string;      // YYYY-MM-DD
  daysInPeriod: number;
  inventoryMT: number;
  dailyRate: number;    // ₹/MT/day
  periodCharge: number; // inventory × dailyRate × days
}

export interface InventoryBillingBreakdown {
  monthYear: string;         // YYYY-MM
  totalDaysInMonth: number;  // 28-31
  ratePerMTPerMonth: number; // ₹/MT/month
  dailyRatePerMT: number;    // ₹/MT/day (rate ÷ 30)
  periods: InventoryBillingPeriod[];
  totalAmount: number;       // Sum of all period charges
  daysWithInventory: number; // Count of days when inventory > 0
  peakInventory: number;     // Maximum inventory level during month
}

/**
 * Get the number of days in a specific month
 */
function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Get start of month (YYYY-MM-01 00:00:00 UTC)
 */
function getMonthStart(year: number, month: number): Date {
  return new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00.000Z`);
}

/**
 * Get end of month (YYYY-MM-DD 23:59:59 UTC)
 */
function getMonthEnd(year: number, month: number): Date {
  const daysInMonth = getDaysInMonth(year, month);
  return new Date(`${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}T23:59:59.999Z`);
}

/**
 * calculateInventoryBasedRent — Monthly storage charge based on inventory levels
 *
 * @param inventoryChanges - Array of inward/outward events sorted by date
 * @param ratePerMonth     - Monthly rate in ₹/MT/month
 * @param monthYear        - Target month as "YYYY-MM" (e.g., "2026-01")
 */
export function calculateInventoryBasedRent(
  inventoryChanges: InventoryChange[],
  ratePerMonth: number,
  monthYear: string,
): InventoryBillingBreakdown {
  // Parse month/year
  const [yearStr, monthStr] = monthYear.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const daysInMonth = getDaysInMonth(year, month);
  const monthStart = getMonthStart(year, month);
  const monthEnd = getMonthEnd(year, month);
  const dailyRate = ratePerMonth / DAYS_PER_MONTH;

  // ── 1. Filter and Sort Changes ────────────────────────────────────────────
  const relevantChanges = inventoryChanges
    .map((change) => ({
      ...change,
      date: toCalendarDay(change.date),
    }))
    .filter((change) => change.date >= monthStart && change.date <= monthEnd)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  // ── 2. Build Billing Periods ──────────────────────────────────────────────
  const periods: InventoryBillingPeriod[] = [];
  let currentInventory = 0;
  let currentDate = toCalendarDay(monthStart);
  const monthEndDay = toCalendarDay(monthEnd);
  let peakInventory = 0;
  let daysWithInventory = 0;

  // Start with inventory from before the month
  let changeIndex = 0;

  // Process each day of the month
  while (currentDate < monthEndDay || (currentDate.getTime() === monthEndDay.getTime())) {
    let nextDate = new Date(currentDate);
    nextDate.setDate(nextDate.getDate() + 1);

    // Apply all changes on this date
    while (
      changeIndex < relevantChanges.length &&
      relevantChanges[changeIndex].date.getTime() === currentDate.getTime()
    ) {
      const change = relevantChanges[changeIndex];
      currentInventory += change.quantityMT;
      currentInventory = Math.max(0, currentInventory); // Never go negative
      peakInventory = Math.max(peakInventory, currentInventory);
      changeIndex++;
    }

    // Track days with inventory
    if (currentInventory > 0) {
      daysWithInventory++;
    }

    // Calculate days until next change or end of month
    let nextChangeDate: Date | null = null;
    if (changeIndex < relevantChanges.length) {
      nextChangeDate = relevantChanges[changeIndex].date;
    }

    const dateToUse = nextChangeDate && nextChangeDate <= monthEnd ? nextChangeDate : monthEnd;

    // Calculate days in this period
    const daysInPeriod = Math.ceil(
      (dateToUse.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysInPeriod > 0 && currentInventory > 0) {
      const periodChargePaise = Math.round(
        currentInventory * dailyRate * daysInPeriod * 100
      );
      const periodCharge = periodChargePaise / 100;

      periods.push({
        startDate: currentDate.toISOString().split('T')[0],
        endDate: dateToUse.toISOString().split('T')[0],
        daysInPeriod,
        inventoryMT: currentInventory,
        dailyRate: Math.round(dailyRate * 100) / 100,
        periodCharge,
      });
    }

    currentDate = nextChangeDate || dateToUse;
    if (currentDate >= monthEndDay) break;
  }

  // ── 3. Calculate Total ────────────────────────────────────────────────────
  const totalAmountPaise = Math.round(
    periods.reduce((sum, p) => sum + p.periodCharge * 100, 0)
  );
  const totalAmount = totalAmountPaise / 100;

  return {
    monthYear,
    totalDaysInMonth: daysInMonth,
    ratePerMTPerMonth: ratePerMonth,
    dailyRatePerMT: Math.round(dailyRate * 100) / 100,
    periods,
    totalAmount,
    daysWithInventory,
    peakInventory,
  };
}

/**
 * Legacy shim — keeps calculateInvoiceTotal() working for any callers
 * that haven't migrated to calculateRent() yet.
 * @deprecated Use calculateRent() directly for new code.
 */
export function calculateInvoiceTotal(
  startDate:      string | Date,
  endDate:        string | Date,
  spaceRequested: number,
  ratePerSqFt:    number,
) {
  const r = calculateRent(spaceRequested, ratePerSqFt, startDate, endDate);
  return {
    durationDays: r.totalDays,
    rateApplied:  r.appliedRate,
    subtotal:     r.storageRent,
    totalAmount:  r.totalAmount, // No taxAmount field
  };
}
