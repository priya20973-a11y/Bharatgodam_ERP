'use server';

import mongoose from 'mongoose';
import connectToDatabase from '@/lib/mongoose';
import Assayer from '@/lib/models/Assayer';
import { requireSession, getTenantFilterForMongo, appendOwnershipForMongo } from '@/lib/ownership';
import { logActivity } from '@/lib/cold-logger';
import { revalidatePath } from 'next/cache';

export async function getAssayers() {
  await connectToDatabase();
  const session = await requireSession();
  
  const assayers = await Assayer.find(getTenantFilterForMongo(session))
    .sort({ name: 1 })
    .lean();
    
  return JSON.parse(JSON.stringify(assayers));
}

export async function createAssayer(data: {
  name: string;
  licenceNumber: string;
  status: 'Active' | 'Expired';
}) {
  await connectToDatabase();
  const session = await requireSession();

  try {
    const existing = await Assayer.findOne({ 
      licenceNumber: data.licenceNumber, 
      ...getTenantFilterForMongo(session) 
    });

    if (existing) {
      return { success: false, error: 'An Assayer with this Licence Number already exists.' };
    }

    const payload = appendOwnershipForMongo(data, session);
    const assayer = await Assayer.create(payload);

    await logActivity({
      actionType: 'CREATE',
      module: 'Assayer Master',
      recordId: assayer._id.toString(),
      description: `Added Assayer ${assayer.name}`,
      newValue: JSON.parse(JSON.stringify(assayer)),
      storageType: 'Dry Storage',
      sessionFallback: session
    });

    revalidatePath('/dashboard/assayer');
    return { success: true, data: JSON.parse(JSON.stringify(assayer)) };
  } catch (error: any) {
    if (error.code === 11000) {
      return { success: false, error: 'An Assayer with this Licence Number already exists.' };
    }
    return { success: false, error: error.message };
  }
}

export async function updateAssayer(id: string, data: {
  name: string;
  licenceNumber: string;
  status: 'Active' | 'Expired';
}) {
  await connectToDatabase();
  const session = await requireSession();

  try {
    const existing = await Assayer.findOne({ 
      licenceNumber: data.licenceNumber, 
      _id: { $ne: new mongoose.Types.ObjectId(id) },
      ...getTenantFilterForMongo(session) 
    });

    if (existing) {
      return { success: false, error: 'Another Assayer with this Licence Number already exists.' };
    }

    const oldAssayer = await Assayer.findById(id).lean();
    const previousValue = JSON.parse(JSON.stringify(oldAssayer));

    const assayer = await Assayer.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(id), ...getTenantFilterForMongo(session) },
      { $set: data },
      { new: true }
    );

    if (assayer) {
      await logActivity({
        actionType: 'UPDATE',
        module: 'Assayer Master',
        recordId: assayer._id.toString(),
        description: `Updated Assayer ${assayer.name}`,
        previousValue,
        newValue: JSON.parse(JSON.stringify(assayer)),
        storageType: 'Dry Storage',
        sessionFallback: session
      });
    }

    revalidatePath('/dashboard/assayer');
    return { success: true, data: JSON.parse(JSON.stringify(assayer)) };
  } catch (error: any) {
    if (error.code === 11000) {
      return { success: false, error: 'Another Assayer with this Licence Number already exists.' };
    }
    return { success: false, error: error.message };
  }
}

export async function deleteAssayer(id: string) {
  await connectToDatabase();
  const session = await requireSession();

  try {
    const assayer = await Assayer.findOne({ 
      _id: new mongoose.Types.ObjectId(id), 
      ...getTenantFilterForMongo(session) 
    });
    
    if (!assayer) throw new Error('Assayer not found');

    const previousValue = JSON.parse(JSON.stringify(assayer));
    await assayer.deleteOne();

    await logActivity({
      actionType: 'DELETE',
      module: 'Assayer Master',
      recordId: id,
      description: `Deleted Assayer ${assayer.name}`,
      previousValue,
      storageType: 'Dry Storage',
      sessionFallback: session
    });

    revalidatePath('/dashboard/assayer');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
