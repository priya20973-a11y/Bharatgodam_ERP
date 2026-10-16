/**
 * Cold Storage Unit Conversion and Pricing Utilities
 *
 * Supports business units (Bag, Kg, Quintal, MT, Box, etc.)
 * and standard SI units (kg, g, tonne, quintal).
 * Accurately converts weights:
 *  - 1 MT / tonne = 1,000 kg
 *  - 1 Quintal = 100 kg
 *  - 1 kg = 1,000 g
 */

export const STANDARD_BUSINESS_UNITS = [
  'Bag',
  'Kg',
  'Quintal',
  'MT',
  'Box',
] as const;

export const STANDARD_SI_UNITS = [
  'kg',
  'g',
  'tonne',
  'quintal',
] as const;

export const PRICE_CALCULATION_OPTIONS = [
  'Unit',
  'SI Unit',
] as const;

/**
 * Returns factor to convert 1 of this unit into kilograms (KG).
 * Returns null if the unit is not a recognized weight measurement.
 */
export function getWeightFactorInKg(unitStr?: string): number | null {
  if (!unitStr) return null;
  const u = unitStr.trim().toLowerCase();
  if (u === 'kg' || u === 'kilogram' || u === 'kgs') return 1;
  if (u === 'g' || u === 'gram' || u === 'grams') return 0.001;
  if (u === 'quintal' || u === 'qtl' || u === 'q') return 100;
  if (u === 'mt' || u === 'tonne' || u === 'metric tonne' || u === 't' || u === 'ton' || u === 'tons') return 1000;
  return null;
}

export function isWeightUnit(unitStr?: string): boolean {
  return getWeightFactorInKg(unitStr) !== null;
}

export function isCountUnit(unitStr?: string): boolean {
  if (!unitStr) return false;
  const u = unitStr.trim().toLowerCase();
  return (
    u === 'bag' ||
    u === 'bags' ||
    u === 'box' ||
    u === 'boxes' ||
    u === 'item' ||
    u === 'items' ||
    u === 'nos' ||
    u === 'no' ||
    u === 'crate' ||
    u === 'crates' ||
    u === 'barrel' ||
    u === 'barrels' ||
    u === 'drum' ||
    u === 'drums'
  );
}

/**
 * Convert quantity from KG to target weight unit.
 * E.g., convertKgToUnit(5000, 'MT') => 5
 *       convertKgToUnit(5000, 'Quintal') => 50
 *       convertKgToUnit(5, 'g') => 5000
 */
export function convertKgToUnit(quantityKg: number, targetUnit: string): number {
  const factor = getWeightFactorInKg(targetUnit);
  if (!factor || factor <= 0) return quantityKg;
  return quantityKg / factor;
}

/**
 * Convert quantity from source weight unit into KG.
 * E.g., convertUnitToKg(5, 'MT') => 5000
 *       convertUnitToKg(50, 'Quintal') => 5000
 */
export function convertUnitToKg(quantity: number, sourceUnit: string): number {
  const factor = getWeightFactorInKg(sourceUnit);
  if (!factor || factor <= 0) return quantity;
  return quantity * factor;
}

/**
 * Resolves the active pricing unit and whether it is weight- or count-based.
 */
export function getActivePricingUnit(commodity?: {
  unit?: string;
  siUnit?: string;
  priceCalculationBasedOn?: string;
  rentCalculationOn?: string;
}): {
  pricingUnit: string;
  isWeight: boolean;
  isCount: boolean;
  method: 'Unit' | 'SI Unit';
} {
  const method: 'Unit' | 'SI Unit' = commodity?.priceCalculationBasedOn === 'SI Unit' ? 'SI Unit' : 'Unit';

  let pricingUnit: string;
  if (method === 'SI Unit') {
    pricingUnit = commodity?.siUnit || 'kg';
  } else {
    // If commodity has rentCalculationOn === 'Bag' and unit is KG, legacy behavior is Bag
    if (
      commodity?.rentCalculationOn === 'Bag' &&
      (!commodity?.priceCalculationBasedOn || commodity?.priceCalculationBasedOn === 'Unit') &&
      (!commodity?.unit || commodity.unit.toUpperCase() === 'KG' || commodity.unit.toUpperCase() === 'KILOGRAM')
    ) {
      pricingUnit = 'Bag';
    } else {
      pricingUnit = commodity?.unit || 'Bag';
    }
  }

  const isWeight = isWeightUnit(pricingUnit);
  const isCount = !isWeight;

  return { pricingUnit, isWeight, isCount, method };
}

/**
 * Validates that quantity and price use compatible units before calculating charges.
 */
export function validateQuantityAndPricing(
  commodity: {
    unit?: string;
    siUnit?: string;
    priceCalculationBasedOn?: string;
    rentCalculationOn?: string;
  },
  quantityKg: number,
  totalBags: number
): { valid: boolean; error?: string; pricingUnit: string; isWeight: boolean } {
  const { pricingUnit, isWeight } = getActivePricingUnit(commodity);

  if (isWeight) {
    if (quantityKg === undefined || quantityKg === null || isNaN(quantityKg) || quantityKg < 0) {
      return {
        valid: false,
        error: `Quantity (kg) must be a valid non-negative number for ${pricingUnit}-based pricing.`,
        pricingUnit,
        isWeight,
      };
    }
  } else {
    if (totalBags === undefined || totalBags === null || isNaN(totalBags) || totalBags < 0) {
      return {
        valid: false,
        error: `Bag count must be a valid non-negative number for ${pricingUnit}-based pricing.`,
        pricingUnit,
        isWeight,
      };
    }
  }

  return { valid: true, pricingUnit, isWeight };
}

export interface StorageChargeCalculationInput {
  rate: number;
  rateLarge?: number;
  rateSmall?: number;
  rateMixed?: number;
  priceType?: string; // 'Same Price' | 'Different Price'
  gradingType?: string; // 'Wet'
  commodity?: {
    unit?: string;
    siUnit?: string;
    priceCalculationBasedOn?: string;
    rentCalculationOn?: string;
  };
  quantityKg: number;
  bagsLarge: number;
  bagsSmall: number;
  bagsMixed: number;
  totalBags: number;
}

export interface StorageChargeCalculationOutput {
  amount: number;
  pricingUnit: string;
  quantityUsed: number;
  rateUsed: number;
  calculationDescription: string;
}

/**
 * Calculates storage charge using the selected pricing unit (Unit or SI Unit),
 * performing accurate unit conversion (MT, Quintal, kg, g, bags).
 */
export function calculateStorageCharge(input: StorageChargeCalculationInput): StorageChargeCalculationOutput {
  const {
    rate,
    rateLarge = rate,
    rateSmall = rate,
    rateMixed = rate,
    priceType,
    gradingType,
    commodity,
    quantityKg,
    bagsLarge,
    bagsSmall,
    bagsMixed,
    totalBags,
  } = input;

  const { pricingUnit, isWeight } = getActivePricingUnit(commodity);

  let amount = 0;
  let quantityUsed = 0;
  let rateUsed = rate;
  let calculationDescription = '';

  if (isWeight) {
    const convertedTotalQty = convertKgToUnit(quantityKg, pricingUnit);
    quantityUsed = convertedTotalQty;

    if (priceType === 'Different Price') {
      rateUsed = rateLarge;
      let largeKg = 0, smallKg = 0, mixedKg = 0;
      if (totalBags > 0) {
        largeKg = (bagsLarge / totalBags) * quantityKg;
        smallKg = (bagsSmall / totalBags) * quantityKg;
        mixedKg = (bagsMixed / totalBags) * quantityKg;
      } else {
        largeKg = quantityKg;
      }

      if (gradingType === 'Wet') {
        amount = ((largeKg / 81) * rateLarge * 4) +
                 ((smallKg / 81) * rateSmall * 4) +
                 ((mixedKg / 81) * rateMixed * 4);
        calculationDescription = `Wet Formula (${pricingUnit}): L(${largeKg.toFixed(1)}kg), S(${smallKg.toFixed(1)}kg), M(${mixedKg.toFixed(1)}kg)`;
      } else {
        const largeQty = convertKgToUnit(largeKg, pricingUnit);
        const smallQty = convertKgToUnit(smallKg, pricingUnit);
        const mixedQty = convertKgToUnit(mixedKg, pricingUnit);
        amount = (largeQty * rateLarge) + (smallQty * rateSmall) + (mixedQty * rateMixed);
        calculationDescription = `Diff Price (${pricingUnit}): L(${largeQty.toFixed(2)}×₹${rateLarge}) + S(${smallQty.toFixed(2)}×₹${rateSmall}) + M(${mixedQty.toFixed(2)}×₹${rateMixed})`;
      }
    } else {
      rateUsed = rate;
      amount = convertedTotalQty * rate;
      calculationDescription = `${convertedTotalQty.toFixed(2)} ${pricingUnit} × ₹${rate.toFixed(2)}/${pricingUnit}`;
    }
  } else {
    // Count-based (Bag, Box, etc.)
    quantityUsed = totalBags;

    if (priceType === 'Different Price') {
      rateUsed = rateLarge;
      amount = (bagsLarge * rateLarge) + (bagsSmall * rateSmall) + (bagsMixed * rateMixed);
      calculationDescription = `Diff Price (${pricingUnit}): L(${bagsLarge}×₹${rateLarge}) + S(${bagsSmall}×₹${rateSmall}) + M(${bagsMixed}×₹${rateMixed})`;
    } else {
      rateUsed = rate;
      amount = totalBags * rate;
      calculationDescription = `${totalBags} ${pricingUnit} × ₹${rate.toFixed(2)}/${pricingUnit}`;
    }
  }

  return {
    amount,
    pricingUnit,
    quantityUsed,
    rateUsed,
    calculationDescription,
  };
}
