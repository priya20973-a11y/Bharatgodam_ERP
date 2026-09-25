'use server';

import connectToDatabase from '@/lib/mongoose';
import ColdInvoice from '@/lib/models/ColdInvoice';
import ColdInward from '@/lib/models/ColdInward';
import ColdOutward from '@/lib/models/ColdOutward';
import ColdCommodity from '@/lib/models/ColdCommodity';
import { hasPermission } from '@/lib/permissions';
import { requireSession, getTenantFilter, appendOwnership, getWarehouseFilter } from '@/lib/ownership';
import mongoose from 'mongoose';
import { differenceInDays } from 'date-fns';
import { generateReceiptNumber } from '@/lib/receipt-generator';
import { calculatePerMonthRent } from '@/lib/utils/cold-rent-calculator';
import { logColdActivity } from '@/lib/cold-logger';

export async function generateColdClientInvoicePreview(
  warehouseId: string,
  clientId: string,
  fromDateStr: string | null,
  toDateStr: string | null,
  outwardIds?: string[]
) {
  await connectToDatabase();
  ColdCommodity.init();
  ColdInward.init();
  const session = await requireSession();
  const tenantFilter = getTenantFilter(session);

  const matchCriteria = {
    warehouseId: new mongoose.Types.ObjectId(warehouseId),
    clientId: new mongoose.Types.ObjectId(clientId),
    ...tenantFilter,
  };

  let outwardsQuery: any = { ...matchCriteria };
  if (Array.isArray(outwardIds) && outwardIds.length > 0) {
    outwardsQuery._id = { $in: outwardIds.map(id => new mongoose.Types.ObjectId(id)) };
  } else if (toDateStr) {
    const toDate = new Date(toDateStr);
    toDate.setHours(23, 59, 59, 999);
    outwardsQuery.date = { $lte: toDate };
  }

  const outwards = await ColdOutward.find(outwardsQuery)
    .populate('commodityId', 'name type unit rentCalculationOn seasonalPrices priceType')
    .populate({
      path: 'inwardId',
      populate: { path: 'commodityId' }
    })
    .lean();

  const items: any[] = [];
  let totalAmount = 0;

  const groupedOutwards = new Map<string, any[]>();
  for (const outward of outwards) {
    const o = outward as any;
    const groupKey = o.batchId || o.receiptNumber || o.receiptNo || o._id.toString();
    if (!groupedOutwards.has(groupKey)) {
      groupedOutwards.set(groupKey, []);
    }
    groupedOutwards.get(groupKey)!.push(o);
  }

  for (const [groupKey, group] of groupedOutwards.entries()) {
    const oPrimary = group[0];
    const inward = oPrimary.inwardId as any;
    const commodity = oPrimary.commodityId || inward?.commodityId;

    if (!commodity) continue;

    const inwDate = inward?.date ? new Date(inward.date) : (oPrimary.date ? new Date(oPrimary.date) : new Date());
    const outDate = oPrimary.date ? new Date(oPrimary.date) : new Date();

    let totalBagsLarge = 0;
    let totalBagsSmall = 0;
    let totalBagsMixed = 0;
    let totalTotalBags = 0;
    let totalQuantityKg = 0;
    let totalRent = 0;
    let combinedPaths: string[] = [];

    for (const o of group) {
      const bagsLarge = o.bagsCount || 0;
      const bagsSmall = o.jin || 0;
      const bagsMixed = o.mixed || 0;
      const totalBags = o.totalBags || (bagsLarge + bagsSmall + bagsMixed);
      const quantityKg = o.quantityKg || 0;

      totalBagsLarge += bagsLarge;
      totalBagsSmall += bagsSmall;
      totalBagsMixed += bagsMixed;
      totalTotalBags += totalBags;
      totalQuantityKg += quantityKg;

      // Use stored outward rent (o.rentRs) directly as requested
      let rent = Number(o.rentRs !== undefined && o.rentRs !== null ? o.rentRs : 0);
      
      // Fallback if rentRs was not stored on the outward document:
      if (!rent || rent <= 0) {
        const startCalcTime = inwDate.getTime();
        const seasonalPrice = commodity.seasonalPrices?.find((sp: any) =>
          startCalcTime >= new Date(sp.fromDate).getTime() && startCalcTime <= new Date(sp.toDate).getTime()
        ) || commodity.seasonalPrices?.[0];
        const pricePerKg = seasonalPrice?.pricePerKg || 0;

        const unit = (commodity.unit || 'KG').toUpperCase();
        const isKg = (unit === 'KG' || unit === 'KILOGRAM' || unit === 'KGS') && commodity.rentCalculationOn !== 'Bag';

        if (isKg) {
          if (commodity.priceType === 'Different Price') {
            const pLarge = seasonalPrice?.priceLarge || 0;
            const pSmall = seasonalPrice?.priceSmall || 0;
            const pMixed = seasonalPrice?.priceMixed || 0;
            rent = (bagsLarge * pLarge) + (bagsSmall * pSmall) + (bagsMixed * pMixed);
          } else {
            rent = quantityKg * pricePerKg;
          }
        } else {
          if (commodity.priceType === 'Different Price') {
            const pLarge = seasonalPrice?.priceLarge || 0;
            const pSmall = seasonalPrice?.priceSmall || 0;
            const pMixed = seasonalPrice?.priceMixed || 0;
            rent = (bagsLarge * pLarge) + (bagsSmall * pSmall) + (bagsMixed * pMixed);
          } else {
            rent = totalBags * pricePerKg;
          }
        }

        if (commodity.rentType === 'Per Month') {
          const perMonthResult = calculatePerMonthRent({
            inwardDate: inwDate,
            outwardDate: outDate,
            seasonalPrices: commodity.seasonalPrices,
            priceType: commodity.priceType || 'Same Price',
            unit: commodity.unit || 'KG',
            rentCalculationOn: commodity.rentCalculationOn,
            gradingType: (commodity as any).gradingType,
            quantityKg,
            bagsLarge,
            bagsSmall,
            bagsMixed,
            totalBags,
          });
          rent = perMonthResult.totalRent;
          (o as any)._monthBreakdown = perMonthResult.monthBreakdown;
          (o as any)._rentReason = perMonthResult.rentReason;
        }
      }

      totalRent += rent;
      const path = (o as any)._rentReason || o.rentReason || '';
      if (path && !combinedPaths.includes(path)) {
        combinedPaths.push(path);
      }
    }

    let rateApplied = Number(oPrimary.unitRate || oPrimary.rateApplied || 0);
    if (rateApplied === 0 && totalRent > 0 && commodity.priceType !== 'Different Price') {
      const unit = (commodity.unit || 'KG').toUpperCase();
      const isKg = (unit === 'KG' || unit === 'KILOGRAM' || unit === 'KGS') && commodity.rentCalculationOn !== 'Bag';
      if (isKg && totalQuantityKg > 0) {
        rateApplied = Number((totalRent / totalQuantityKg).toFixed(4));
      } else if (!isKg && totalTotalBags > 0) {
        rateApplied = Number((totalRent / totalTotalBags).toFixed(4));
      }
    }

    items.push({
      outwardId: oPrimary._id.toString(), // Keep one primary id reference for UI
      outwardIds: group.map(o => o._id.toString()), // Array of all outward ids for linking
      inwardId: inward?._id?.toString() || '',
      receiptNo: oPrimary.receiptNumber || inward?.receiptNumber || oPrimary.receiptNo || inward?.receiptNo || '',
      inwardDate: inwDate.toISOString(),
      outwardDate: outDate.toISOString(),
      commodityId: commodity._id.toString(),
      commodityName: commodity.name + (commodity.type ? ` (${commodity.type})` : '') + (commodity.rentType === 'Per Month' ? ' (Per Month)' : ''),
      hsnCode: commodity.hsnCode || '',
      quantityKg: inward?.quantityKg || totalQuantityKg,
      outwardKg: totalQuantityKg,
      balanceKg: Math.max(0, (inward?.quantityKg || totalQuantityKg) - totalQuantityKg),
      bagsLarge: totalBagsLarge,
      bagsSmall: totalBagsSmall,
      bagsMixed: totalBagsMixed,
      totalBags: totalTotalBags,
      days: 0,
      rateApplied,
      subtotal: totalRent,
      calculationPath: combinedPaths.join(', '),
      monthBreakdown: group[0].rentBreakdown || (group[0] as any)._monthBreakdown || null
    });

    totalAmount += totalRent;
  }

  let gradingAmount = 0;
  let wetAmount = 0;
  let weighbridgeAmount = 0;
  let weighbridgeSlips: string[] = [];

  for (const o of outwards) {
    if (o.serviceType === 'Grading' && (o.serviceAmount || 0) > 0) gradingAmount += (o.serviceAmount || 0);
    if (o.serviceType === 'Wet' && (o.serviceAmount || 0) > 0) wetAmount += (o.serviceAmount || 0);
    if (o.gradingApplied && (o.gradingCharge || 0) > 0) gradingAmount += (o.gradingCharge || 0);
    
    if (o.weighbridgeCharge !== undefined && o.weighbridgeCharge !== null && o.weighbridgeCharge > 0) {
      weighbridgeAmount += o.weighbridgeCharge;
      if (o.weighbridgeSlipNo && !weighbridgeSlips.includes(o.weighbridgeSlipNo)) {
        weighbridgeSlips.push(o.weighbridgeSlipNo);
      }
    }
  }

  const autoCharges = [];
  if (gradingAmount > 0) {
    autoCharges.push({ name: 'Grading Charges', amount: gradingAmount });
  }
  if (wetAmount > 0) {
    autoCharges.push({ name: 'Wet Charges', amount: wetAmount });
  }
  if (weighbridgeAmount > 0) {
    const name = weighbridgeSlips.length > 0 
      ? `Weighbridge Charge (No: ${weighbridgeSlips.join(', ')})`
      : 'Weighbridge Charge';
    autoCharges.push({ name, amount: weighbridgeAmount });
  }

  return {
    items,
    totalAmount,
    autoCharges
  };
}

export async function saveColdClientInvoice(data: any) {
  await connectToDatabase();
  // Ensure models are registered
  ColdCommodity.init();
  const session = await requireSession();

  const invoiceId = `CIN-${Date.now().toString().slice(-6)}`;
  const invoiceReceiptNumber = await generateReceiptNumber(data.warehouseId, 'invoice');

  const doc = appendOwnership({
    ...data,
    invoiceId,
    receiptNumber: invoiceReceiptNumber,
    status: 'ACTIVE'
  }, session);

  const invoice = await ColdInvoice.create(doc);
  
  // Force update to bypass Mongoose strict mode schema caching in Next.js dev server
  if (data.taxGroup || data.billingState || data.adjustment !== undefined) {
    await ColdInvoice.updateOne(
      { _id: invoice._id }, 
      { $set: { 
          taxGroup: data.taxGroup || 'Non-GST Supply', 
          billingState: data.billingState || '',
          adjustment: data.adjustment || 0
        } 
      }
    );
    invoice.taxGroup = data.taxGroup || 'Non-GST Supply';
    invoice.billingState = data.billingState || '';
    invoice.adjustment = data.adjustment || 0;
  }

  // Link any referenced outwards to this invoice for traceability
  try {
    const outwardIds = (data.items || []).flatMap((it: any) => it.outwardIds || [it.outwardId]).filter(Boolean);
    if (outwardIds.length > 0) {
      await ColdOutward.updateMany({ _id: { $in: outwardIds } }, { $set: { invoiceId } });
    }
  } catch (err) {
    console.error('Failed to link outwards to saved cold invoice:', err);
  }

  try {
    const client = await mongoose.model('Client').findById(data.clientId).lean() as any;
    const clientName = client ? client.name : 'Unknown';

    await logColdActivity({
      actionType: 'CREATE',
      module: 'Invoices',
      recordId: invoice._id.toString(),
      description: `Invoice ${invoiceReceiptNumber} created for ${clientName}.`,
      newValue: JSON.parse(JSON.stringify(invoice)),
      sessionFallback: session
    });
  } catch (logErr) {
    console.error('Failed to log invoice activity:', logErr);
  }

  return JSON.parse(JSON.stringify(invoice));
}

export async function getColdInvoices() {
  await connectToDatabase();
  const session = await requireSession();
  const filter = { ...getTenantFilter(session), ...getWarehouseFilter(session) };

  const invoices = await ColdInvoice.find(filter)
    .populate('clientId', 'name mobile')
    .populate('warehouseId', 'name')
    .sort({ createdAt: -1 })
    .lean();

  return JSON.parse(JSON.stringify(invoices));
}
