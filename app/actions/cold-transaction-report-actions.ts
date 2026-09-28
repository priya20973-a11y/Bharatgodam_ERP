'use server';

import connectToDatabase from '@/lib/mongoose';
import ColdInward from '@/lib/models/ColdInward';
import ColdOutward from '@/lib/models/ColdOutward';
import ColdTransfer from '@/lib/models/ColdTransfer';
import ColdCommodity from '@/lib/models/ColdCommodity';
import { revalidatePath } from 'next/cache';
import { hasPermission } from '@/lib/permissions';
import { getTenantFilter, requireSession, getWarehouseFilter } from '@/lib/ownership';
import { getStackAvailableCapacity } from './cold-inward-actions';
import mongoose from 'mongoose';
import { calculatePerMonthRent } from '@/lib/utils/cold-rent-calculator';
import { logColdActivity } from '@/lib/cold-logger';
export async function getColdTransactionFilters() {
  await connectToDatabase();
  const session = await requireSession();
  const tenantFilter = { ...getTenantFilter(session), ...getWarehouseFilter(session) };

  const [clients, warehouses] = await Promise.all([
    mongoose.model('Client').find(getTenantFilter(session)).select('name').lean(),
    mongoose.model('ColdWarehouse').find(tenantFilter).select('name chambers.name chambers.chamberNo').lean()
  ]);

  const clientNames = Array.from(new Set(clients.map((c: any) => c.name).filter(Boolean))).sort();
  const warehouseNames = Array.from(new Set(warehouses.map((w: any) => w.name).filter(Boolean))).sort();
  
  const chambers = new Set<string>();
  warehouses.forEach((w: any) => {
    if (w.chambers) {
      w.chambers.forEach((c: any) => {
        if (c.name) chambers.add(c.name);
        if (c.chamberNo) chambers.add(String(c.chamberNo));
      });
    }
  });
  
  const [minInward, maxInward] = await Promise.all([
    ColdInward.findOne(tenantFilter).sort({ date: 1 }).select('date').lean(),
    ColdInward.findOne(tenantFilter).sort({ date: -1 }).select('date').lean()
  ]);
  
  const months: string[] = [];
  if (minInward?.date && maxInward?.date) {
    let current = new Date(minInward.date);
    const end = new Date(maxInward.date);
    while (current <= end) {
      months.push(current.toISOString().substring(0, 7));
      current.setMonth(current.getMonth() + 1);
    }
  }
  
  return {
    clients: clientNames,
    warehouses: warehouseNames,
    chambers: Array.from(chambers).sort(),
    months: months.reverse()
  };
}

export async function getColdTransactions(params: any = {}) {
  await connectToDatabase();
  const session = await requireSession();
  const tenantFilter = { ...getTenantFilter(session), ...getWarehouseFilter(session) };

  const {
    page = 1,
    limit = 20,
    search = '',
    receiptSearch = '',
    lotNoSearch = '',
    clientFilter = 'ALL',
    warehouseFilter = 'ALL',
    chamberFilter = 'ALL',
    monthFilter = 'ALL',
    fetchAll = false
  } = params;

  let baseMatch: any = { ...tenantFilter };

  if (monthFilter !== 'ALL') {
    const start = new Date(`${monthFilter}-01T00:00:00.000Z`);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);
    baseMatch.date = { $gte: start, $lte: end };
  }

  if (receiptSearch) {
    baseMatch.receiptNumber = { $regex: receiptSearch, $options: 'i' };
  }
  
  let lotInwardIds: any[] = [];
  if (lotNoSearch) {
    const lotInwards = await ColdInward.find({ lotNo: { $regex: lotNoSearch, $options: 'i' }, ...tenantFilter }).select('_id').lean();
    lotInwardIds = lotInwards.map((i: any) => i._id);
  }

  let clientObjId: any = null;
  if (clientFilter !== 'ALL') {
    const client = await mongoose.model('Client').findOne({ name: clientFilter }).select('_id').lean();
    clientObjId = client ? (client as any)._id : '000000000000000000000000';
  }

  let warehouseObjId: any = null;
  if (warehouseFilter !== 'ALL') {
    const warehouse = await mongoose.model('ColdWarehouse').findOne({ name: warehouseFilter }).select('_id').lean();
    warehouseObjId = warehouse ? (warehouse as any)._id : '000000000000000000000000';
  }

  let searchOrs: any[] = [];
  if (search) {
    const regex = new RegExp(search, 'i');
    const [clients, comms] = await Promise.all([
      mongoose.model('Client').find({ name: regex }).select('_id').lean(),
      mongoose.model('ColdCommodity').find({ name: regex }).select('_id').lean()
    ]);
    if (clients.length > 0) searchOrs.push({ clientId: { $in: clients.map((c: any) => c._id) } });
    if (comms.length > 0) searchOrs.push({ commodityId: { $in: comms.map((c: any) => c._id) } });
  }

  const buildQuery = (type: string) => {
    let q: any = { ...baseMatch };
    if (warehouseObjId) q.warehouseId = warehouseObjId;
    
    if (chamberFilter !== 'ALL') {
      const cNum = isNaN(Number(chamberFilter)) ? chamberFilter : Number(chamberFilter);
      q.$or = [
        { chamberName: chamberFilter },
        { chamberNo: cNum },
        { 'stackAllocations.chamberName': chamberFilter },
        { 'stackAllocations.chamberNo': cNum }
      ];
    }

    if (type === 'INWARD') {
      q.remarks = { $ne: 'Ownership Transfer In' };
      if (clientObjId) q.clientId = clientObjId;
      if (search && searchOrs.length > 0) q.$or = (q.$or || []).concat([{ $or: searchOrs }]);
      else if (search) q._id = '000000000000000000000000';
      if (lotNoSearch) q._id = { $in: lotInwardIds };
    } else if (type === 'OUTWARD') {
      q.remarks = { $nin: ['Ownership Transfer Out', 'Ownership Transfer Purchase'] };
      if (clientObjId) q.clientId = clientObjId;
      if (search && searchOrs.length > 0) q.$or = (q.$or || []).concat([{ $or: searchOrs }]);
      else if (search) q._id = '000000000000000000000000';
      if (lotNoSearch) q.inwardId = { $in: lotInwardIds };
    } else if (type === 'TRANSFER') {
      if (clientObjId) {
        q.$or = (q.$or || []).concat([{ $or: [{ fromClientId: clientObjId }, { toClientId: clientObjId }] }]);
      }
      if (search && searchOrs.length > 0) {
        const transferSearch = searchOrs.map((s: any) => {
          if (s.clientId) return { $or: [{ fromClientId: s.clientId.$in }, { toClientId: s.clientId.$in }] };
          return s;
        });
        q.$or = (q.$or || []).concat([{ $or: transferSearch }]);
      } else if (search) {
        q._id = '000000000000000000000000';
      }
      if (lotNoSearch) q.originalInwardId = { $in: lotInwardIds };
    }
    
    return q;
  };

  const [inwardsIds, outwardsIds, transfersIds] = await Promise.all([
    ColdInward.find(buildQuery('INWARD')).select('_id date createdAt').lean(),
    ColdOutward.find(buildQuery('OUTWARD')).select('_id date createdAt').lean(),
    ColdTransfer.find(buildQuery('TRANSFER')).select('_id date createdAt').lean()
  ]);

  const combinedIds = [
    ...inwardsIds.map((i: any) => ({ _id: i._id, date: i.date, createdAt: i.createdAt, type: 'INWARD' })),
    ...outwardsIds.map((o: any) => ({ _id: o._id, date: o.date, createdAt: o.createdAt, type: 'OUTWARD' })),
    ...transfersIds.map((t: any) => ({ _id: t._id, date: t.date, createdAt: t.createdAt, type: 'OWNERSHIP TRANSFER' }))
  ];

  combinedIds.sort((a, b) => {
    const dateA = new Date(a.date || 0).getTime();
    const dateB = new Date(b.date || 0).getTime();
    if (dateB !== dateA) return dateB - dateA;
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  });

  const totalCount = combinedIds.length;
  const pagedIds = fetchAll ? combinedIds : combinedIds.slice((page - 1) * limit, page * limit);

  const iIds = pagedIds.filter(p => p.type === 'INWARD').map(p => p._id);
  const oIds = pagedIds.filter(p => p.type === 'OUTWARD').map(p => p._id);
  const tIds = pagedIds.filter(p => p.type === 'OWNERSHIP TRANSFER').map(p => p._id);

  const [inwards, outwards, transfers] = await Promise.all([
    ColdInward.find({ _id: { $in: iIds } })
      .populate('clientId', 'name clientType')
      .populate('commodityId', 'name type gradingType rentCalculationOn')
      .populate('warehouseId', 'name warehouseId chambers')
      .lean(),
    ColdOutward.find({ _id: { $in: oIds } })
      .populate('clientId', 'name clientType')
      .populate('commodityId', 'name type gradingType rentCalculationOn')
      .populate('warehouseId', 'name warehouseId chambers')
      .populate('inwardId', 'lotNo')
      .lean(),
    ColdTransfer.find({ _id: { $in: tIds } })
      .populate('fromClientId', 'name clientType')
      .populate('toClientId', 'name clientType')
      .populate('commodityId', 'name type gradingType rentCalculationOn')
      .populate('warehouseId', 'name warehouseId chambers')
      .populate('originalInwardId', 'lotNo')
      .lean()
  ]);

  const combined = [
    ...inwards.map(i => ({ ...i, type: 'INWARD' })),
    ...outwards.map(o => ({ ...o, type: 'OUTWARD' })),
    ...transfers.map(t => ({ ...t, type: 'OWNERSHIP TRANSFER' }))
  ].map((t: any) => {
    let clientData;
    let previousClientData;

    if (t.type === 'OWNERSHIP TRANSFER') {
      clientData = { _id: t.toClientId?._id?.toString(), name: t.toClientId?.name, clientType: t.toClientId?.clientType };
      previousClientData = { _id: t.fromClientId?._id?.toString(), name: t.fromClientId?.name, clientType: t.fromClientId?.clientType };
    } else {
      clientData = { _id: t.clientId?._id?.toString(), name: t.clientId?.name, clientType: t.clientId?.clientType };
    }

    const rawAllocations = (t.stackAllocations && t.stackAllocations.length > 0)
      ? t.stackAllocations
      : [{
          chamberName: t.chamberName,
          chamberNo: t.chamberNo,
          floorNo: t.floorNo,
          floorName: t.floorName,
          stackNo: t.stackNo,
          allocatedWeight: t.quantityKg,
          bagsCount: t.bagsCount || t.totalBags
        }];

    const mergedAllocationsMap = new Map<string, any>();

    rawAllocations.forEach((alloc: any) => {
      const cName = alloc.chamberName || alloc.chamberNo;
      const normChamber = String(cName || '').replace(/^Chamber\s+/i, '').trim();
      const normFloor = String(alloc.floorNo ?? alloc.floorName ?? '').trim();
      const normStack = String(alloc.stackNo ?? alloc.stackName ?? '').trim();

      const key = `${normChamber}_${normFloor}_${normStack}`;

      let resolvedFloorName = alloc.floorName || alloc.floorNo;
      if (!alloc.floorName && t.warehouseId?.chambers) {
        const chamber = t.warehouseId.chambers.find((c: any) => c.name === cName || c.chamberNo === cName || c.chamberNo === Number(cName));
        if (chamber) {
          const floor = (chamber.floors || []).find((f: any) => f.floorNo === alloc.floorNo);
          if (floor?.name) resolvedFloorName = floor.name;
        }
      }

      const weight = Number(alloc.allocatedWeight ?? alloc.quantityKg ?? 0);
      const bags = Number(alloc.bagsCount ?? 0);

      if (mergedAllocationsMap.has(key)) {
        const existing = mergedAllocationsMap.get(key);
        existing.allocatedWeight += weight;
        existing.bagsCount += bags;
      } else {
        mergedAllocationsMap.set(key, {
          chamberName: alloc.chamberName || (alloc.chamberNo ? String(alloc.chamberNo) : ''),
          chamberNo: alloc.chamberNo,
          floorNo: alloc.floorNo,
          floorName: resolvedFloorName,
          stackNo: alloc.stackNo,
          allocatedWeight: weight,
          bagsCount: bags,
          stockType: alloc.stockType
        });
      }
    });

    const processedAllocations = Array.from(mergedAllocationsMap.values());

    return {
      _id: t._id.toString(),
      type: t.type,
      date: t.date,
      client: clientData,
      previousClient: previousClientData,
      commodity: { _id: t.commodityId?._id?.toString(), name: t.commodityId?.name, type: t.commodityId?.type },
      warehouse: { _id: t.warehouseId?._id?.toString(), name: t.warehouseId?.name },
      stackAllocations: processedAllocations,
      chamberNo: processedAllocations.map((s: any) => String(s.chamberName || s.chamberNo).replace(/^Chamber\s+/i, '')).join('; '),
      floorNo: processedAllocations.map((s: any) => s.floorName || s.floorNo).join('; '),
      stackNo: processedAllocations.map((s: any) => s.stackNo).join('; '),
      quantityKg: t.quantityKg,
      netWeightLoss: t.netWeightLoss,
      bagsCount: t.totalBags !== undefined ? t.totalBags : t.bagsCount,
      grade: t.grade,
      gradingType: t.gradingType || t.commodityId?.gradingType,
      referencePersons: t.referencePersons,
      createdAt: t.createdAt,
      stockType: t.clientId?.clientType === 'PURCHASE' ? 'Purchase' : t.stockType,
      purchaseQuantityKg: t.clientId?.clientType === 'PURCHASE' ? t.quantityKg : t.purchaseQuantityKg,
      selfQuantityKg: t.clientId?.clientType === 'PURCHASE' ? 0 : t.selfQuantityKg,
      transferType: t.transferType,
      remarks: t.remarks,
      receiptNumber: t.receiptNumber || '',
      weighbridgeSlipNo: t.weighbridgeSlipNo || '',
      lotNo: t.type === 'INWARD' ? t.lotNo : (t.type === 'OUTWARD' ? t.inwardId?.lotNo : t.originalInwardId?.lotNo) || ''
    };
  }).filter((t: any) => {
    // Hide the automatically generated Inward/Outward for Ownership Transfers so they don't duplicate
    if (t.type === 'INWARD' && (t as any).remarks === 'Ownership Transfer In') return false;
    if (t.type === 'OUTWARD' && (t as any).remarks === 'Ownership Transfer Out') return false;
    if (t.type === 'OUTWARD' && (t as any).remarks === 'Ownership Transfer Purchase') return false;
    return true;
  });

  // Sort by date DESC, then createdAt DESC
  combined.sort((a, b) => {
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    if (dateB !== dateA) return dateB - dateA;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return { transactions: JSON.parse(JSON.stringify(combined)), totalCount };
}

export async function deleteColdTransaction(id: string, type: 'INWARD' | 'OUTWARD') {
  await connectToDatabase();
  const session = await requireSession();
  if (!hasPermission(session, 'reports', 'delete')) throw new Error('Forbidden: Insufficient permissions');
  const tenantFilter = { ...getTenantFilter(session), ...getWarehouseFilter(session) };

  try {
    if (type === 'INWARD') {
      const inward = await ColdInward.findOne({ _id: id, ...tenantFilter });
      if (!inward) throw new Error('Transaction not found');

      // Validation: Block edit/delete of Inward if Outward exists for that specific transaction.
      // We check if any outward exists for this client, commodity, and stack.
      const outwardExists = await ColdOutward.exists({
        clientId: inward.clientId,
        commodityId: inward.commodityId,
        warehouseId: inward.warehouseId,
        $or: inward.stackAllocations.map((s: any) => ({
          $or: [ { chamberName: s.chamberName || s.chamberNo?.toString() }, ...(s.chamberNo ? [{ chamberNo: s.chamberNo }] : []) ],
          floorNo: s.floorNo,
          stackNo: s.stackNo
        })),
        ...tenantFilter
      });

      if (outwardExists) {
        return { success: false, error: 'Cannot edit/delete. Outward transaction exists.' };
      }

      await ColdInward.deleteOne({ _id: id });
    } else {
      const outward = await ColdOutward.findOne({ _id: id, ...tenantFilter });
      if (!outward) throw new Error('Transaction not found');
      
      let inward;
      if (outward.inwardId) {
        inward = await ColdInward.findOne({ _id: outward.inwardId, ...tenantFilter });
      } else {
        inward = await ColdInward.findOne({
          clientId: outward.clientId,
          commodityId: outward.commodityId,
          warehouseId: outward.warehouseId,
          $or: [
            { 'stackAllocations.chamberName': outward.chamberName || outward.chamberNo?.toString() },
            ...(outward.chamberNo ? [{ 'stackAllocations.chamberNo': outward.chamberNo }] : [])
          ],
          'stackAllocations.floorNo': outward.floorNo,
          'stackAllocations.stackNo': outward.stackNo,
          ...tenantFilter
        });
      }

      if (inward) {
        const restoredKg = (inward.remainingQuantityKg || 0) + (outward.quantityKg || 0);
        const restoredBags = (inward.remainingBagsCount || 0) + (outward.bagsCount || 0);
        
        inward.remainingQuantityKg = Math.min(restoredKg, inward.quantityKg || restoredKg);
        inward.remainingBagsCount = Math.min(restoredBags, inward.bagsCount || restoredBags);
        
        if (inward.remainingQuantityKg >= (inward.quantityKg || 0)) {
           inward.status = 'Active';
        } else {
           inward.status = 'Partial';
        }
        await inward.save();
      }

      await ColdOutward.deleteOne({ _id: id });
    }

    revalidatePath('/cold/transactions-report');
    revalidatePath('/cold/inward');
    revalidatePath('/cold/outward');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to delete transaction' };
  }
}

export async function getColdTransactionById(id: string, type: 'INWARD' | 'OUTWARD') {
  await connectToDatabase();
  const session = await requireSession();
  const tenantFilter = { ...getTenantFilter(session), ...getWarehouseFilter(session) };

  let transaction;
  if (type === 'INWARD') {
    const inward = await ColdInward.findOne({ _id: id, ...tenantFilter }).lean();
    if (!inward) throw new Error('Inward transaction not found');

    // Check if any outward exists for this inward stack
    const outwardExists = await ColdOutward.exists({
      clientId: inward.clientId,
      commodityId: inward.commodityId,
      warehouseId: inward.warehouseId,
      $or: inward.stackAllocations.map((s: any) => ({
        $or: [ { chamberName: s.chamberName || s.chamberNo?.toString() }, ...(s.chamberNo ? [{ chamberNo: s.chamberNo }] : []) ],
        floorNo: s.floorNo,
        stackNo: s.stackNo
      })),
      ...tenantFilter
    });

    transaction = { ...inward, type: 'INWARD', hasOutward: !!outwardExists };
  } else {
    const outward = await ColdOutward.findOne({ _id: id, ...tenantFilter }).lean();
    if (!outward) throw new Error('Outward transaction not found');
    transaction = { ...outward, type: 'OUTWARD' };
  }

  return JSON.parse(JSON.stringify(transaction));
}

export async function updateColdTransaction(id: string, type: 'INWARD' | 'OUTWARD', data: any) {
  await connectToDatabase();
  const session = await requireSession();
  if (!hasPermission(session, 'reports', 'edit')) throw new Error('Forbidden: Insufficient permissions');
  const tenantFilter = { ...getTenantFilter(session), ...getWarehouseFilter(session) };

  try {
    if (data && data.grade === '') {
      data.grade = undefined;
    }

    if (type === 'INWARD') {
      const inward = await ColdInward.findOne({ _id: id, ...tenantFilter });
      if (!inward) throw new Error('Transaction not found');

      const previousValue = JSON.parse(JSON.stringify(inward));

      const outwardExists = await ColdOutward.exists({
        clientId: inward.clientId,
        commodityId: inward.commodityId,
        warehouseId: inward.warehouseId,
        $or: inward.stackAllocations.map((s: any) => ({
          $or: [ { chamberName: s.chamberName || s.chamberNo?.toString() }, ...(s.chamberNo ? [{ chamberNo: s.chamberNo }] : []) ],
          floorNo: s.floorNo,
          stackNo: s.stackNo
        })),
        ...tenantFilter
      });

      if (outwardExists) {
        return { success: false, error: 'Cannot edit Inward. Related Outward transaction exists.' };
      }

      if (data.stackAllocations) {
        for (const stack of data.stackAllocations) {
          const capacityInfo = await getStackAvailableCapacity(inward.warehouseId.toString(), stack.chamberNo, stack.floorNo, stack.stackNo);
          
          const currentAllocation = inward.stackAllocations.find((s: any) => 
            (s.chamberName === stack.chamberName || s.chamberNo === stack.chamberNo) && 
            s.floorNo === stack.floorNo && 
            s.stackNo === stack.stackNo
          );
          const currentWeight = currentAllocation ? currentAllocation.allocatedWeight : 0;
          
          const trueAvailable = capacityInfo.availableCapacity + currentWeight;
          
          if (stack.allocatedWeight > trueAvailable) {
             return { success: false, error: `Quantity exceeds available stack capacity in Chamber ${stack.chamberNo}, Floor ${stack.floorNo}, Stack ${stack.stackNo}. Available: ${trueAvailable} Kg` };
          }
        }
      }

      const client: any = await connectToDatabase().then(() => mongoose.model('Client').findById(inward.clientId).lean());
      const isPurchaseClient = client?.clientType === 'PURCHASE';

      if (isPurchaseClient) {
        data.stockType = 'Purchase';
        data.purchaseQuantityKg = data.quantityKg || inward.quantityKg;
        data.purchaseBagsCount = data.bagsCount || inward.bagsCount;
        data.selfQuantityKg = 0;
        data.selfBagsCount = 0;
        if (data.stackAllocations) {
          data.stackAllocations = data.stackAllocations.map((s: any) => ({ ...s, stockType: 'Purchase' }));
        }
      }

      // Update inward fields
      Object.assign(inward, data);
      
      if (data.stackAllocations) {
        inward.quantityKg = data.stackAllocations.reduce((sum: number, s: any) => sum + (Number(s.allocatedWeight) || 0), 0);
        if (isPurchaseClient) {
          inward.purchaseQuantityKg = inward.quantityKg;
        }
      }
      
      inward.totalBags = (inward.bagsCount || 0) + (inward.jin || 0) + (inward.mixed || 0);
      
      await inward.save();

      await logColdActivity({
        actionType: 'UPDATE',
        module: 'Report',
        recordId: inward._id.toString(),
        description: `Transaction updated from Report`,
        previousValue,
        newValue: JSON.parse(JSON.stringify(inward)),
        sessionFallback: session
      });
    } else {
      const outward = await ColdOutward.findOne({ _id: id, ...tenantFilter });
      if (!outward) throw new Error('Transaction not found');

      const previousValue = JSON.parse(JSON.stringify(outward));

      // Fetch the related inward based on inwardId or the matching stack details
      let inward;
      if (outward.inwardId) {
        inward = await ColdInward.findOne({ _id: outward.inwardId, ...tenantFilter });
      } else {
        inward = await ColdInward.findOne({
          clientId: outward.clientId,
          commodityId: outward.commodityId,
          warehouseId: outward.warehouseId,
          $or: [
            { 'stackAllocations.chamberName': outward.chamberName || outward.chamberNo?.toString() },
            ...(outward.chamberNo ? [{ 'stackAllocations.chamberNo': outward.chamberNo }] : [])
          ],
          'stackAllocations.floorNo': outward.floorNo,
          'stackAllocations.stackNo': outward.stackNo,
          ...tenantFilter
        });
      }

      if (!inward) throw new Error('Related Inward transaction not found for validation');

      const outwardDate = new Date(data.date);
      const inwardDate = new Date(inward.date);
      if (outwardDate < inwardDate) {
        return { success: false, error: 'Outward date cannot be before the related Inward date.' };
      }

      // Find all OTHER outwards for this inward to calculate available capacity correctly
      const otherOutwards = await ColdOutward.find({
        clientId: inward.clientId,
        commodityId: inward.commodityId,
        warehouseId: inward.warehouseId,
        $or: [
          { chamberName: outward.chamberName || outward.chamberNo?.toString() },
          ...(outward.chamberNo ? [{ chamberNo: outward.chamberNo }] : [])
        ],
        floorNo: outward.floorNo,
        stackNo: outward.stackNo,
        _id: { $ne: outward._id },
        ...tenantFilter
      });

      const totalOtherOutwardQty = otherOutwards.reduce((sum, o) => sum + o.quantityKg, 0);
      const availableQtyForThisEdit = inward.quantityKg - totalOtherOutwardQty;

      if (data.quantityKg > availableQtyForThisEdit) {
        return { success: false, error: `Quantity exceeds available balance (${availableQtyForThisEdit} Kg).` };
      }

      let rentRs = 0;
      let rentReason = '';
      const commodity = await ColdCommodity.findById(outward.commodityId);
      
      if (commodity && commodity.seasonalPrices && commodity.seasonalPrices.length > 0) {
        const outTime = outwardDate.getTime();
        const season = commodity.seasonalPrices.find((s: any) => outTime >= new Date(s.fromDate).getTime() && outTime <= new Date(s.toDate).getTime()) || commodity.seasonalPrices[0];
        
        if (season) {
          const bagsLarge = Number(data.bagsCount) || 0;
          const bagsSmall = Number(data.jin) || 0;
          const bagsMixed = Number(data.mixed) || 0;
          const totalBags = bagsLarge + bagsSmall + bagsMixed;
          const quantityKg = Number(data.quantityKg) || 0;

          let pLarge = 0, pSmall = 0, pMixed = 0;
          let baseUnitRate = 0;

          if (commodity.priceType === 'Different Price') {
            pLarge = season.priceLarge || 0;
            pSmall = season.priceSmall || 0;
            pMixed = season.priceMixed || 0;
            baseUnitRate = pLarge;
            if (!pLarge && !pSmall && !pMixed) rentReason = 'Rates not found for any bag types';
          } else {
            baseUnitRate = season.pricePerKg || 0;
            if (!baseUnitRate) rentReason = 'Price Per Unit not set';
          }

          const unit = (commodity.unit || 'KG').toUpperCase();
          const isKg = (unit === 'KG' || unit === 'KILOGRAM' || unit === 'KGS') && commodity.rentCalculationOn !== 'Bag';

          if (isKg) {
            let largeWeight = 0, smallWeight = 0, mixedWeight = 0;
            if (totalBags > 0) {
              largeWeight = (bagsLarge / totalBags) * quantityKg;
              smallWeight = (bagsSmall / totalBags) * quantityKg;
              mixedWeight = (bagsMixed / totalBags) * quantityKg;
            } else {
              largeWeight = quantityKg; // Fallback
            }

            if (commodity.priceType === 'Different Price') {
              if (commodity.gradingType === 'Wet') {
                const rateLarge = (largeWeight / 81) * pLarge * 4;
                const rateSmall = (smallWeight / 81) * pSmall * 4;
                const rateMixed = (mixedWeight / 81) * pMixed * 4;
                rentRs = rateLarge + rateSmall + rateMixed;
              } else {
                const rateLarge = largeWeight * pLarge;
                const rateSmall = smallWeight * pSmall;
                const rateMixed = mixedWeight * pMixed;
                rentRs = rateLarge + rateSmall + rateMixed;
              }
            } else {
              rentRs = quantityKg * baseUnitRate;
            }
          } else {
            // Storage Unit != KG
            if (commodity.priceType === 'Different Price') {
              rentRs = (bagsLarge * pLarge) + (bagsSmall * pSmall) + (bagsMixed * pMixed);
            } else {
              rentRs = totalBags * baseUnitRate;
            }
          }

          if (commodity.rentType === 'Per Month') {
            const perMonthResult = calculatePerMonthRent({
              inwardDate: inward.date,
              outwardDate: outwardDate,
              seasonalPrices: commodity.seasonalPrices,
              priceType: commodity.priceType || 'Same Price',
              unit: commodity.unit || 'KG',
              rentCalculationOn: commodity.rentCalculationOn,
              gradingType: commodity.gradingType,
              quantityKg: Number(data.quantityKg) || 0,
              bagsLarge: Number(data.bagsCount) || 0,
              bagsSmall: Number(data.jin) || 0,
              bagsMixed: Number(data.mixed) || 0,
              totalBags: (Number(data.bagsCount) || 0) + (Number(data.jin) || 0) + (Number(data.mixed) || 0),
            });
            rentRs = perMonthResult.totalRent;
            if (!rentReason) rentReason = perMonthResult.rentReason;
          }
        } else {
          rentReason = 'Seasonal price not found for date';
        }
      } else {
        rentReason = 'Commodity pricing not configured';
      }

      Object.assign(outward, data);
      outward.rentRs = rentRs;
      outward.rentReason = rentReason;
      await outward.save();

      await logColdActivity({
        actionType: 'UPDATE',
        module: 'Report',
        recordId: outward._id.toString(),
        description: `Transaction updated from Report`,
        previousValue,
        newValue: JSON.parse(JSON.stringify(outward)),
        sessionFallback: session
      });
    }

    revalidatePath('/cold/transactions-report');
    revalidatePath('/cold/inward');
    revalidatePath('/cold/outward');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update transaction' };
  }
}
