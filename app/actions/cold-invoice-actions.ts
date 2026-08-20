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
  fromDateStr: string | null,
  toDateStr: string | null,
  outwardIds?: string[]
) {
  await connectToDatabase();
  ColdCommodity.init();
  const session = await requireSession();
  const tenantFilter = getTenantFilter(session);

  let fromDate: Date | null = null;
  let toDate: Date | null = null;
  if (fromDateStr) {
    fromDate = new Date(fromDateStr);
  }
  if (toDateStr) {
    toDate = new Date(toDateStr);
    toDate.setHours(23, 59, 59, 999);
  }

  const matchCriteria = {
    warehouseId: new mongoose.Types.ObjectId(warehouseId),
    clientId: new mongoose.Types.ObjectId(clientId),
    ...tenantFilter,
  };

  // Build invoice items directly from outwards so cold invoices only include amounts for which an outward has happened
  // If outwardIds specified, fetch only those outwards. Otherwise fallback to date-based fetch (if provided) or all up-to-date outwards.
  let outwardsQuery: any = { ...matchCriteria };
  if (Array.isArray(outwardIds) && outwardIds.length > 0) {
    outwardsQuery._id = { $in: outwardIds.map(id => new mongoose.Types.ObjectId(id)) };
  } else if (toDate) {
    outwardsQuery.date = { $lte: toDate };
  }

  let outwards = await ColdOutward.find(outwardsQuery).populate('commodityId').lean();

  const items: any[] = [];
  let totalAmount = 0;

  for (const out of outwards) {
    const commodity = out.commodityId as any;
    const inwardRec = out.inwardId ? await ColdInward.findById(out.inwardId).lean() : null;
    const inwardDate = inwardRec?.date ? new Date(inwardRec.date).toISOString() : null;

    const subtotal = Number(out.rentRs || 0);
    const outwardKg = out.quantityKg || 0;

    items.push({
      inwardId: out.inwardId ? out.inwardId.toString() : null,
      inwardDate,
      outwardDate: out.date ? new Date(out.date).toISOString() : null,
      outwardId: out._id ? out._id.toString() : null,
      commodityId: commodity?._id?.toString() || (out.commodityId ? out.commodityId.toString() : null),
      commodityName: commodity?.name || (out as any).commodityName || 'Commodity',
      quantityKg: out.quantityKg || 0,
      outwardKg,
      balanceKg: 0,
      bagsLarge: out.bagsCount || 0,
      bagsSmall: out.jin || 0,
      bagsMixed: out.mixed || 0,
      totalBags: out.totalBags || 0,
      days: 0,
      rateApplied: out.rentRs || 0,
      subtotal,
      calculationPath: 'Billed as per outward receipt'
    });

    const outwardAny = out as any;

    if (outwardAny.gradingCharge) {
      totalAmount += Number(outwardAny.gradingCharge || 0);
    }

    if (Array.isArray(outwardAny.additionalCharges)) {
      for (const ac of outwardAny.additionalCharges) totalAmount += Number(ac.amount || 0);
    }

    totalAmount += subtotal;
  }

  return { items, totalAmount };
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
  const filter = getTenantFilter(session);
  
  const invoices = await ColdInvoice.find(filter)
    .populate('clientId', 'name mobile')
    .populate('warehouseId', 'name')
    .sort({ createdAt: -1 })
    .lean();
    
  return JSON.parse(JSON.stringify(invoices));
}
