'use server';

import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { WspModuleId } from '@/lib/wsp-permissions';
import { revalidatePath } from 'next/cache';

export async function getDryStorageWsps() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== 'ADMIN' && (session.user as any).role !== 'SUPER_ADMIN') {
      throw new Error('Unauthorized');
    }

    const db = await getDb();
    
    // Fetch all WSP users who are not Cold Storage
    const wsps = await db.collection('users').find({
      role: 'WSP',
      storagePlan: { $ne: 'COLD' },
      status: { $ne: 'INACTIVE' } // Optionally filter out inactive users if desired
    }).project({
      _id: 1,
      companyName: 1,
      email: 1,
      wspPermissions: 1
    }).toArray();

    return {
      success: true,
      data: wsps.map(wsp => ({
        id: wsp._id.toString(),
        companyName: wsp.companyName || 'Unknown Company',
        email: wsp.email,
        wspPermissions: wsp.wspPermissions || {}
      }))
    };
  } catch (error: any) {
    console.error('Error fetching Dry Storage WSPs:', error);
    return { success: false, message: error.message };
  }
}

export async function updateWspPermission(wspId: string, moduleId: WspModuleId, value: boolean) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== 'ADMIN' && (session.user as any).role !== 'SUPER_ADMIN') {
      throw new Error('Unauthorized');
    }

    const db = await getDb();
    const updatePath = `wspPermissions.${moduleId}`;

    const result = await db.collection('users').updateOne(
      { _id: new ObjectId(wspId) },
      { $set: { [updatePath]: value } }
    );

    if (result.matchedCount === 0) {
      return { success: false, message: 'WSP not found' };
    }

    revalidatePath('/admin/wsp-permissions');
    
    return { success: true, message: 'Permission updated successfully' };
  } catch (error: any) {
    console.error('Error updating WSP permission:', error);
    return { success: false, message: error.message };
  }
}
