'use server';

import connectToDatabase from '@/lib/mongoose';
import Warehouse from '@/lib/models/Warehouse';
import Inward from '@/lib/models/Inward';
import Outward from '@/lib/models/Outward';
import { revalidatePath } from 'next/cache';
import { appendOwnership, getTenantFilter, requireSession, isAdmin } from '@/lib/ownership';
import { getDb } from '@/lib/mongodb';
import mongoose from 'mongoose';
import { requireWspActionPermission } from '@/lib/server-wsp-permissions';
import { logActivity } from '@/lib/cold-logger';

export async function getWarehouses(options?: { includeInactive?: boolean }) {
  await connectToDatabase();
  const session = await requireSession();
  const allowedStatuses = ['ACTIVE', 'FULL'];
  if (options?.includeInactive) {
    allowedStatuses.push('INACTIVE');
  }
  
  const warehouses = await Warehouse.find({ status: { $in: allowedStatuses }, ...getTenantFilter(session) }).sort({ name: 1 }).lean();
  
  const db = await getDb();
  const uniqueUserIds = [...new Set(warehouses.map(w => w.userId?.toString()).filter(Boolean))];
  const userIds = uniqueUserIds.map(id => new mongoose.Types.ObjectId(id as string));
  const users = userIds.length > 0 ? await db.collection('users').find({ _id: { $in: userIds } }).project({ _id: 1, fullName: 1, email: 1, companyName: 1 }).toArray() : [];
  const userMap = new Map(users.map(u => [u._id.toString(), { fullName: u.fullName, email: u.email, companyName: u.companyName }]));
  
  const nameCounts = new Map<string, number>();
  warehouses.forEach(w => {
    const n = w.name?.toLowerCase() || '';
    nameCounts.set(n, (nameCounts.get(n) || 0) + 1);
  });
  
  return JSON.parse(JSON.stringify(warehouses.map(w => {
    const userId = w.userId?.toString();
    const userInfo = userId ? userMap.get(userId) : null;
    const wspName = userInfo?.companyName || userInfo?.fullName || userInfo?.email || (w.userId ? 'Unknown' : 'System');
    const addedBy = userInfo?.fullName || userInfo?.email || (w.userId ? 'Unknown' : 'System');
    
    let displayName = w.name;
    if (isAdmin(session)) {
      const isDuplicate = (nameCounts.get(w.name?.toLowerCase() || '') || 0) > 1;
      if (isDuplicate) {
        displayName = `${w.name} (${wspName})`;
      }
    }

    const whType = (w.warehouseType || 'Owner') as 'Rented' | 'Owner';
    const oe = whType === 'Rented' 
      ? 0 
      : (w.ownerEarnings !== undefined 
          ? Number(w.ownerEarnings) 
          : (w.ownerEquity !== undefined ? Number(w.ownerEquity) : 60));
    const pc = whType === 'Rented' 
      ? 100 
      : (w.platformCommission !== undefined 
          ? Number(w.platformCommission) 
          : (100 - oe));

    return {
      ...w.toObject?.() || w,
      rawName: w.name,
      name: displayName,
      warehouseType: whType,
      platformCommission: pc,
      ownerEarnings: oe,
      ownerEquity: oe,
      wspName,
      addedBy,
    };
  })));
}

export async function createWarehouse(data: {
  warehouseId?: string;
  name: string;
  address: string;
  totalCapacity: number;
  warehouseType?: 'Rented' | 'Owner';
  platformCommission?: number;
  ownerEarnings?: number;
  insurances?: any[];
}) {
  await requireWspActionPermission('warehouseMaster');
  await connectToDatabase();
  try {
    const session = await requireSession();
    
    const warehouseType = data.warehouseType || 'Owner';
    let platformCommission = data.platformCommission !== undefined ? Number(data.platformCommission) : 40;
    let ownerEarnings = data.ownerEarnings !== undefined ? Number(data.ownerEarnings) : 60;

    if (warehouseType === 'Rented') {
      platformCommission = 100;
      ownerEarnings = 0;
    } else {
      if (isNaN(platformCommission) || isNaN(ownerEarnings) || platformCommission < 0 || platformCommission > 100 || ownerEarnings < 0 || ownerEarnings > 100) {
        return { success: false, error: 'Platform Commission and Owner Earnings must be numbers between 0 and 100.' };
      }
      const total = Number((platformCommission + ownerEarnings).toFixed(2));
      if (total !== 100) {
        return { success: false, error: `Platform Commission (${platformCommission}%) and Owner Earnings (${ownerEarnings}%) must equal exactly 100%. Current total: ${total}%.` };
      }
    }

    const email = session.user.email?.trim().toLowerCase() || null;
    const ownerFilter: any = {
      $or: [
        { userId: session.user.id },
        ...(email ? [{ userEmail: { $regex: new RegExp(`^${email.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}$`, 'i') } }] : [])
      ]
    };
    
    const existingWarehouse = await Warehouse.findOne({
      ...ownerFilter,
      name: data.name
    });
    
    if (existingWarehouse) {
      return { success: false, error: 'Warehouse name already exists for this WSP. Please use a different name.' };
    }

    const warehouse = await Warehouse.create(appendOwnership({
      ...data,
      warehouseType,
      platformCommission,
      ownerEarnings,
      ownerEquity: ownerEarnings,
      occupiedCapacity: 0,
      status: 'ACTIVE',
    }, session));
    
    // Direct MongoDB persistence to guarantee all fields bypass any Mongoose cache
    const db = await getDb();
    await db.collection('warehouses').updateOne(
      { _id: warehouse._id },
      {
        $set: {
          warehouseType,
          platformCommission,
          ownerEarnings,
          ownerEquity: ownerEarnings,
        }
      }
    );

    await logActivity({
      actionType: 'CREATE',
      module: 'Warehouse Master',
      recordId: warehouse._id.toString(),
      description: `Created warehouse: ${warehouse.name}`,
      newValue: warehouse,
      storageType: 'Dry Storage',
      sessionFallback: session
    });

    revalidatePath('/dashboard/warehouses');
    revalidatePath('/dashboard/revenue');
    return { success: true, data: JSON.parse(JSON.stringify(warehouse)) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateWarehouse(id: string, data: Partial<{
  warehouseId: string;
  name: string;
  address: string;
  totalCapacity: number;
  warehouseType: 'Rented' | 'Owner';
  platformCommission: number;
  ownerEarnings: number;
  status: string;
  insurances: any[];
}>) {
  await requireWspActionPermission('warehouseMaster');
  await connectToDatabase();
  try {
    const session = await requireSession();
    
    // Fetch warehouse first to check occupied capacity
    const warehouse = await Warehouse.findOne({ _id: id, ...getTenantFilter(session) });
    if (!warehouse) {
      throw new Error('Warehouse not found');
    }

    if (data.warehouseType !== undefined || data.platformCommission !== undefined || data.ownerEarnings !== undefined) {
      const warehouseType = data.warehouseType || warehouse.warehouseType || 'Owner';
      if (warehouseType === 'Rented') {
        data.warehouseType = 'Rented';
        data.platformCommission = 100;
        data.ownerEarnings = 0;
      } else {
        const pc = data.platformCommission !== undefined ? Number(data.platformCommission) : (warehouse.platformCommission ?? 40);
        const oe = data.ownerEarnings !== undefined ? Number(data.ownerEarnings) : (warehouse.ownerEarnings ?? 60);

        if (isNaN(pc) || isNaN(oe) || pc < 0 || pc > 100 || oe < 0 || oe > 100) {
          throw new Error('Platform Commission and Owner Earnings must be numbers between 0 and 100.');
        }
        const total = Number((pc + oe).toFixed(2));
        if (total !== 100) {
          throw new Error(`Platform Commission (${pc}%) and Owner Earnings (${oe}%) must equal exactly 100%. Current total: ${total}%.`);
        }
        data.warehouseType = 'Owner';
        data.platformCommission = pc;
        data.ownerEarnings = oe;
      }
    }

    if (data.name) {
      const email = session.user.email?.trim().toLowerCase() || null;
      const ownerFilter: any = {
        $or: [
          { userId: session.user.id },
          ...(email ? [{ userEmail: { $regex: new RegExp(`^${email.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}$`, 'i') } }] : [])
        ]
      };
      
      const existingWarehouse = await Warehouse.findOne({
        _id: { $ne: id },
        ...ownerFilter,
        name: data.name
      });
      
      if (existingWarehouse) {
        throw new Error('Warehouse name already exists for this WSP. Please use a different name.');
      }
    }

    const nextTotalCapacity = data.totalCapacity !== undefined ? data.totalCapacity : warehouse.totalCapacity;
    const nextOccupiedCapacity = warehouse.occupiedCapacity;

    if (data.totalCapacity !== undefined && data.totalCapacity < nextOccupiedCapacity) {
      throw new Error('Warehouse capacity cannot be less than the currently occupied quantity.');
    }

    // Always auto-update status based on utilization rules, but preserve INACTIVE
    if (warehouse.status !== 'INACTIVE') {
      data.status = nextOccupiedCapacity >= nextTotalCapacity ? 'FULL' : 'ACTIVE';
    } else {
      data.status = 'INACTIVE';
    }

    const db = await getDb();
    let targetObjectId: any;
    try {
      targetObjectId = new mongoose.Types.ObjectId(id);
    } catch {
      targetObjectId = id;
    }

    const updateDoc: any = {
      ...(data.warehouseType !== undefined ? { warehouseType: data.warehouseType } : {}),
      ...(data.platformCommission !== undefined ? { platformCommission: data.platformCommission } : {}),
      ...(data.ownerEarnings !== undefined ? { ownerEarnings: data.ownerEarnings, ownerEquity: data.ownerEarnings } : {}),
      ...(data.name ? { name: data.name } : {}),
      ...(data.address ? { address: data.address } : {}),
      ...(data.warehouseId !== undefined ? { warehouseId: data.warehouseId } : {}),
      ...(data.totalCapacity !== undefined ? { totalCapacity: data.totalCapacity } : {}),
      ...(data.status ? { status: data.status } : {}),
      ...(data.insurances ? { insurances: data.insurances } : {}),
      updatedAt: new Date(),
    };

    await db.collection('warehouses').updateOne(
      { _id: targetObjectId },
      { $set: updateDoc }
    );

    const updatedWarehouse = await Warehouse.findOneAndUpdate(
      { _id: id, ...getTenantFilter(session) },
      {
        ...data,
        ...(data.ownerEarnings !== undefined ? { ownerEquity: data.ownerEarnings } : {}),
      },
      { new: true }
    );

    if (!updatedWarehouse) {
      throw new Error('Warehouse not found or could not be updated');
    }
    
    await logActivity({
      actionType: 'UPDATE',
      module: 'Warehouse Master',
      recordId: id,
      description: `Updated warehouse: ${updatedWarehouse.name}`,
      previousValue: warehouse,
      newValue: updatedWarehouse,
      storageType: 'Dry Storage',
      sessionFallback: session
    });

    revalidatePath('/dashboard/warehouses');
    revalidatePath('/dashboard/revenue');
    return { success: true, data: JSON.parse(JSON.stringify(updatedWarehouse)) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function toggleWarehouseStatus(id: string) {
  await requireWspActionPermission('warehouseMaster');
  await connectToDatabase();
  try {
    const session = await requireSession();
    
    const warehouse = await Warehouse.findOne({ _id: id, ...getTenantFilter(session) });
    if (!warehouse) {
      throw new Error('Warehouse not found');
    }

    let nextStatus: 'ACTIVE' | 'INACTIVE' | 'FULL';
    if (warehouse.status === 'INACTIVE') {
      nextStatus = warehouse.occupiedCapacity >= warehouse.totalCapacity ? 'FULL' : 'ACTIVE';
    } else {
      nextStatus = 'INACTIVE';
    }

    warehouse.status = nextStatus;
    await warehouse.save();

    await logActivity({
      actionType: 'UPDATE',
      module: 'Warehouse Master',
      recordId: id,
      description: `Toggled warehouse status: ${warehouse.name} to ${nextStatus}`,
      storageType: 'Dry Storage',
      sessionFallback: session
    });

    revalidatePath('/dashboard/warehouses');
    return { success: true, data: JSON.parse(JSON.stringify(warehouse)) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteWarehouse(id: string) {
  await requireWspActionPermission('warehouseMaster');
  await connectToDatabase();
  try {
    const session = await requireSession();

    if (!isAdmin(session)) {
      throw new Error('Only Admin users can delete warehouses.');
    }

    const warehouse = await Warehouse.findById(id);
    if (!warehouse) {
      throw new Error('Warehouse not found');
    }

    // Calculate remaining stock = Total Inward Quantity - Total Outward Quantity
    const inwardResult = await Inward.aggregate([
      { $match: { warehouseId: new mongoose.Types.ObjectId(id) } },
      { $group: { _id: null, total: { $sum: '$quantityMT' } } }
    ]);
    const outwardResult = await Outward.aggregate([
      { $match: { warehouseId: new mongoose.Types.ObjectId(id) } },
      { $group: { _id: null, total: { $sum: '$quantityMT' } } }
    ]);

    const totalInward = inwardResult[0]?.total || 0;
    const totalOutward = outwardResult[0]?.total || 0;
    const remainingStock = totalInward - totalOutward;

    if (remainingStock > 0) {
      throw new Error('Warehouse cannot be deleted because stock is still available in this warehouse.');
    }

    await Warehouse.findByIdAndDelete(id);

    await logActivity({
      actionType: 'DELETE',
      module: 'Warehouse Master',
      recordId: id,
      description: `Deleted warehouse: ${warehouse.name}`,
      previousValue: warehouse,
      storageType: 'Dry Storage',
      sessionFallback: session
    });

    revalidatePath('/dashboard/warehouses');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
