'use server';

import connectToDatabase from '@/lib/mongoose';
import Warehouse from '@/lib/models/Warehouse';
import { revalidatePath } from 'next/cache';
import { appendOwnership, getTenantFilter, requireSession } from '@/lib/ownership';
import { getDb } from '@/lib/mongodb';

export async function getWarehouses() {
  await connectToDatabase();
  const session = await requireSession();
  const warehouses = await Warehouse.find({ status: 'ACTIVE', ...getTenantFilter(session) }).sort({ name: 1 });
  
  const db = await getDb();
  const userIds = warehouses.map(w => w.userId).filter((id): id is any => !!id);
  const users = userIds.length > 0 ? await db.collection('users').find({ _id: { $in: userIds } }).project({ _id: 1, fullName: 1, email: 1 }).toArray() : [];
  const userMap = new Map(users.map(u => [u._id.toString(), { fullName: u.fullName, email: u.email }]));
  
  return JSON.parse(JSON.stringify(warehouses.map(w => {
    const userId = w.userId?.toString();
    const userInfo = userId ? userMap.get(userId) : null;
    const addedBy = userInfo?.fullName || userInfo?.email || (w.userId ? 'Unknown' : 'System');
    
    return {
      ...w.toObject?.() || w,
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
    const warehouse = await Warehouse.findOneAndUpdate(
      { _id: id, ...getTenantFilter(session) },
      data,
      { new: true }
    );
    revalidatePath('/dashboard/warehouses');
    return { success: true, data: JSON.parse(JSON.stringify(warehouse)) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
