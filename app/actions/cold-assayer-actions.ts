'use server';

import mongoose from 'mongoose';
import connectToDatabase from '@/lib/mongoose';
import ColdAssayer from '@/lib/models/ColdAssayer';
import { requireSession, getTenantFilterForMongo, appendOwnershipForMongo } from '@/lib/ownership';
import { hasPermission } from '@/lib/permissions';
import { logColdActivity } from '@/lib/cold-logger';
import { revalidatePath } from 'next/cache';

export async function getColdAssayers() {
  await connectToDatabase();
  const session = await requireSession();
  
  const assayers = await ColdAssayer.find(getTenantFilterForMongo(session))
    .sort({ name: 1 })
    .lean();
    
  return JSON.parse(JSON.stringify(assayers));
}

export async function createColdAssayer(data: {
  name: string;
  licenceNumber: string;
  status: 'Active' | 'Expired';
}) {
  await connectToDatabase();
  const session = await requireSession();
  if (!hasPermission(session, 'assayerMaster', 'create')) {
    throw new Error('Forbidden: Insufficient permissions');
  }

  try {
    const trimmedLicence = data.licenceNumber.trim();
    const existing = await ColdAssayer.findOne({ 
      licenceNumber: trimmedLicence, 
      ...getTenantFilterForMongo(session) 
    });

    if (existing) {
      return { success: false, error: 'An Assayer with this Licence Number already exists.' };
    }

    const payload = appendOwnershipForMongo({
      ...data,
      name: data.name.trim(),
      licenceNumber: trimmedLicence
    }, session);
    const assayer = await ColdAssayer.create(payload);

    await logColdActivity({
      actionType: 'CREATE',
      module: 'Assayer Master',
      recordId: assayer._id.toString(),
      description: `Added Cold Storage Assayer ${assayer.name}`,
      newValue: JSON.parse(JSON.stringify(assayer)),
      sessionFallback: session
    });

    revalidatePath('/cold/assayer');
    revalidatePath('/cold/inward');
    revalidatePath('/cold/assaying');
    return { success: true, data: JSON.parse(JSON.stringify(assayer)) };
  } catch (error: any) {
    if (error.code === 11000) {
      return { success: false, error: 'An Assayer with this Licence Number already exists.' };
    }
    return { success: false, error: error.message };
  }
}

export async function updateColdAssayer(id: string, data: {
  name: string;
  licenceNumber: string;
  status: 'Active' | 'Expired';
}) {
  await connectToDatabase();
  const session = await requireSession();
  if (!hasPermission(session, 'assayerMaster', 'edit')) {
    throw new Error('Forbidden: Insufficient permissions');
  }

  try {
    const trimmedLicence = data.licenceNumber.trim();
    const existing = await ColdAssayer.findOne({ 
      licenceNumber: trimmedLicence, 
      _id: { $ne: new mongoose.Types.ObjectId(id) },
      ...getTenantFilterForMongo(session) 
    });

    if (existing) {
      return { success: false, error: 'Another Assayer with this Licence Number already exists.' };
    }

    const oldAssayer = await ColdAssayer.findById(id).lean();
    const previousValue = JSON.parse(JSON.stringify(oldAssayer));

    const assayer = await ColdAssayer.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(id), ...getTenantFilterForMongo(session) },
      { 
        $set: {
          name: data.name.trim(),
          licenceNumber: trimmedLicence,
          status: data.status
        } 
      },
      { new: true }
    );

    if (assayer) {
      await logColdActivity({
        actionType: 'UPDATE',
        module: 'Assayer Master',
        recordId: assayer._id.toString(),
        description: `Updated Cold Storage Assayer ${assayer.name}`,
        previousValue,
        newValue: JSON.parse(JSON.stringify(assayer)),
        sessionFallback: session
      });
    }

    revalidatePath('/cold/assayer');
    revalidatePath('/cold/inward');
    revalidatePath('/cold/assaying');
    return { success: true, data: JSON.parse(JSON.stringify(assayer)) };
  } catch (error: any) {
    if (error.code === 11000) {
      return { success: false, error: 'Another Assayer with this Licence Number already exists.' };
    }
    return { success: false, error: error.message };
  }
}

export async function deleteColdAssayer(id: string) {
  await connectToDatabase();
  const session = await requireSession();
  if (!hasPermission(session, 'assayerMaster', 'delete')) {
    throw new Error('Forbidden: Insufficient permissions');
  }

  try {
    const assayer = await ColdAssayer.findOne({ 
      _id: new mongoose.Types.ObjectId(id), 
      ...getTenantFilterForMongo(session) 
    });
    
    if (!assayer) throw new Error('Assayer not found');

    const previousValue = JSON.parse(JSON.stringify(assayer));
    await assayer.deleteOne();

    await logColdActivity({
      actionType: 'DELETE',
      module: 'Assayer Master',
      recordId: id,
      description: `Deleted Cold Storage Assayer ${assayer.name}`,
      previousValue,
      sessionFallback: session
    });

    revalidatePath('/cold/assayer');
    revalidatePath('/cold/inward');
    revalidatePath('/cold/assaying');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
