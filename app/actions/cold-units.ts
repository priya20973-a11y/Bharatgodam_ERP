'use server';

import { revalidatePath } from 'next/cache';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { getTenantFilter } from '@/lib/ownership';
import connectToDatabase from '@/lib/mongoose';
import ColdUnit from '@/lib/models/ColdUnit';
import ColdCommodity from '@/lib/models/ColdCommodity';

export async function fetchColdUnits() {
  try {
    await connectToDatabase();
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return { success: false, error: 'Unauthorized' };
    }

    const units = await ColdUnit.find({}).sort({ createdAt: -1 }).lean();
    return { success: true, data: JSON.parse(JSON.stringify(units)) };
  } catch (error: any) {
    console.error('Error fetching units:', error);
    return { success: false, error: error.message };
  }
}

export async function fetchActiveColdUnits() {
  try {
    await connectToDatabase();
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return { success: false, error: 'Unauthorized' };
    }

    const units = await ColdUnit.find({ isActive: true }).sort({ createdAt: -1 }).lean();
    return { success: true, data: JSON.parse(JSON.stringify(units)) };
  } catch (error: any) {
    console.error('Error fetching active units:', error);
    return { success: false, error: error.message };
  }
}

export async function addColdUnit(data: any) {
  try {
    await connectToDatabase();
    const session = await getServerSession(authOptions);

    if (!session || !session.user || (session.user as any).role !== 'ADMIN') {
      return { success: false, error: 'Unauthorized. Admin access required.' };
    }

    // Check uniqueness
    const existing = await ColdUnit.findOne({
      $or: [
        { name: { $regex: new RegExp(`^${data.name}$`, 'i') } },
        { code: { $regex: new RegExp(`^${data.code}$`, 'i') } }
      ]
    });
    
    if (existing) {
      return { success: false, error: 'Unit with this name or code already exists.' };
    }

    const unit = new ColdUnit({
      ...data
    });

    await unit.save();
    revalidatePath('/cold/units');
    return { success: true, data: JSON.parse(JSON.stringify(unit)) };
  } catch (error: any) {
    console.error('Error adding unit:', error);
    return { success: false, error: error.message };
  }
}

export async function updateColdUnit(id: string, data: any) {
  try {
    await connectToDatabase();
    const session = await getServerSession(authOptions);

    if (!session || !session.user || (session.user as any).role !== 'ADMIN') {
      return { success: false, error: 'Unauthorized. Admin access required.' };
    }

    const existing = await ColdUnit.findOne({
      _id: { $ne: id },
      $or: [
        { name: { $regex: new RegExp(`^${data.name}$`, 'i') } },
        { code: { $regex: new RegExp(`^${data.code}$`, 'i') } }
      ]
    });
    
    if (existing) {
      return { success: false, error: 'Unit with this name or code already exists.' };
    }

    const updated = await ColdUnit.findOneAndUpdate(
      { _id: id },
      { $set: data },
      { new: true }
    );

    if (!updated) {
      return { success: false, error: 'Unit not found' };
    }

    revalidatePath('/cold/units');
    return { success: true, data: JSON.parse(JSON.stringify(updated)) };
  } catch (error: any) {
    console.error('Error updating unit:', error);
    return { success: false, error: error.message };
  }
}

export async function toggleColdUnitStatus(id: string, isActive: boolean) {
  try {
    await connectToDatabase();
    const session = await getServerSession(authOptions);

    if (!session || !session.user || (session.user as any).role !== 'ADMIN') {
      return { success: false, error: 'Unauthorized. Admin access required.' };
    }
    
    const updated = await ColdUnit.findOneAndUpdate(
      { _id: id },
      { $set: { isActive } },
      { new: true }
    );

    if (!updated) {
      return { success: false, error: 'Unit not found' };
    }

    revalidatePath('/cold/units');
    return { success: true, data: JSON.parse(JSON.stringify(updated)) };
  } catch (error: any) {
    console.error('Error toggling unit status:', error);
    return { success: false, error: error.message };
  }
}

export async function deleteColdUnit(id: string) {
  try {
    await connectToDatabase();
    const session = await getServerSession(authOptions);

    if (!session || !session.user || (session.user as any).role !== 'ADMIN') {
      return { success: false, error: 'Unauthorized. Admin access required.' };
    }
    
    const unit = await ColdUnit.findOne({ _id: id });
    if (!unit) {
      return { success: false, error: 'Unit not found' };
    }

    // Check if used in any commodity across all tenants
    const inUse = await ColdCommodity.findOne({ unit: unit.code });
    if (inUse) {
      return { success: false, error: 'Cannot delete unit as it is being used in one or more commodities. Please deactivate it instead.' };
    }

    await ColdUnit.deleteOne({ _id: id });
    revalidatePath('/cold/units');
    return { success: true };
  } catch (error: any) {
    console.error('Error deleting unit:', error);
    return { success: false, error: error.message };
  }
}
