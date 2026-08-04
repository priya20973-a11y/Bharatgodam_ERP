'use server';

import connectToDatabase from '@/lib/mongoose';
import ColdWarehouse from '@/lib/models/ColdWarehouse';
import { revalidatePath } from 'next/cache';
import { hasPermission } from '@/lib/permissions';
import { appendOwnership, getTenantFilter, requireSession, isAdmin, getWarehouseFilter } from '@/lib/ownership';
import { getDb } from '@/lib/mongodb';
import mongoose from 'mongoose';

export async function getColdWarehouses(options?: { includeInactive?: boolean }) {
  await connectToDatabase();
  const session = await requireSession();
  const allowedStatuses = ['ACTIVE'];
  if (options?.includeInactive) {
    allowedStatuses.push('INACTIVE');
  }
  
  const warehouses = await ColdWarehouse.find({ status: { $in: allowedStatuses }, ...getTenantFilter(session), ...getWarehouseFilter(session, '_id') }).sort({ name: 1 });
  
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

    return {
      ...w.toObject?.() || w,
      name: displayName,
      wspName,
      addedBy,
    };
  })));
}

export async function createColdWarehouse(data: {
  name: string;
  address: string;
  noOfChambers: number;
  noOfFloors: number;
  noOfStacks: number;
  stackCapacity: number;
  bufferCapacity?: number;
  stackLayout: string;
  gridRows?: number;
  gridCols?: number;
  customLayout?: any[];
  referencePersons?: any[];
  aadhaarNo?: string;
  panNo?: string;
  gstin?: string;
  bankDetails?: any;
  warehouseLogo?: string;
  chamberNames?: string[];
  floorNames?: string[];
}) {
  await connectToDatabase();
  try {
    const session = await requireSession();
    if (!hasPermission(session, 'warehouse', 'create')) throw new Error('Forbidden: Insufficient permissions');
    
    const email = session.user.email?.trim().toLowerCase() || null;
    const ownerFilter: any = {
      $or: [
        { userId: session.user.id },
        ...(email ? [{ userEmail: { $regex: new RegExp(`^${email.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}$`, 'i') } }] : [])
      ]
    };
    
    const existingWarehouse = await ColdWarehouse.findOne({
      ...ownerFilter,
      name: data.name
    });
    
    if (existingWarehouse) {
      return { success: false, error: 'Cold Warehouse name already exists for this WSP. Please use a different name.' };
    }

    // Generate hierarchy
    const chambers = [];
    for (let c = 1; c <= data.noOfChambers; c++) {
      const floors = [];
      for (let f = 1; f <= data.noOfFloors; f++) {
        let stacks = [];
        for (let s = 1; s <= data.noOfStacks; s++) {
          stacks.push({
            name: `Stack ${s}`,
            stackNo: s,
            capacity: data.stackCapacity
          });
        }
        floors.push({
          name: data.floorNames && data.floorNames[f - 1] ? data.floorNames[f - 1] : `Floor ${f}`,
          floorNo: f,
          stacks
        });
      }
      chambers.push({
        name: data.chamberNames && data.chamberNames[c - 1] ? data.chamberNames[c - 1] : `Chamber ${c}`,
        chamberNo: c,
        floors
      });
    }

    const totalCapacity = data.noOfChambers * data.noOfFloors * data.noOfStacks * data.stackCapacity;

    const warehouse = await ColdWarehouse.create(appendOwnership({
      ...data,
      totalCapacity,
      chambers,
      status: 'ACTIVE',
    }, session));
    
    // Assign a warehouseId (e.g., CWH-XXXX)
    warehouse.warehouseId = `CWH-${warehouse._id.toString().slice(-4).toUpperCase()}`;
    await warehouse.save();

    revalidatePath('/dashboard/warehouses');
    return { success: true, data: JSON.parse(JSON.stringify(warehouse)) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateColdWarehouse(id: string, data: Partial<{
  name: string;
  warehouseId?: string;
  address: string;
  referencePersons: any[];
  aadhaarNo: string;
  panNo: string;
  gstin: string;
  bankDetails: any;
  warehouseLogo: string;
  chambers: any[];
  floorNames: string[];
  bufferCapacity?: number;
}>) {
  await connectToDatabase();
  try {
    const session = await requireSession();
    if (!hasPermission(session, 'warehouse', 'edit')) throw new Error('Forbidden: Insufficient permissions');
    
    // Fetch warehouse first
    const warehouse = await ColdWarehouse.findOne({ _id: id, ...getTenantFilter(session), ...getWarehouseFilter(session, '_id') });
    if (!warehouse) {
      throw new Error('Cold Warehouse not found');
    }

    if (data.name) {
      const email = session.user.email?.trim().toLowerCase() || null;
      const ownerFilter: any = {
        $or: [
          { userId: session.user.id },
          ...(email ? [{ userEmail: { $regex: new RegExp(`^${email.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}$`, 'i') } } ] : [])
        ]
      };
      
      const duplicate = await ColdWarehouse.findOne({
        ...ownerFilter,
        name: data.name,
        _id: { $ne: id }
      });
      if (duplicate) {
        return { success: false, error: 'Cold Warehouse name already exists for this WSP.' };
      }
    }

    if (data.warehouseId !== undefined && data.warehouseId.trim() !== '') {
      const email = session.user.email?.trim().toLowerCase() || null;
      const ownerFilter: any = {
        $or: [
          { userId: session.user.id },
          ...(email ? [{ userEmail: { $regex: new RegExp(`^${email.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}$`, 'i') } } ] : [])
        ]
      };
      const duplicateId = await ColdWarehouse.findOne({
        ...ownerFilter,
        warehouseId: data.warehouseId.trim(),
        _id: { $ne: id }
      });
      if (duplicateId) {
        return { success: false, error: 'Warehouse ID already exists.' };
      }
      warehouse.warehouseId = data.warehouseId.trim();
    }

    // Only allow specific updates to avoid corrupting stack layouts/hierarchy
    if (data.name) warehouse.name = data.name;
    if (data.address) warehouse.address = data.address;
    if (data.referencePersons) warehouse.referencePersons = data.referencePersons as any;
    if (data.aadhaarNo !== undefined) warehouse.aadhaarNo = data.aadhaarNo;
    if (data.panNo !== undefined) warehouse.panNo = data.panNo;
    if (data.gstin !== undefined) warehouse.gstin = data.gstin;
    if (data.bankDetails !== undefined) {
      warehouse.bankDetails = data.bankDetails;
      warehouse.markModified('bankDetails');
    }
    if (data.warehouseLogo && data.warehouseLogo.trim() !== '') {
      warehouse.warehouseLogo = data.warehouseLogo;
    }
    if (data.bufferCapacity !== undefined) warehouse.bufferCapacity = data.bufferCapacity;
    if (data.chambers && Array.isArray(data.chambers)) {
      warehouse.chambers.forEach((chamber: any, index: number) => {
        if (data.chambers?.[index]?.name) {
          chamber.name = data.chambers[index].name;
        }
        if (data.floorNames && Array.isArray(data.floorNames)) {
          chamber.floors.forEach((floor: any, fIndex: number) => {
            if (data.floorNames?.[fIndex]) {
              floor.name = data.floorNames[fIndex];
            }
          });
        }
      });
    }

    await warehouse.save();
    revalidatePath('/cold/dashboard/warehouses');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function toggleColdWarehouseStatus(id: string) {
  await connectToDatabase();
  try {
    const session = await requireSession();
    if (!hasPermission(session, 'warehouse', 'edit')) throw new Error('Forbidden: Insufficient permissions');
    
    const warehouse = await ColdWarehouse.findOne({ _id: id, ...getTenantFilter(session), ...getWarehouseFilter(session, '_id') });
    if (!warehouse) {
      throw new Error('Cold Warehouse not found');
    }

    warehouse.status = warehouse.status === 'INACTIVE' ? 'ACTIVE' : 'INACTIVE';
    await warehouse.save();

    revalidatePath('/dashboard/warehouses');
    return { success: true, data: JSON.parse(JSON.stringify(warehouse)) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteColdWarehouse(id: string) {
  await connectToDatabase();
  try {
    const session = await requireSession();
    if (!hasPermission(session, 'warehouse', 'delete')) throw new Error('Forbidden: Insufficient permissions');

    if (!isAdmin(session)) {
      throw new Error('Only Admin users can delete warehouses.');
    }

    const warehouse = await ColdWarehouse.findById(id);
    if (!warehouse) {
      throw new Error('Cold Warehouse not found');
    }

    // For now, simple delete, can add checking logic for existing stock later
    await ColdWarehouse.findByIdAndDelete(id);
    revalidatePath('/dashboard/warehouses');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
