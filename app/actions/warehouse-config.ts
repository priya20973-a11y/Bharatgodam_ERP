'use server';

import { getDb } from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { WarehouseConfigSchema, WarehouseConfigValues } from '@/lib/schemas/warehouse';
import { revalidatePath } from 'next/cache';

// 2. Server Action to Update Config safely
export async function updateWarehouseConfig(data: WarehouseConfigValues) {
  try {
    // A. Strict Role-Based Access Control (RBAC)
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== 'ADMIN') {
      return { success: false, message: 'Forbidden: Admin access required.' };
    }

    // B. Validation
    const validation = WarehouseConfigSchema.safeParse(data);
    if (!validation.success) {
      return { success: false, message: 'Invalid data format.' };
    }

    const db = await getDb();
    const adminId = (session.user as any).id;

    // C. Security Audit Trail (Capture previous state before overwriting)
    const previousConfig = await db.collection('warehouse_config').findOne({});
    if (previousConfig) {
      await db.collection('audit_logs').insertOne({
        action: 'UPDATE_WAREHOUSE_RATES',
        performedBy: adminId,
        userEmail: session.user.email,
        timestamp: new Date(),
        previousState: previousConfig.commodities,
        newState: validation.data.commodities,
      });
    }

    // D. Update "Master Data" using Upsert (Create if doesn't exist)
    await db.collection('warehouse_config').findOneAndUpdate(
      {}, // Usually an ID, but empty `{}` works if there is only 1 Master Config
      { $set: { ...validation.data, lastUpdatedBy: adminId, updatedAt: new Date() } },
      { upsert: true } // Creates the document if it's the very first time running
    );

    // E. Bust Next.js cache so the UI updates instantly
    revalidatePath('/dashboard/settings/warehouse');
    return { success: true, message: 'Warehouse configuration updated securely.' };

  } catch (error) {
    console.error('Config update failed:', error);
    return { success: false, message: 'Server error during update.' };
  }
}
