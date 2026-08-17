'use server';

import connectToDatabase from '@/lib/mongoose';
import { getDb } from '@/lib/mongodb';
import ColdLot from '@/lib/models/ColdLot';
import ColdAllocation from '@/lib/models/ColdAllocation';
import ColdWarehouse from '@/lib/models/ColdWarehouse';
import ColdInward from '@/lib/models/ColdInward';
import { requireSession, appendOwnership, getTenantFilter } from '@/lib/ownership';
import { hasPermission } from '@/lib/permissions';
import mongoose from 'mongoose';

export async function createColdLot(data: { lotNo: string; warehouseId: string; clientId?: string; commodityId?: string; totalQuantityKg: number }) {
  await connectToDatabase();
  try {
    const session = await requireSession();
    if (!hasPermission(session, 'inward', 'create')) throw new Error('Forbidden');

    const existing = await ColdLot.findOne({ warehouseId: data.warehouseId, lotNo: data.lotNo, ...getTenantFilter(session) });
    if (existing) return { success: false, error: 'Lot already exists in this warehouse' };

    const lot = await ColdLot.create(appendOwnership({
      lotNo: data.lotNo,
      warehouseId: new mongoose.Types.ObjectId(data.warehouseId),
      clientId: data.clientId ? new mongoose.Types.ObjectId(data.clientId) : undefined,
      commodityId: data.commodityId ? new mongoose.Types.ObjectId(data.commodityId) : undefined,
      totalQuantityKg: Number(data.totalQuantityKg),
      remainingQuantityKg: Number(data.totalQuantityKg),
    }, session));

    return { success: true, data: JSON.parse(JSON.stringify(lot)) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function getStackAvailable(warehouseId: string, chamberNo: number, floorNo: number, stackNo: number, sessionFilter: any) {
  // Reuse existing aggregation logic from floor-mapping-actions
  const totalStack = await ColdWarehouse.findOne({ _id: warehouseId, ...sessionFilter }).lean();
  if (!totalStack) throw new Error('Warehouse not found');
  const chamber = (totalStack.chambers || []).find((c: any) => c.chamberNo === chamberNo);
  if (!chamber) throw new Error('Chamber not found');
  const floor = (chamber.floors || []).find((f: any) => f.floorNo === floorNo);
  if (!floor) throw new Error('Floor not found');
  const stack = (floor.stacks || []).find((s: any) => s.stackNo === stackNo);
  if (!stack) throw new Error('Stack not found');

  // Calculate used capacity via ColdInward and ColdOutward (simple inward only here)
  const inwards = await ColdInward.aggregate([
    { $match: { warehouseId: new mongoose.Types.ObjectId(warehouseId), 'stackAllocations.chamberNo': chamberNo, 'stackAllocations.floorNo': floorNo, 'stackAllocations.stackNo': stackNo } },
    { $unwind: '$stackAllocations' },
    { $match: { 'stackAllocations.chamberNo': chamberNo, 'stackAllocations.floorNo': floorNo, 'stackAllocations.stackNo': stackNo } },
    { $group: { _id: null, totalInward: { $sum: '$stackAllocations.allocatedWeight' } } }
  ]);

  const totalInward = (inwards[0] && inwards[0].totalInward) || 0;
  const available = Math.max(0, (stack.capacity || 0) - totalInward);
  return { capacity: stack.capacity || 0, used: totalInward, available };
}

export async function createAllocation(data: { lotId: string; warehouseId: string; chamberNo: number; floorNo: number; stackNo: number; allocatedQuantityKg: number; inwardId?: string; clientId?: string; commodityId?: string }) {
  await connectToDatabase();
  try {
    const session = await requireSession();
    if (!hasPermission(session, 'inward', 'create')) throw new Error('Forbidden');

    const tenantFilter = getTenantFilter(session);

    // Validate lot exists
    const lot = await ColdLot.findOne({ _id: data.lotId, ...tenantFilter });
    if (!lot) throw new Error('Lot not found');
    if (lot.remainingQuantityKg < data.allocatedQuantityKg) throw new Error('Allocation exceeds remaining lot quantity');

    // Validate stack capacity
    const stackInfo = await getStackAvailable(data.warehouseId, data.chamberNo, data.floorNo, data.stackNo, tenantFilter);
    if (stackInfo.available < data.allocatedQuantityKg) throw new Error(`Only ${stackInfo.available} Kg available in selected location`);

    // Create allocation
    const alloc = await ColdAllocation.create(appendOwnership({
      warehouseId: new mongoose.Types.ObjectId(data.warehouseId),
      lotId: new mongoose.Types.ObjectId(data.lotId),
      inwardId: data.inwardId ? new mongoose.Types.ObjectId(data.inwardId) : undefined,
      clientId: data.clientId ? new mongoose.Types.ObjectId(data.clientId) : undefined,
      commodityId: data.commodityId ? new mongoose.Types.ObjectId(data.commodityId) : undefined,
      chamberNo: data.chamberNo,
      floorNo: data.floorNo,
      stackNo: data.stackNo,
      allocatedQuantityKg: Number(data.allocatedQuantityKg),
    }, session));

    // Update lot remaining quantity
    lot.remainingQuantityKg = Math.max(0, lot.remainingQuantityKg - Number(data.allocatedQuantityKg));
    if (lot.remainingQuantityKg === 0) lot.status = 'EXHAUSTED';
    await lot.save();

    return { success: true, data: JSON.parse(JSON.stringify(alloc)) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getLotAllocations(lotId: string) {
  await connectToDatabase();
  try {
    const session = await requireSession();
    const tenantFilter = getTenantFilter(session);
    const allocations = await ColdAllocation.find({ lotId, ...tenantFilter }).sort({ createdAt: -1 }).lean();
    return { success: true, data: allocations };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getColdLots(options?: { warehouseId?: string }) {
  await connectToDatabase();
  try {
    const session = await requireSession();
    const tenantFilter = getTenantFilter(session);
    const filter: any = { ...tenantFilter };
    if (options?.warehouseId) filter.warehouseId = options.warehouseId;
    const lots = await ColdLot.find(filter).sort({ createdAt: -1 }).lean();
    return { success: true, data: lots };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
