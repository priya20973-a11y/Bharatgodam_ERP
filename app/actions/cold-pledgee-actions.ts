'use server';

import connectToDatabase from '@/lib/mongoose';
import ColdPledgee from '@/lib/models/ColdPledgee';
import { revalidatePath } from 'next/cache';
import { appendOwnership, getTenantFilter, requireSession } from '@/lib/ownership';
import { hasPermission } from '@/lib/permissions';
import { logColdActivity } from '@/lib/cold-logger';
import mongoose from 'mongoose';

export async function getColdPledgees() {
  await connectToDatabase();
  const session = await requireSession();
  const pledgees = await ColdPledgee.find({ ...getTenantFilter(session) }).sort({ name: 1 }).lean();
  return JSON.parse(JSON.stringify(pledgees));
}

export async function createColdPledgee(data: {
  name: string;
  type: 'NBFC' | 'Bank' | 'Other';
  iifcCode?: string;
  address?: string;
  personName?: string;
  mobile?: string;
}) {
  await connectToDatabase();
  try {
    const session = await requireSession();
    if (!hasPermission(session, 'pledgeeMaster', 'create')) {
      throw new Error('Forbidden: Insufficient permissions');
    }

    const trimmedName = data.name.trim();
    const existing = await ColdPledgee.findOne({
      ...getTenantFilter(session),
      name: { $regex: new RegExp(`^${trimmedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    });

    if (existing) {
      return { success: false, error: 'Pledgee name already exists for your account.' };
    }

    if (data.type === 'Bank' && (!data.iifcCode || !data.iifcCode.trim())) {
      return { success: false, error: 'IIFC Code is required when Type is Bank.' };
    }

    const payload = appendOwnership({ ...data, name: trimmedName }, session);
    const pledgee = await ColdPledgee.create(payload);

    await logColdActivity({
      actionType: 'CREATE',
      module: 'Pledgee Master',
      recordId: pledgee._id.toString(),
      description: `Added new Cold Storage pledgee: ${pledgee.name}`,
      newValue: JSON.parse(JSON.stringify(pledgee)),
      sessionFallback: session
    });

    revalidatePath('/cold/pledgees');
    revalidatePath('/cold/pledges');
    return { success: true, data: JSON.parse(JSON.stringify(pledgee)) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateColdPledgee(id: string, data: Partial<{
  name: string;
  type: 'NBFC' | 'Bank' | 'Other';
  iifcCode?: string;
  address?: string;
  personName?: string;
  mobile?: string;
}>) {
  await connectToDatabase();
  try {
    const session = await requireSession();
    if (!hasPermission(session, 'pledgeeMaster', 'edit')) {
      throw new Error('Forbidden: Insufficient permissions');
    }

    if (data.name) {
      const trimmedName = data.name.trim();
      const existing = await ColdPledgee.findOne({
        _id: { $ne: new mongoose.Types.ObjectId(id) },
        ...getTenantFilter(session),
        name: { $regex: new RegExp(`^${trimmedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
      });
      if (existing) {
        return { success: false, error: 'Pledgee name already exists for your account.' };
      }
      data.name = trimmedName;
    }

    if (data.type === 'Bank' && (!data.iifcCode || !data.iifcCode.trim())) {
      return { success: false, error: 'IIFC Code is required when Type is Bank.' };
    }

    const updatePayload: any = { $set: { ...data } };
    if (data.type && data.type !== 'Bank') {
      updatePayload.$unset = { iifcCode: 1 };
      delete updatePayload.$set.iifcCode;
    }

    const oldPledgee = await ColdPledgee.findOne({ _id: id, ...getTenantFilter(session) }).lean();
    const previousValue = oldPledgee ? JSON.parse(JSON.stringify(oldPledgee)) : null;

    const pledgee = await ColdPledgee.findOneAndUpdate(
      { _id: id, ...getTenantFilter(session) },
      updatePayload,
      { new: true }
    );

    if (pledgee) {
      await logColdActivity({
        actionType: 'UPDATE',
        module: 'Pledgee Master',
        recordId: pledgee._id.toString(),
        description: `Updated Cold Storage pledgee: ${pledgee.name}`,
        previousValue,
        newValue: JSON.parse(JSON.stringify(pledgee)),
        sessionFallback: session
      });
    }

    revalidatePath('/cold/pledgees');
    revalidatePath('/cold/pledges');
    return { success: true, data: JSON.parse(JSON.stringify(pledgee)) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteColdPledgee(id: string) {
  await connectToDatabase();
  try {
    const session = await requireSession();
    if (!hasPermission(session, 'pledgeeMaster', 'delete')) {
      throw new Error('Forbidden: Insufficient permissions');
    }

    const pledgee = await ColdPledgee.findOne({
      _id: id,
      ...getTenantFilter(session)
    });

    if (!pledgee) {
      return { success: false, error: 'Pledgee not found' };
    }

    const previousValue = JSON.parse(JSON.stringify(pledgee));
    await pledgee.deleteOne();

    await logColdActivity({
      actionType: 'DELETE',
      module: 'Pledgee Master',
      recordId: id,
      description: `Deleted Cold Storage pledgee: ${pledgee.name}`,
      previousValue,
      sessionFallback: session
    });

    revalidatePath('/cold/pledgees');
    revalidatePath('/cold/pledges');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
