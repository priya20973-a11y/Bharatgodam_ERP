'use server';

import connectToDatabase from '@/lib/mongoose';
import Commodity from '@/lib/models/Commodity';
import { revalidatePath } from 'next/cache';
import { appendOwnership, getTenantFilter, requireSession } from '@/lib/ownership';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function fetchCommodities() {
  await connectToDatabase();
  const session = await requireSession();
  const items = await Commodity.find({ ...getTenantFilter(session) }).sort({ name: 1 });
  const db = await getDb();
  
  const userIds = items.map(item => item.userId).filter((id): id is any => !!id);
  const users = userIds.length > 0 ? await db.collection('users').find({ _id: { $in: userIds } }).project({ _id: 1, fullName: 1, email: 1 }).toArray() : [];
  const userMap = new Map(users.map(u => [u._id.toString(), { fullName: u.fullName, email: u.email }]));
  
  return JSON.parse(JSON.stringify(items.map(item => {
    const userId = item.userId?.toString();
    const userInfo = userId ? userMap.get(userId) : null;
    const addedBy = userInfo?.fullName || userInfo?.email || (item.userId ? 'Unknown' : 'System');
    
    return {
      _id: item._id,
      name: item.name,
      ratePerMtPerDay: item.ratePerMtPerDay,
      updatedAt: item.updatedAt,
      createdAt: item.createdAt,
      userId: item.userId,
      userEmail: item.userEmail,
      addedBy,
    };
  })));
}

export async function addCommodity(data: { name: string; ratePerMtPerDay: number }) {
  await connectToDatabase();
  try {
    const session = await requireSession();
    const item = await Commodity.create(appendOwnership(data, session));
    revalidatePath('/dashboard/commodities');
    return { success: true, data: JSON.parse(JSON.stringify(item)) };
  } catch (error: any) {
    if (error.code === 11000) {
      return { success: false, error: 'Commodity name must be unique' };
    }
    return { success: false, error: error.message };
  }
}

export async function updateCommodity(id: string, data: { name: string; ratePerMtPerDay: number }) {
  await connectToDatabase();
  try {
    const session = await requireSession();
    const item = await Commodity.findOneAndUpdate({ _id: id, ...getTenantFilter(session) }, data, { new: true });
    revalidatePath('/dashboard/commodities');
    return { success: true, data: JSON.parse(JSON.stringify(item)) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteCommodity(id: string) {
  await connectToDatabase();
  try {
    const session = await requireSession();
    await Commodity.findOneAndDelete({ _id: id, ...getTenantFilter(session) });
    revalidatePath('/dashboard/commodities');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
