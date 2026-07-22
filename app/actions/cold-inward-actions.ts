'use server';

import connectToDatabase from '@/lib/mongoose';
import ColdInward from '@/lib/models/ColdInward';
import ColdWarehouse from '@/lib/models/ColdWarehouse';
import ColdOutward from '@/lib/models/ColdOutward';
import ColdInwardDraft from '@/lib/models/ColdInwardDraft';
import Client from '@/lib/models/Client';
import { revalidatePath } from 'next/cache';
import { hasPermission } from '@/lib/permissions';
import { appendOwnership, getTenantFilter, requireSession } from '@/lib/ownership';
import mongoose from 'mongoose';

export async function getColdInwards() {
  await connectToDatabase();
  const session = await requireSession();
  
  const inwards = await ColdInward.find(getTenantFilter(session))
    .populate('clientId', 'name')
    .populate('commodityId', 'name type')
    .populate('warehouseId', 'name warehouseId')
    .sort({ date: -1, createdAt: -1 });
    
  return JSON.parse(JSON.stringify(inwards));
}

export async function getStackAvailableCapacity(warehouseId: string, chamberNo: number, floorNo: number, stackNo: number) {
  await connectToDatabase();
  const session = await requireSession();
  
  const warehouse = await ColdWarehouse.findOne({ _id: warehouseId, ...getTenantFilter(session) });
  if (!warehouse) throw new Error('Warehouse not found');

  const chamber = warehouse.chambers.find((c: any) => c.chamberNo === chamberNo);
  if (!chamber) throw new Error('Chamber not found');

  const floor = chamber.floors.find((f: any) => f.floorNo === floorNo);
  if (!floor) throw new Error('Floor not found');

  const stack = floor.stacks.find((s: any) => s.stackNo === stackNo);
  if (!stack) throw new Error('Stack not found');

  const totalCapacity = stack.capacity;

  const inwards = await ColdInward.aggregate([
    {
      $unwind: '$stackAllocations'
    },
    {
      $match: {
        $and: [
          { warehouseId: new mongoose.Types.ObjectId(warehouseId) },
          { 'stackAllocations.chamberNo': chamberNo },
          { 'stackAllocations.floorNo': floorNo },
          { 'stackAllocations.stackNo': stackNo },
          getTenantFilter(session)
        ]
      }
    },
    {
      $group: {
        _id: null,
        totalInward: { $sum: '$stackAllocations.allocatedWeight' }
      }
    }
  ]);

  const outwards = await ColdOutward.aggregate([
    {
      $match: {
        $and: [
          { warehouseId: new mongoose.Types.ObjectId(warehouseId) },
          { chamberNo },
          { floorNo },
          { stackNo },
          getTenantFilter(session)
        ]
      }
    },
    {
      $group: {
        _id: null,
        totalOutward: { $sum: '$quantityKg' }
      }
    }
  ]);

  const totalInward = inwards.length > 0 ? inwards[0].totalInward : 0;
  const totalOutward = outwards.length > 0 ? outwards[0].totalOutward : 0;
  const occupied = Math.max(0, totalInward - totalOutward);
  
  return { availableCapacity: Math.max(0, totalCapacity - occupied), totalCapacity, occupied };
}

export async function createColdInward(data: any) {
  await connectToDatabase();
  try {
    const session = await requireSession();
    if (!hasPermission(session, 'inward', 'create')) throw new Error('Forbidden: Insufficient permissions');
    
    // Check capacity first
    const capacityInfo = await getStackAvailableCapacity(data.warehouseId, data.chamberNo, data.floorNo, data.stackNo);
    
    if (data.quantityKg > capacityInfo.availableCapacity) {
      return { success: false, error: `Quantity exceeds available stack capacity. Available: ${capacityInfo.availableCapacity} Kg` };
    }

    // Clean up empty strings for enums to avoid validation errors
    if (data.grade === '') {
      delete data.grade;
    }

    const inward = await ColdInward.create(appendOwnership({
      ...data,
      date: data.date ? new Date(data.date) : new Date(),
    }, session));
    
    revalidatePath('/cold/inward');
    return { success: true, data: JSON.parse(JSON.stringify(inward)) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function saveColdInwardDraft(formData: any, draftId?: string) {
  await connectToDatabase();
  try {
    const session = await requireSession();
    if (!hasPermission(session, 'inward', 'create')) throw new Error('Forbidden: Insufficient permissions');

    if (draftId) {
      await ColdInwardDraft.findOneAndUpdate(
        { _id: draftId, ...getTenantFilter(session) },
        { formData, updatedAt: new Date() }
      );
      return { success: true, draftId };
    } else {
      const draft = await ColdInwardDraft.create(appendOwnership({
        formData
      }, session));
      return { success: true, draftId: draft._id.toString() };
    }
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getColdInwardDrafts() {
  await connectToDatabase();
  const session = await requireSession();
  
  const drafts = await ColdInwardDraft.find(getTenantFilter(session))
    .sort({ updatedAt: -1 });
    
  return JSON.parse(JSON.stringify(drafts));
}

export async function deleteColdInwardDraft(draftId: string) {
  await connectToDatabase();
  try {
    const session = await requireSession();
    if (!hasPermission(session, 'inward', 'create')) throw new Error('Forbidden: Insufficient permissions');

    await ColdInwardDraft.findOneAndDelete({ _id: draftId, ...getTenantFilter(session) });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function createColdInwardBulk(data: any, draftId?: string) {
  await connectToDatabase();
  try {
    const session = await requireSession();
    if (!hasPermission(session, 'inward', 'create')) throw new Error('Forbidden: Insufficient permissions');
    
    // We will start a MongoDB session for transaction if possible, but let's just do sequential for now as some MongoDB setups in this app might not use replica sets.
    const createdInwards = [];
    const clientReceiptMap: Record<string, string[]> = {};

    // Validate commodities assignment
    for (const client of data.clients) {
      const dbClient = await Client.findOne({ _id: client.clientId, ...getTenantFilter(session) });
      if (!dbClient) throw new Error(`Client not found`);
      
      const effectiveCommodityId = data.common?.sameCommodity ? data.common.commodityId : client.commodityId;
      if (dbClient.commodityIds && dbClient.commodityIds.length > 0) {
        const hasAccess = dbClient.commodityIds.some((id: any) => id.toString() === effectiveCommodityId);
        if (!hasAccess) {
          throw new Error(`Commodity is not assigned to client ${dbClient.name}`);
        }
      }
    }

    // First validate ALL capacities
    const clientUsedStacks = new Map<string, Set<string>>();
    const stackAllocatedWeight = new Map<string, number>();
    const stackCapacities = new Map<string, number>();

    for (const client of data.clients) {
      const clientId = client.clientId;
      if (!clientUsedStacks.has(clientId)) {
        clientUsedStacks.set(clientId, new Set<string>());
      }
      const usedStacks = clientUsedStacks.get(clientId)!;

      for (const stack of client.stacks) {
        const stackKey = `${stack.chamberNo}-${stack.floorNo}-${stack.stackNo}`;
        
        if (usedStacks.has(stackKey)) {
          throw new Error(`Duplicate stack selected for same client: Chamber ${stack.chamberNo}, Floor ${stack.floorNo}, Stack ${stack.stackNo}`);
        }
        usedStacks.add(stackKey);

        if (!stackCapacities.has(stackKey)) {
          const capacityInfo = await getStackAvailableCapacity(data.warehouseId, parseInt(stack.chamberNo), parseInt(stack.floorNo), parseInt(stack.stackNo));
          stackCapacities.set(stackKey, capacityInfo.availableCapacity);
        }
        
        const availableCapacity = stackCapacities.get(stackKey)!;
        const currentStackWeight = stackAllocatedWeight.get(stackKey) || 0;
        const newTotalWeight = currentStackWeight + (Number(stack.allocatedWeight) || 0);
        
        if (newTotalWeight > availableCapacity) {
          throw new Error(`Total quantity exceeds available stack capacity in Chamber ${stack.chamberNo}, Floor ${stack.floorNo}, Stack ${stack.stackNo}. Available: ${availableCapacity} Kg`);
        }
        
        stackAllocatedWeight.set(stackKey, newTotalWeight);
      }
    }

    // Now insert
    for (const client of data.clients) {
      if (client.grade === '') {
        delete client.grade;
      }

      const stackAllocations = client.stacks.map((s: any) => ({
        chamberNo: parseInt(s.chamberNo),
        floorNo: parseInt(s.floorNo),
        stackNo: parseInt(s.stackNo),
        allocatedWeight: Number(s.allocatedWeight) || 0,
        bagsCount: Number(s.allocatedBags) || 0,
      }));
      
      const totalQuantity = stackAllocations.reduce((sum: number, s: any) => sum + s.allocatedWeight, 0);
      const totalAllocatedBags = stackAllocations.reduce((sum: number, s: any) => sum + s.bagsCount, 0);

      const inwardData = {
        ...data.common,
        clientId: client.clientId,
        commodityId: client.commodityId,
        grade: client.grade,
        gradingType: client.gradingType,
        stackAllocations,
        quantityKg: totalQuantity,
        bagsCount: totalAllocatedBags,
        jin: client.jin || 0,
        mixed: client.mixed || 0,
        totalBags: totalAllocatedBags + (client.jin || 0) + (client.mixed || 0),
        grossWeight: client.grossWeight || totalQuantity,
        emptyWeight: client.emptyWeight || 0,
        kataBharati: client.kataBharati,
        marko: client.marko,
        farmerName: client.farmerName,
        referencePersons: client.referencePersons,
        warehouseId: data.warehouseId,
      };
      
      const inward = await ColdInward.create(appendOwnership({
        ...inwardData,
        date: data.common.date ? new Date(data.common.date) : new Date(),
      }, session));
      
      createdInwards.push(inward);
      
      if (!clientReceiptMap[client.clientId]) {
        clientReceiptMap[client.clientId] = [];
      }
      clientReceiptMap[client.clientId].push(inward._id.toString());
    }
    
    if (draftId) {
      await ColdInwardDraft.findOneAndDelete({ _id: draftId, ...getTenantFilter(session) });
    }

    revalidatePath('/cold/inward');
    return { success: true, createdIds: createdInwards.map(i => i._id.toString()), clientReceiptMap };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
