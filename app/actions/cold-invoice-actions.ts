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
    .populate('commodityId')
    .populate({
      path: 'inwardId',
      populate: { path: 'commodityId' }
    })
    .lean();

  const items: any[] = [];
  let totalAmount = 0;

  for (const outward of outwards) {
    const o = outward as any;
    const inward = o.inwardId as any;
    const commodity = o.commodityId || inward?.commodityId;

    if (!commodity) continue;

    const inwDate = inward?.date ? new Date(inward.date) : (o.date ? new Date(o.date) : new Date());
    const outDate = o.date ? new Date(o.date) : new Date();

    const bagsLarge = o.bagsCount || 0;
    const bagsSmall = o.jin || 0;
    const bagsMixed = o.mixed || 0;
    const totalBags = o.totalBags || (bagsLarge + bagsSmall + bagsMixed);
    const quantityKg = o.quantityKg || 0;

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
      const isKg = unit === 'KG' || unit === 'KILOGRAM' || unit === 'KGS';

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
    }

    let rateApplied = Number(o.unitRate || o.rateApplied || 0);
    if (rateApplied === 0 && rent > 0 && commodity.priceType !== 'Different Price') {
      const unit = (commodity.unit || 'KG').toUpperCase();
      const isKg = unit === 'KG' || unit === 'KILOGRAM' || unit === 'KGS';
      if (isKg && quantityKg > 0) {
        rateApplied = Number((rent / quantityKg).toFixed(4));
      } else if (!isKg && totalBags > 0) {
        rateApplied = Number((rent / totalBags).toFixed(4));
      }
    }

    items.push({
      outwardId: o._id.toString(),
      inwardId: inward?._id?.toString() || '',
      receiptNo: o.receiptNo || inward?.receiptNo || '',
      inwardDate: inwDate.toISOString(),
      outwardDate: outDate.toISOString(),
      commodityId: commodity._id.toString(),
      commodityName: commodity.name + (commodity.type ? ` (${commodity.type})` : ''),
      quantityKg: inward?.quantityKg || quantityKg,
      outwardKg: quantityKg,
      balanceKg: Math.max(0, (inward?.quantityKg || quantityKg) - quantityKg),
      bagsLarge,
      bagsSmall,
      bagsMixed,
      totalBags,
      days: 0,
      rateApplied,
      subtotal: rent,
      calculationPath: o.rentReason || ''
    });

    totalAmount += rent;
  }

  let gradingAmount = 0;
  let wetAmount = 0;

  for (const o of outwards) {
    if (o.serviceType === 'Grading' && (o.serviceAmount || 0) > 0) gradingAmount += (o.serviceAmount || 0);
    if (o.serviceType === 'Wet' && (o.serviceAmount || 0) > 0) wetAmount += (o.serviceAmount || 0);
    if (o.gradingApplied && (o.gradingCharge || 0) > 0) gradingAmount += (o.gradingCharge || 0);
  }

  const autoCharges = [];
  if (gradingAmount > 0) {
    autoCharges.push({ name: 'Grading Charges', amount: gradingAmount });
  }
  if (wetAmount > 0) {
    autoCharges.push({ name: 'Wet Charges', amount: wetAmount });
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
    const outwardIds = (data.items || []).map((it: any) => it.outwardId).filter(Boolean);
    if (outwardIds.length > 0) {
      await ColdOutward.updateMany({ _id: { $in: outwardIds } }, { $set: { invoiceId } });
    }
  } catch (err) {
    console.error('Failed to link outwards to saved cold invoice:', err);
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
