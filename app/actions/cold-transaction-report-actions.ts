'use server';

import connectToDatabase from '@/lib/mongoose';
import ColdInward from '@/lib/models/ColdInward';
import ColdOutward from '@/lib/models/ColdOutward';
import { revalidatePath } from 'next/cache';
import { hasPermission } from '@/lib/permissions';
import { getTenantFilter, requireSession } from '@/lib/ownership';

export async function getColdTransactions() {
  await connectToDatabase();
  const session = await requireSession();
  const tenantFilter = getTenantFilter(session);
  
  const inwards = await ColdInward.find(tenantFilter)
    .populate('clientId', 'name')
    .populate('commodityId', 'name type')
    .populate('warehouseId', 'name warehouseId')
    .lean();

  const outwards = await ColdOutward.find(tenantFilter)
    .populate('clientId', 'name')
    .populate('commodityId', 'name type')
    .populate('warehouseId', 'name warehouseId')
    .lean();

  const combined = [
    ...inwards.map(i => ({ ...i, type: 'INWARD' })),
    ...outwards.map(o => ({ ...o, type: 'OUTWARD' }))
  ].map((t: any) => ({
    _id: t._id.toString(),
    type: t.type,
    date: t.date,
    client: { _id: t.clientId?._id?.toString(), name: t.clientId?.name },
    commodity: { _id: t.commodityId?._id?.toString(), name: t.commodityId?.name, type: t.commodityId?.type },
    warehouse: { _id: t.warehouseId?._id?.toString(), name: t.warehouseId?.name },
    chamberNo: t.chamberNo,
    floorNo: t.floorNo,
    stackNo: t.stackNo,
    quantityKg: t.quantityKg,
    bagsCount: t.bagsCount,
    referencePersons: t.referencePersons,
    createdAt: t.createdAt
  }));

  // Sort by date DESC, then createdAt DESC
  combined.sort((a, b) => {
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    if (dateB !== dateA) return dateB - dateA;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return JSON.parse(JSON.stringify(combined));
}

export async function deleteColdTransaction(id: string, type: 'INWARD' | 'OUTWARD') {
  await connectToDatabase();
  const session = await requireSession();
    if (!hasPermission(session, 'reports', 'delete')) throw new Error('Forbidden: Insufficient permissions');
  const tenantFilter = getTenantFilter(session);

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
        chamberNo: inward.chamberNo,
        floorNo: inward.floorNo,
        stackNo: inward.stackNo,
        ...tenantFilter
      });

      if (outwardExists) {
        return { success: false, error: 'Cannot edit/delete. Outward transaction exists.' };
      }

      await ColdInward.deleteOne({ _id: id });
    } else {
      const outward = await ColdOutward.findOne({ _id: id, ...tenantFilter });
      if (!outward) throw new Error('Transaction not found');
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
  const tenantFilter = getTenantFilter(session);

  let transaction;
  if (type === 'INWARD') {
    const inward = await ColdInward.findOne({ _id: id, ...tenantFilter }).lean();
    if (!inward) throw new Error('Inward transaction not found');
    
    // Check if any outward exists for this inward stack
    const outwardExists = await ColdOutward.exists({
      clientId: inward.clientId,
      commodityId: inward.commodityId,
      warehouseId: inward.warehouseId,
      chamberNo: inward.chamberNo,
      floorNo: inward.floorNo,
      stackNo: inward.stackNo,
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
  const tenantFilter = getTenantFilter(session);

  try {
    if (type === 'INWARD') {
      const inward = await ColdInward.findOne({ _id: id, ...tenantFilter });
      if (!inward) throw new Error('Transaction not found');
      
      const outwardExists = await ColdOutward.exists({
        clientId: inward.clientId,
        commodityId: inward.commodityId,
        warehouseId: inward.warehouseId,
        chamberNo: inward.chamberNo,
        floorNo: inward.floorNo,
        stackNo: inward.stackNo,
        ...tenantFilter
      });

      if (outwardExists) {
        return { success: false, error: 'Cannot edit Inward. Related Outward transaction exists.' };
      }

      // Update inward fields
      Object.assign(inward, data);
      await inward.save();
    } else {
      const outward = await ColdOutward.findOne({ _id: id, ...tenantFilter });
      if (!outward) throw new Error('Transaction not found');

      // Fetch the related inward based on inwardId or the matching stack details
      let inward;
      if (outward.inwardId) {
        inward = await ColdInward.findOne({ _id: outward.inwardId, ...tenantFilter });
      } else {
        inward = await ColdInward.findOne({
          clientId: outward.clientId,
          commodityId: outward.commodityId,
          warehouseId: outward.warehouseId,
          chamberNo: outward.chamberNo,
          floorNo: outward.floorNo,
          stackNo: outward.stackNo,
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
        chamberNo: inward.chamberNo,
        floorNo: inward.floorNo,
        stackNo: inward.stackNo,
        _id: { $ne: outward._id },
        ...tenantFilter
      });

      const totalOtherOutwardQty = otherOutwards.reduce((sum, o) => sum + o.quantityKg, 0);
      const totalOtherPlusMinus = otherOutwards.reduce((sum, o) => sum + (o.plusMinus || 0), 0);
      const availableQtyForThisEdit = inward.quantityKg + totalOtherPlusMinus + (Number(data.plusMinus) || 0) - totalOtherOutwardQty;

      if (data.quantityKg > availableQtyForThisEdit) {
        return { success: false, error: `Quantity exceeds available balance (${availableQtyForThisEdit} Kg).` };
      }

      Object.assign(outward, data);
      await outward.save();
    }

    revalidatePath('/cold/transactions-report');
    revalidatePath('/cold/inward');
    revalidatePath('/cold/outward');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update transaction' };
  }
}
