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

  // Fetch outwards
  const outwards = await ColdOutward.find({
    ...matchCriteria,
    date: { $gte: fromDate, $lte: toDate }
  }).populate('commodityId').lean();

  // Fetch existing invoices to exclude already billed outwards
  const existingInvoices = await ColdInvoice.find(matchCriteria).lean();
  const billedOutwardIds = new Set<string>();
  
  for (const inv of existingInvoices) {
    for (const item of (inv.items || [])) {
      if (item.outwardId) {
        billedOutwardIds.add(item.outwardId.toString());
      }
    }
  }

  const items = [];
  let totalAmount = 0;

  for (const outw of outwards) {
    const out = outw as any;
    
    if (billedOutwardIds.has(out._id.toString())) {
      continue;
    }
    
    const commodity = out.commodityId;
    if (!commodity) continue;

    const rent = out.rentRs || 0;
    const bagsLarge = out.bagsCount || 0;
    const bagsSmall = out.jin || 0;
    const bagsMixed = out.mixed || 0;
    const totalBags = out.totalBags || (bagsLarge + bagsSmall + bagsMixed);
    const outDate = out.date ? new Date(out.date) : new Date();

    items.push({
      outwardId: out._id.toString(),
      inwardId: out.inwardId ? out.inwardId.toString() : undefined,
      outwardDate: outDate.toISOString(),
      commodityId: commodity._id.toString(),
      commodityName: commodity.name + (commodity.type ? ` (${commodity.type})` : ''),
      quantityKg: out.quantityKg || 0,
      outwardKg: out.quantityKg || 0,
      balanceKg: 0,
      bagsLarge,
      bagsSmall,
      bagsMixed,
      totalBags,
      days: 0,
      rateApplied: 0,
      subtotal: rent,
      calculationPath: 'Outward Gatepass Rent'
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
