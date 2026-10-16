/**
 * Per Month Rent Calculator for Cold Storage
 *
 * Iterates from the inward calendar month to the outward calendar month (inclusive).
 * Every touched month = 1 full month charge at that month's seasonal rate.
 * Formula per month: quantity × monthlyRate
 *
 * Used by: cold-outward-actions, cold-invoice-actions, cold-transaction-report-actions,
 *          cold-outward-receipt (gate pass)
 */

import { calculateStorageCharge } from './cold-unit-conversion';

export interface MonthBreakdownEntry {
  month: string;        // e.g. "Apr 2026"
  year: number;
  monthIndex: number;   // 0-11
  rate: number;         // seasonal price applied for this month
  quantity: number;     // bags or kg used in calculation
  amount: number;       // quantity × rate (full month)
}

export interface PerMonthRentResult {
  totalRent: number;
  monthBreakdown: MonthBreakdownEntry[];
  rentReason: string;
}

export interface SeasonalPriceEntry {
  fromDate: string | Date;
  toDate: string | Date;
  pricePerKg?: number;
  priceLarge?: number;
  priceSmall?: number;
  priceMixed?: number;
}

export interface PerMonthRentParams {
  inwardDate: Date | string;
  outwardDate: Date | string;
  seasonalPrices: SeasonalPriceEntry[];
  priceType: 'Same Price' | 'Different Price' | string;
  /** commodity.unit — e.g. 'KG', 'BOX', 'BAG' */
  unit: string;
  /** commodity.siUnit — e.g. 'kg', 'g', 'tonne', 'quintal' */
  siUnit?: string;
  /** commodity.priceCalculationBasedOn — 'Unit' or 'SI Unit' */
  priceCalculationBasedOn?: string;
  /** commodity.rentCalculationOn — 'Kg' or 'Bag' */
  rentCalculationOn?: string;
  /** commodity.gradingType — e.g. 'Wet' for special wet formula */
  gradingType?: string;
  quantityKg: number;
  bagsLarge: number;
  bagsSmall: number;
  bagsMixed: number;
  totalBags: number;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Find the seasonal price whose fromDate/toDate range covers the given calendar month.
 * We check if the season's range overlaps with the month at all.
 */
function findSeasonForMonth(
  seasonalPrices: SeasonalPriceEntry[],
  year: number,
  monthIndex: number
): SeasonalPriceEntry | null {
  // The calendar month span: 1st of month to last day of month
  const monthStart = new Date(year, monthIndex, 1);
  const monthEnd = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999); // last day of month

  for (const sp of seasonalPrices) {
    const from = new Date(sp.fromDate);
    const to = new Date(sp.toDate);
    // Normalize to-date to end of day
    to.setHours(23, 59, 59, 999);

    // Check if the season's range overlaps with this calendar month
    if (from <= monthEnd && to >= monthStart) {
      return sp;
    }
  }

  // Fallback: return the first seasonal price if no match
  return seasonalPrices.length > 0 ? seasonalPrices[0] : null;
}

/**
 * Calculate Per Month rent with month-by-month seasonal pricing.
 *
 * - Iterates from inward calendar month to outward calendar month, inclusive.
 * - Every touched month = 1 full month charge (no partial months).
 * - Each month uses its own seasonal price and respects configured pricing unit.
 */
export function calculatePerMonthRent(params: PerMonthRentParams): PerMonthRentResult {
  const {
    inwardDate,
    outwardDate,
    seasonalPrices,
    priceType,
    unit,
    siUnit,
    priceCalculationBasedOn,
    rentCalculationOn,
    gradingType,
    quantityKg,
    bagsLarge,
    bagsSmall,
    bagsMixed,
    totalBags,
  } = params;

  const inD = new Date(inwardDate);
  const outD = new Date(outwardDate);

  if (isNaN(inD.getTime()) || isNaN(outD.getTime())) {
    return { totalRent: 0, monthBreakdown: [], rentReason: 'Invalid dates for Per Month calculation' };
  }

  if (!seasonalPrices || seasonalPrices.length === 0) {
    return { totalRent: 0, monthBreakdown: [], rentReason: 'No seasonal prices configured' };
  }

  // Ensure inward <= outward
  const startDate = inD <= outD ? inD : outD;
  const endDate = inD <= outD ? outD : inD;

  const startMonth = startDate.getMonth();
  const startYear = startDate.getFullYear();
  const endMonth = endDate.getMonth();
  const endYear = endDate.getFullYear();

  const breakdown: MonthBreakdownEntry[] = [];
  let totalRent = 0;

  // Walk from start month/year to end month/year inclusive
  let curYear = startYear;
  let curMonth = startMonth;

  while (curYear < endYear || (curYear === endYear && curMonth <= endMonth)) {
    const season = findSeasonForMonth(seasonalPrices, curYear, curMonth);

    let monthAmount = 0;
    let rateUsed = 0;
    let quantityUsed = 0;

    if (season) {
      const charge = calculateStorageCharge({
        rate: season.pricePerKg || 0,
        rateLarge: season.priceLarge,
        rateSmall: season.priceSmall,
        rateMixed: season.priceMixed,
        priceType,
        gradingType,
        commodity: { unit, siUnit, priceCalculationBasedOn, rentCalculationOn },
        quantityKg,
        bagsLarge,
        bagsSmall,
        bagsMixed,
        totalBags,
      });

      monthAmount = charge.amount;
      rateUsed = charge.rateUsed;
      quantityUsed = charge.quantityUsed;
    }

    breakdown.push({
      month: `${MONTH_NAMES[curMonth]} ${curYear}`,
      year: curYear,
      monthIndex: curMonth,
      rate: rateUsed,
      quantity: quantityUsed,
      amount: monthAmount,
    });

    totalRent += monthAmount;

    // Advance to next month
    curMonth++;
    if (curMonth > 11) {
      curMonth = 0;
      curYear++;
    }
  }

  // Build rent reason string
  const monthCount = breakdown.length;
  const breakdownSummary = breakdown
    .map(b => `${b.month}: ₹${b.amount.toFixed(2)}`)
    .join(', ');
  const rentReason = `Per Month: ${monthCount} month(s) [${breakdownSummary}]`;

  return { totalRent, monthBreakdown: breakdown, rentReason };
}

export function calculateDailyRateRent(params: PerMonthRentParams): PerMonthRentResult {
  const {
    inwardDate,
    outwardDate,
    seasonalPrices,
    priceType,
    unit,
    siUnit,
    priceCalculationBasedOn,
    rentCalculationOn,
    gradingType,
    quantityKg,
    bagsLarge,
    bagsSmall,
    bagsMixed,
    totalBags,
  } = params;

  const inD = new Date(inwardDate);
  const outD = new Date(outwardDate);

  if (isNaN(inD.getTime()) || isNaN(outD.getTime())) {
    return { totalRent: 0, monthBreakdown: [], rentReason: 'Invalid dates for Daily Rate calculation' };
  }

  if (!seasonalPrices || seasonalPrices.length === 0) {
    return { totalRent: 0, monthBreakdown: [], rentReason: 'No seasonal prices configured' };
  }

  const startDate = new Date(inD.getFullYear(), inD.getMonth(), inD.getDate());
  const endDate = new Date(outD.getFullYear(), outD.getMonth(), outD.getDate());
  let diffTime = endDate.getTime() - startDate.getTime();
  let diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays <= 0) {
    diffDays = 1; // Minimum 1 day rent
  }

  let totalRent = 0;
  let rateUsed = 0;
  let quantityUsed = 0;
  let singleDayAmount = 0;
  
  // For daily rate, we use the rate active on the outward date.
  const outTime = outD.getTime();
  const season = seasonalPrices.find((s: any) => outTime >= new Date(s.fromDate).getTime() && outTime <= new Date(s.toDate).getTime()) || seasonalPrices[0];

  if (season) {
    const charge = calculateStorageCharge({
      rate: season.pricePerKg || 0,
      rateLarge: season.priceLarge,
      rateSmall: season.priceSmall,
      rateMixed: season.priceMixed,
      priceType,
      gradingType,
      commodity: { unit, siUnit, priceCalculationBasedOn, rentCalculationOn },
      quantityKg,
      bagsLarge,
      bagsSmall,
      bagsMixed,
      totalBags,
    });

    singleDayAmount = charge.amount;
    rateUsed = charge.rateUsed;
    quantityUsed = charge.quantityUsed;
  }

  // Multiply by number of days for Daily Rate
  totalRent = singleDayAmount * diffDays;

  const rentReason = `Daily Rate: ${diffDays} day(s) @ ₹${rateUsed.toFixed(2)}`;
  
  return { 
    totalRent, 
    monthBreakdown: [{
      month: `${diffDays} Days`,
      year: outD.getFullYear(),
      monthIndex: outD.getMonth(),
      rate: rateUsed,
      quantity: quantityUsed,
      amount: totalRent,
    }], 
    rentReason 
  };
}
