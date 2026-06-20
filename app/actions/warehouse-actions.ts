'use server';

import connectToDatabase from '@/lib/mongoose';
import Warehouse from '@/lib/models/Warehouse';
import Inward from '@/lib/models/Inward';
import Outward from '@/lib/models/Outward';
import { revalidatePath } from 'next/cache';
import { appendOwnership, getTenantFilter, requireSession, isAdmin } from '@/lib/ownership';
import { getDb } from '@/lib/mongodb';
import mongoose from 'mongoose';

export async function getWarehouses(options?: { includeInactive?: boolean }) {
  await connectToDatabase();
  const session = await requireSession();
  const allowedStatuses = ['ACTIVE', 'FULL'];
  if (options?.includeInactive) {
    allowedStatuses.push('INACTIVE');
  }
  
  const warehouses = await Warehouse.find({ status: { $in: allowedStatuses }, ...getTenantFilter(session) }).sort({ name: 1 });
  
  const db = await getDb();
  const userIds = warehouses.map(w => w.userId).filter((id): id is any => !!id);
  const users = userIds.length > 0 ? await db.collection('users').find({ _id: { $in: userIds } }).project({ _id: 1, fullName: 1, email: 1, companyName: 1 }).toArray() : [];
  const userMap = new Map(users.map(u => [u._id.toString(), { fullName: u.fullName, email: u.email, companyName: u.companyName }]));
  
  return JSON.parse(JSON.stringify(warehouses.map(w => {
    const userId = w.userId?.toString();
    const userInfo = userId ? userMap.get(userId) : null;
    const wspName = userInfo?.companyName || userInfo?.fullName || userInfo?.email || (w.userId ? 'Unknown' : 'System');
    const addedBy = userInfo?.fullName || userInfo?.email || (w.userId ? 'Unknown' : 'System');
    
    return {
      ...w.toObject?.() || w,
      wspName,
      addedBy,
    };
  })));
}

export async function createWarehouse(data: {
  name: string;
  address: string;
  totalCapacity: number;
}) {
  await connectToDatabase();
  try {
    const session = await requireSession();
    const warehouse = await Warehouse.create(appendOwnership({
      ...data,
      occupiedCapacity: 0,
      status: 'ACTIVE',
    }, session));
    revalidatePath('/dashboard/warehouses');
    return { success: true, data: JSON.parse(JSON.stringify(warehouse)) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateWarehouse(id: string, data: Partial<{
  name: string;
  address: string;
  totalCapacity: number;
  status: string;
}>) {
  await connectToDatabase();
  try {
    const session = await requireSession();
    
    // Fetch warehouse first to check occupied capacity
    const warehouse = await Warehouse.findOne({ _id: id, ...getTenantFilter(session) });
    if (!warehouse) {
      throw new Error('Warehouse not found');
    }

    const nextTotalCapacity = data.totalCapacity !== undefined ? data.totalCapacity : warehouse.totalCapacity;
    const nextOccupiedCapacity = warehouse.occupiedCapacity;

    if (data.totalCapacity !== undefined && data.totalCapacity < nextOccupiedCapacity) {
      throw new Error('Warehouse capacity cannot be less than the currently occupied quantity.');
    }

    // Always auto-update status based on utilization rules, but preserve INACTIVE
    if (warehouse.status !== 'INACTIVE') {
      data.status = nextOccupiedCapacity >= nextTotalCapacity ? 'FULL' : 'ACTIVE';
    } else {
      data.status = 'INACTIVE';
    }

    const updatedWarehouse = await Warehouse.findOneAndUpdate(
      { _id: id, ...getTenantFilter(session) },
      data,
      { new: true }
    );
    revalidatePath('/dashboard/warehouses');
    return { success: true, data: JSON.parse(JSON.stringify(updatedWarehouse)) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function toggleWarehouseStatus(id: string) {
  await connectToDatabase();
  try {
    const session = await requireSession();
    
    const warehouse = await Warehouse.findOne({ _id: id, ...getTenantFilter(session) });
    if (!warehouse) {
      throw new Error('Warehouse not found');
    }

    let nextStatus: 'ACTIVE' | 'INACTIVE' | 'FULL';
    if (warehouse.status === 'INACTIVE') {
      nextStatus = warehouse.occupiedCapacity >= warehouse.totalCapacity ? 'FULL' : 'ACTIVE';
    } else {
      nextStatus = 'INACTIVE';
    }

    warehouse.status = nextStatus;
    await warehouse.save();

    revalidatePath('/dashboard/warehouses');
    return { success: true, data: JSON.parse(JSON.stringify(warehouse)) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteWarehouse(id: string) {
  await connectToDatabase();
  try {
    const session = await requireSession();

    if (!isAdmin(session)) {
      throw new Error('Only Admin users can delete warehouses.');
    }

    const warehouse = await Warehouse.findById(id);
    if (!warehouse) {
      throw new Error('Warehouse not found');
    }

    // Calculate remaining stock = Total Inward Quantity - Total Outward Quantity
    const inwardResult = await Inward.aggregate([
      { $match: { warehouseId: new mongoose.Types.ObjectId(id) } },
      { $group: { _id: null, total: { $sum: '$quantityMT' } } }
    ]);
    const outwardResult = await Outward.aggregate([
      { $match: { warehouseId: new mongoose.Types.ObjectId(id) } },
      { $group: { _id: null, total: { $sum: '$quantityMT' } } }
    ]);

    const totalInward = inwardResult[0]?.total || 0;
    const totalOutward = outwardResult[0]?.total || 0;
    const remainingStock = totalInward - totalOutward;

    if (remainingStock > 0) {
      throw new Error('Warehouse cannot be deleted because stock is still available in this warehouse.');
    }

    await Warehouse.findByIdAndDelete(id);
    revalidatePath('/dashboard/warehouses');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
