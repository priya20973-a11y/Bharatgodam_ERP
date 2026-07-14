'use server';

import connectToDatabase from '@/lib/mongoose';
import ColdInward from '@/lib/models/ColdInward';
import ColdOutward from '@/lib/models/ColdOutward';
import { hasPermission } from '@/lib/permissions';
import { getTenantFilter, requireSession } from '@/lib/ownership';

export async function getColdClientLedger(clientId: string) {
  await connectToDatabase();
  const session = await requireSession();
  const tenantFilter = getTenantFilter(session);
  
  const inwards = await ColdInward.find({ clientId, ...tenantFilter })
    .populate('commodityId', 'name type')
    .populate('warehouseId', 'name')
    .lean();

  const outwards = await ColdOutward.find({ clientId, ...tenantFilter })
    .populate('commodityId', 'name type')
    .populate('warehouseId', 'name')
    .lean();

  const combined = [
    ...inwards.map(i => ({ ...i, type: 'INWARD' })),
    ...outwards.map(o => ({ ...o, type: 'OUTWARD' }))
  ].map((t: any) => ({
    _id: t._id.toString(),
    type: t.type,
    date: t.date,
    commodity: t.commodityId?.name,
    warehouse: t.warehouseId?.name,
    location: `C-${t.chamberNo} / F-${t.floorNo} / S-${t.stackNo}`,
    quantityKg: t.quantityKg,
    plusMinus: t.type === 'OUTWARD' ? (t.plusMinus || 0) : null,
    totalBags: t.totalBags || t.bagsCount,
    createdAt: t.createdAt
  }));

  // Sort by date ASCENDING for ledger
  combined.sort((a, b) => {
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    if (dateA !== dateB) return dateA - dateB;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  return JSON.parse(JSON.stringify(combined));
}
