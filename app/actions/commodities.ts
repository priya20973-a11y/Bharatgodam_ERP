'use server';

import connectToDatabase from '@/lib/mongoose';
import Commodity from '@/lib/models/Commodity';
import Client from '@/lib/models/Client';
import { revalidatePath } from 'next/cache';
import { appendOwnership, getTenantFilter, requireSession } from '@/lib/ownership';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { requireWspActionPermission } from '@/lib/server-wsp-permissions';

export async function fetchCommodities() {
  await connectToDatabase();
  const session = await requireSession();
  const items = await Commodity.find({ ...getTenantFilter(session) }).sort({ name: 1 });
  const db = await getDb();

  const uniqueUserIds = [...new Set(items.map(item => item.userId?.toString()).filter(Boolean))];
  const userIds = uniqueUserIds.map(id => new ObjectId(id as string));
  const users = userIds.length > 0 ? await db.collection('users').find({ _id: { $in: userIds } }).project({ _id: 1, fullName: 1, email: 1, companyName: 1 }).toArray() : [];
  const userMap = new Map(users.map(u => [u._id.toString(), { fullName: u.fullName, email: u.email, companyName: u.companyName }]));

  return JSON.parse(JSON.stringify(items.map(item => {
    const userId = item.userId?.toString();
    const userInfo = userId ? userMap.get(userId) : null;
    const wspName = userInfo?.fullName || userInfo?.companyName || userInfo?.email || (item.userId ? 'Unknown' : 'System');

    return {
      _id: item._id,
      name: item.name,
      ratePerMtPerDay: item.ratePerMtPerDay,
      updatedAt: item.updatedAt,
      createdAt: item.createdAt,
      userId: item.userId,
      userEmail: item.userEmail,
      wspName,
    };
  })));
}

export async function addCommodity(data: { name: string; ratePerMtPerDay: number }) {
  await requireWspActionPermission('commodityMaster');
  await connectToDatabase();
  try {
    const session = await requireSession();
    const nameVal = data.name.trim().toUpperCase();

    // Check if a commodity with the same name already exists for the current user/WSP
    const email = session.user.email?.trim().toLowerCase() || null;
    const ownerFilter: any = {
      $or: [
        { userId: session.user.id },
        ...(email
          ? [{ userEmail: { $regex: new RegExp(`^${email.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}$`, 'i') } }]
          : [])
      ]
    };

    const existingCommodity = await Commodity.findOne({
      ...ownerFilter,
      name: nameVal
    });

    if (existingCommodity) {
      return { success: false, error: 'Commodity name already exists for this WSP. Please use a different name.' };
    }

    const itemData = { ...data, name: nameVal };

    const item = await Commodity.create(appendOwnership(itemData, session));
    revalidatePath('/dashboard/commodities');
    return { success: true, data: JSON.parse(JSON.stringify(item)) };
  } catch (error: any) {
    if (error.code === 11000) {
      return { success: false, error: 'Commodity name already exists for this WSP. Please use a different name.' };
    }
    return { success: false, error: error.message };
  }
}

export async function updateCommodity(id: string, data: { name: string; ratePerMtPerDay: number }) {
  await requireWspActionPermission('commodityMaster');
  await connectToDatabase();
  try {
    const session = await requireSession();
    const nameVal = data.name.trim().toUpperCase();

    // Check if a commodity with the same name already exists for the current user/WSP, excluding this commodity
    const email = session.user.email?.trim().toLowerCase() || null;
    const ownerFilter: any = {
      $or: [
        { userId: session.user.id },
        ...(email
          ? [{ userEmail: { $regex: new RegExp(`^${email.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}$`, 'i') } }]
          : [])
      ]
    };

    const existingCommodity = await Commodity.findOne({
      _id: { $ne: id },
      ...ownerFilter,
      name: nameVal
    });

    if (existingCommodity) {
      return { success: false, error: 'Commodity name already exists for this WSP. Please use a different name.' };
    }

    const itemData = { ...data, name: nameVal };

    const item = await Commodity.findOneAndUpdate(
      { _id: id, ...ownerFilter },
      { $set: itemData },
      { new: true }
    );
    revalidatePath('/dashboard/commodities');
    return { success: true, data: JSON.parse(JSON.stringify(item)) };
  } catch (error: any) {
    if (error.code === 11000) {
      return { success: false, error: 'Commodity name already exists for this WSP. Please use a different name.' };
    }
    return { success: false, error: error.message };
  }
}

export async function deleteCommodity(id: string) {
  await requireWspActionPermission('commodityMaster');
  await connectToDatabase();
  try {
    const session = await requireSession();

    // Check if the commodity is referenced by any Client record
    const clientReferenced = await Client.findOne({ commodityIds: id });
    if (clientReferenced) {
      return {
        success: false,
        error: 'Commodity cannot be deleted because it is assigned to one or more clients.'
      };
    }

    await Commodity.findOneAndDelete({ _id: id, ...getTenantFilter(session) });
    revalidatePath('/dashboard/commodities');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
