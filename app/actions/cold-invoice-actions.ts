'use server';

import connectToDatabase from '@/lib/mongoose';
import ColdInvoice from '@/lib/models/ColdInvoice';
import ColdInward from '@/lib/models/ColdInward';
import ColdOutward from '@/lib/models/ColdOutward';
import ColdCommodity from '@/lib/models/ColdCommodity';
import { hasPermission } from '@/lib/permissions';
import { requireSession, getTenantFilter, appendOwnership } from '@/lib/ownership';
import mongoose from 'mongoose';
import { differenceInDays, parseISO, isAfter, isBefore, max, min } from 'date-fns';

export async function generateColdClientInvoicePreview(
  warehouseId: string,
  clientId: string,
  fromDateStr: string,
  toDateStr: string
) {
  await connectToDatabase();
  ColdCommodity.init();
  const session = await requireSession();
  const tenantFilter = getTenantFilter(session);

  const fromDate = new Date(fromDateStr);
  const toDate = new Date(toDateStr);
  toDate.setHours(23, 59, 59, 999);

  const matchCriteria = {
    warehouseId: new mongoose.Types.ObjectId(warehouseId),
    clientId: new mongoose.Types.ObjectId(clientId),
    ...tenantFilter,
  };

  const inwards = await ColdInward.find({
    ...matchCriteria,
    date: { $lte: toDate } // Include anything that arrived before or on the toDate
  }).populate('commodityId').lean();

  const outwards = await ColdOutward.find({
    ...matchCriteria,
    date: { $lte: toDate }
  }).lean();

  const items = [];
  let totalAmount = 0;

  for (const inward of inwards) {
    const inw = inward as any;
    const commodity = inw.commodityId;
    
    if (!commodity) continue; // Skip if commodity is deleted or missing
    if (!commodity) continue;

    // Filter outwards that belong to this inward
    const relatedOutwards = outwards.filter(o => o.inwardId?.toString() === inw._id.toString());
    const totalOutwardKg = relatedOutwards.reduce((sum, o) => sum + (o.quantityKg || 0), 0);
    const balanceKg = Math.max(0, (inw.quantityKg || 0) - totalOutwardKg);

    // Safe date parsing to prevent date-fns crash if missing
    const inwDate = inw.date ? new Date(inw.date) : new Date();

    // If completely outbound before fromDate, skip
    // Or if balance is 0 and it went out before fromDate, skip
    let latestOutwardDate = new Date(inwDate);
    for (const ro of relatedOutwards) {
      const roDate = ro.date ? new Date(ro.date) : new Date();
      if (isAfter(roDate, latestOutwardDate)) {
        latestOutwardDate = roDate;
      }
    }
    
    if (balanceKg <= 0 && isBefore(latestOutwardDate, fromDate)) {
      continue;
    }

    // Determine calculation dates
    // Valid duration is intersection of [inwardDate, latestOutward/toDate] and [fromDate, toDate]
    const startCalcDate = isAfter(inwDate, fromDate) ? inwDate : fromDate;
    
    // If balance is 0, the billing stops at latestOutwardDate, else up to toDate
    const endCalcDate = balanceKg <= 0 && isBefore(latestOutwardDate, toDate) ? latestOutwardDate : toDate;
    
    const days = Math.max(0, differenceInDays(endCalcDate, startCalcDate) + 1);
    if (days <= 0) continue; // No days to bill

    // Get pricing from commodity
    const month = startCalcDate.getMonth() + 1; // 1-12
    const seasonalPrice = commodity.seasonalPrices?.find((sp: any) => sp.fromMonth <= month && sp.toMonth >= month) 
                          || commodity.seasonalPrices?.[0];

    const pricePerKg = seasonalPrice?.pricePerKg || 0;
    let rent = 0;
    let calculationPath = '';
    let rateApplied = pricePerKg;

    const bagsLarge = inw.bagsCount || 0;
    const bagsSmall = inw.jin || 0;
    const bagsMixed = inw.mixed || 0;
    const totalBags = inw.totalBags || (bagsLarge + bagsSmall + bagsMixed);
    
    // Check grading type and price type
    if (commodity.gradingType === 'Wet') {
      rent = ((inw.quantityKg || 0) / 81) * pricePerKg * days * 4;
      calculationPath = `(${(inw.quantityKg || 0).toFixed(2)} Kg ÷ 81) × ₹${pricePerKg} × ${days} Days × 4 (Wet)`;
    } else if (commodity.priceType === 'Different Price') {
      const pLarge = seasonalPrice?.priceLarge || 0;
      const pSmall = seasonalPrice?.priceSmall || 0;
      const pMixed = seasonalPrice?.priceMixed || 0;
      
      const rentLarge = bagsLarge * pLarge * days;
      const rentSmall = bagsSmall * pSmall * days;
      const rentMixed = bagsMixed * pMixed * days;
      
      rent = rentLarge + rentSmall + rentMixed;
      rateApplied = 0; // Mixed rates
      calculationPath = `${days} Days × [(L: ${bagsLarge}×₹${pLarge}) + (S: ${bagsSmall}×₹${pSmall}) + (M: ${bagsMixed}×₹${pMixed})]`;
    } else {
      // Same Price formula: Weight × Price × Days
      // Inward uses full weight or balance? Standard practice often bills the full inward weight 
      // or we must bill weight balance. For simplicity and per formula: Weight × Price × Days
      rent = (inw.quantityKg || 0) * pricePerKg * days;
      calculationPath = `${(inw.quantityKg || 0).toFixed(2)} Kg × ₹${pricePerKg} × ${days} Days`;
    }

    items.push({
      inwardId: inw._id.toString(),
      inwardDate: inwDate.toISOString(),
      outwardDate: (totalOutwardKg > 0 && latestOutwardDate) ? new Date(latestOutwardDate).toISOString() : null,
      commodityId: commodity._id.toString(),
      commodityName: commodity.name + (commodity.type ? ` (${commodity.type})` : ''),
      quantityKg: inw.quantityKg || 0,
      outwardKg: totalOutwardKg,
      balanceKg: balanceKg,
      bagsLarge,
      bagsSmall,
      bagsMixed,
      totalBags,
      days,
      rateApplied,
      subtotal: rent,
      calculationPath
    });

    totalAmount += rent;
  }

  return {
    items,
    totalAmount
  };
}

export async function saveColdClientInvoice(data: any) {
  await connectToDatabase();
  // Ensure models are registered
  ColdCommodity.init();
  const session = await requireSession();
  
  const invoiceId = `CIN-${Date.now().toString().slice(-6)}`;
  
  const doc = appendOwnership({
    ...data,
    invoiceId,
    status: 'ACTIVE'
  }, session);
  
  const invoice = await ColdInvoice.create(doc);
  return JSON.parse(JSON.stringify(invoice));
}

export async function getColdInvoices() {
  await connectToDatabase();
  const session = await requireSession();
  const filter = getTenantFilter(session);
  
  const invoices = await ColdInvoice.find(filter)
    .populate('clientId', 'name mobile')
    .populate('warehouseId', 'name')
    .sort({ createdAt: -1 })
    .lean();
    
  return JSON.parse(JSON.stringify(invoices));
}
