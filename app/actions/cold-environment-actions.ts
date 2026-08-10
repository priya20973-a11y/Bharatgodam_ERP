'use server';

import connectToDatabase from '@/lib/mongoose';
import ColdEnvironmentRecord from '@/lib/models/ColdEnvironmentRecord';
import ColdWarehouse from '@/lib/models/ColdWarehouse';
import { revalidatePath } from 'next/cache';
import { appendOwnership, getTenantFilter, requireSession, getWarehouseFilter } from '@/lib/ownership';
import { hasPermission } from '@/lib/permissions';

export async function createColdEnvironmentRecord(data: any) {
  await connectToDatabase();
  const session = await requireSession();

  if (!hasPermission(session, 'environmentRecords', 'create')) {
    throw new Error('403_FORBIDDEN: Unauthorized access to create environment records');
  }

  const record = await ColdEnvironmentRecord.create(appendOwnership(data, session));
  revalidatePath('/cold/environment-records');
  revalidatePath('/cold/dashboard');
  return JSON.parse(JSON.stringify(record));
}

export async function getColdEnvironmentRecords(filters: any = {}) {
  await connectToDatabase();
  const session = await requireSession();

  if (!hasPermission(session, 'environmentRecords', 'view')) {
    return [];
  }

  const query: any = { ...getTenantFilter(session), ...getWarehouseFilter(session, 'warehouseId') };

  if (filters.warehouseId) query.warehouseId = filters.warehouseId;
  if (filters.chamberName) query.chamberName = filters.chamberName;
  if (filters.floorNo) query.floorNo = filters.floorNo;

  if (filters.startDate || filters.endDate) {
    query.date = {};
    if (filters.startDate) query.date.$gte = new Date(filters.startDate);
    if (filters.endDate) {
      const endDate = new Date(filters.endDate);
      endDate.setHours(23, 59, 59, 999);
      query.date.$lte = endDate;
    }
  }

  const records = await ColdEnvironmentRecord.find(query)
    .populate('warehouseId', 'name')
    .sort({ date: -1, createdAt: -1 })
    .lean();

  return JSON.parse(JSON.stringify(records));
}

export async function getRecentColdEnvironmentRecords(limit: number = 5) {
  await connectToDatabase();
  const session = await requireSession();

  if (!hasPermission(session, 'environmentRecords', 'view')) {
    return [];
  }

  const query: any = { ...getTenantFilter(session), ...getWarehouseFilter(session, 'warehouseId') };

  const records = await ColdEnvironmentRecord.find(query)
    .populate('warehouseId', 'name')
    .sort({ date: -1, createdAt: -1 })
    .limit(limit)
    .lean();

  return JSON.parse(JSON.stringify(records));
}

export async function updateColdEnvironmentRecord(id: string, data: any) {
  await connectToDatabase();
  const session = await requireSession();

  if (!hasPermission(session, 'environmentRecords', 'edit')) {
    throw new Error('403_FORBIDDEN: Unauthorized access to edit environment records');
  }

  const query = { _id: id, ...getTenantFilter(session) };
  const record = await ColdEnvironmentRecord.findOneAndUpdate(query, data, { new: true });
  
  if (!record) throw new Error('Record not found or unauthorized');

  revalidatePath('/cold/environment-records');
  revalidatePath('/cold/dashboard');
  return JSON.parse(JSON.stringify(record));
}

export async function deleteColdEnvironmentRecord(id: string) {
  await connectToDatabase();
  const session = await requireSession();

  if (!hasPermission(session, 'environmentRecords', 'delete')) {
    throw new Error('403_FORBIDDEN: Unauthorized access to delete environment records');
  }

  const query = { _id: id, ...getTenantFilter(session) };
  const record = await ColdEnvironmentRecord.findOneAndDelete(query);
  
  if (!record) throw new Error('Record not found or unauthorized');

  revalidatePath('/cold/environment-records');
  revalidatePath('/cold/dashboard');
  return { success: true };
}
