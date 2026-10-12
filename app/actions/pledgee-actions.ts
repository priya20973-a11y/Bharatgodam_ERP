'use server';

import connectToDatabase from '@/lib/mongoose';
import Pledgee from '@/lib/models/Pledgee';
import { revalidatePath } from 'next/cache';
import { appendOwnership, getTenantFilter, requireSession } from '@/lib/ownership';
import { requireWspActionPermission } from '@/lib/server-wsp-permissions';
import { logActivity } from '@/lib/cold-logger';

export async function getPledgees() {
  await connectToDatabase();
  const session = await requireSession();
  const pledgees = await Pledgee.find({ ...getTenantFilter(session) }).sort({ name: 1 }).lean();
  return JSON.parse(JSON.stringify(pledgees));
}

export async function createPledgee(data: {
  name: string;
  type: 'NBFC' | 'Bank' | 'Other';
  iifcCode?: string;
  address?: string;
  personName?: string;
  mobile?: string;
}) {
  await requireWspActionPermission('outward'); // Or a specific master permission
  await connectToDatabase();
  try {
    const session = await requireSession();
    const existing = await Pledgee.findOne({
       ...getTenantFilter(session),
       name: { $regex: new RegExp(`^${data.name.trim().replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}$`, 'i') }
    });

    if (existing) {
      return { success: false, error: 'Pledgee name already exists for your account.' };
    }

    if (data.type === 'Bank' && (!data.iifcCode || !data.iifcCode.trim())) {
      return { success: false, error: 'IIFC Code is required when Type is Bank.' };
    }

    const pledgee = await Pledgee.create(appendOwnership({ ...data, name: data.name.trim() }, session));

    await logActivity({
      actionType: 'CREATE',
      module: 'Pledgee Master',
      recordId: pledgee._id.toString(),
      description: `Added new pledgee: ${pledgee.name}`,
      newValue: JSON.parse(JSON.stringify(pledgee)),
      storageType: 'Dry Storage',
      sessionFallback: session
    });

    revalidatePath('/dashboard/pledgees');
    return { success: true, data: JSON.parse(JSON.stringify(pledgee)) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updatePledgee(id: string, data: Partial<{
  name: string;
  type: 'NBFC' | 'Bank' | 'Other';
  iifcCode?: string;
  address?: string;
  personName?: string;
  mobile?: string;
}>) {
  await requireWspActionPermission('outward');
  await connectToDatabase();
  try {
    const session = await requireSession();
    if (data.name) {
      const existing = await Pledgee.findOne({
        _id: { $ne: id },
        ...getTenantFilter(session),
        name: { $regex: new RegExp(`^${data.name.trim().replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}$`, 'i') }
      });
      if (existing) {
        return { success: false, error: 'Pledgee name already exists for your account.' };
      }
      data.name = data.name.trim();
    }

    if (data.type === 'Bank' && (!data.iifcCode || !data.iifcCode.trim())) {
      return { success: false, error: 'IIFC Code is required when Type is Bank.' };
    }

    const updatePayload: any = { $set: { ...data } };
    if (data.type && data.type !== 'Bank') {
       updatePayload.$unset = { iifcCode: 1 };
       delete updatePayload.$set.iifcCode;
    }

    const oldPledgee = await Pledgee.findOne({ _id: id, ...getTenantFilter(session) });
    const previousValue = oldPledgee ? JSON.parse(JSON.stringify(oldPledgee)) : null;

    const pledgee = await Pledgee.findOneAndUpdate(
      { _id: id, ...getTenantFilter(session) },
      updatePayload,
      { new: true }
    );

    if (pledgee) {
      await logActivity({
        actionType: 'UPDATE',
        module: 'Pledgee Master',
        recordId: pledgee._id.toString(),
        description: `Updated pledgee: ${pledgee.name}`,
        previousValue,
        newValue: JSON.parse(JSON.stringify(pledgee)),
        storageType: 'Dry Storage',
        sessionFallback: session
      });
    }

    revalidatePath('/dashboard/pledgees');
    return { success: true, data: JSON.parse(JSON.stringify(pledgee)) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
