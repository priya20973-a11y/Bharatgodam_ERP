'use server';

import connectToDatabase from '@/lib/mongoose';
import ColdInward from '@/lib/models/ColdInward';
import ColdWarehouse from '@/lib/models/ColdWarehouse';
import ColdOutward from '@/lib/models/ColdOutward';
import ColdCommodity from '@/lib/models/ColdCommodity';
import ColdInwardDraft from '@/lib/models/ColdInwardDraft';
import Client from '@/lib/models/Client';
import { revalidatePath } from 'next/cache';
import { hasPermission } from '@/lib/permissions';
import { appendOwnership, getTenantFilter, requireSession, getWarehouseFilter } from '@/lib/ownership';
import mongoose from 'mongoose';
import crypto from 'crypto';

export async function getColdInwards() {
  await connectToDatabase();
  const session = await requireSession();
  
  const inwards = await ColdInward.find({ ...getTenantFilter(session), ...getWarehouseFilter(session) })
    .populate('clientId', 'name')
    .populate('commodityId', 'name type')
    .populate('warehouseId', 'name warehouseId chambers')
    .sort({ date: -1, createdAt: -1 });
    
  return JSON.parse(JSON.stringify(inwards));
}

export async function getColdInwardById(id: string) {
  await connectToDatabase();
  const session = await requireSession();
  
  const inward = await ColdInward.findOne({ _id: id, ...getTenantFilter(session) })
    .populate('clientId', 'name')
    .populate('commodityId', 'name type')
    .populate('warehouseId', 'name warehouseId');
    
  if (!inward) {
    return { success: false, error: 'Inward not found' };
  }
  
  return { success: true, data: JSON.parse(JSON.stringify(inward)) };
}

export async function getColdInwardByQrId(qrId: string) {
  await connectToDatabase();
  const session = await requireSession();
  
  const inward = await ColdInward.findOne({ qrId, ...getTenantFilter(session) })
    .populate('clientId', 'name')
    .populate('commodityId', 'name type')
    .populate('warehouseId', 'name warehouseId');
    
  if (!inward) {
    return { success: false, error: 'Inward not found' };
  }
  
  return { success: true, data: JSON.parse(JSON.stringify(inward)) };
}

export async function ensureInwardQrId(id: string) {
  try {
    await connectToDatabase();
    const session = await requireSession();
    
    const inward = await ColdInward.findOne({ _id: id, ...getTenantFilter(session) });
    if (!inward) {
      return { success: false, error: 'Inward not found' };
    }
    
    if (!inward.qrId) {
      const newQrId = crypto.randomUUID();
      await ColdInward.updateOne({ _id: inward._id }, { $set: { qrId: newQrId } });
      inward.qrId = newQrId;
    }
    
    return { success: true, qrId: inward.qrId };
  } catch (error: any) {
    console.error('Error in ensureInwardQrId:', error);
    return { success: false, error: error.message || 'Internal server error while generating QR ID' };
  }
}

export async function getStackAvailableCapacity(warehouseId: string, chamberName: string, floorNo: number, stackNo: number) {
  await connectToDatabase();
  const session = await requireSession();
  
  const warehouse = await ColdWarehouse.findOne({ _id: warehouseId, ...getTenantFilter(session) });
  if (!warehouse) throw new Error('Warehouse not found');

  const chamber = warehouse.chambers.find((c: any) => c.name === chamberName || c.chamberNo === parseInt(chamberName));
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
          { 
            $or: [
              { 'stackAllocations.chamberName': chamberName },
              ...(chamber.chamberNo ? [{ 'stackAllocations.chamberNo': chamber.chamberNo }] : [])
            ]
          },
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
          { 
            $or: [
              { chamberName: chamberName },
              ...(chamber.chamberNo ? [{ chamberNo: chamber.chamberNo }] : [])
            ]
          },
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
  const bufferCapacity = warehouse.bufferCapacity || 0;
  
  return { 
    availableCapacity: Math.max(0, totalCapacity - occupied), 
    totalCapacity, 
    occupied,
    bufferCapacity
  };
}

export async function createColdInward(data: any) {
  await connectToDatabase();
  try {
    const session = await requireSession();
    if (!hasPermission(session, 'inward', 'create')) throw new Error('Forbidden: Insufficient permissions');
    
    // Check capacity first
    const capacityInfo = await getStackAvailableCapacity(data.warehouseId, data.chamberName || data.chamberNo?.toString(), data.floorNo, data.stackNo);
    const maxAllowedCapacity = capacityInfo.totalCapacity + capacityInfo.bufferCapacity - capacityInfo.occupied;
    const availableStackCapacity = capacityInfo.availableCapacity;
    let warning;

    if (data.quantityKg > maxAllowedCapacity) {
      return { success: false, error: 'Maximum capacity exceeded.' };
    }

    if (data.quantityKg > availableStackCapacity && data.quantityKg <= maxAllowedCapacity) {
      if (!data.confirmed) {
        return { success: false, requireConfirmation: true, error: 'Stack capacity exceeded. Use buffer capacity?' };
      }
      warning = "Buffer capacity used.";
    }

    const dbClient = await Client.findOne({ _id: data.clientId, ...getTenantFilter(session) }).lean();
    const isPurchaseClient = dbClient?.clientType === 'PURCHASE';

    if (isPurchaseClient) {
      data.stockType = 'Purchase';
      data.purchaseQuantityKg = data.quantityKg;
      data.purchaseBagsCount = data.bagsCount;
      data.selfQuantityKg = 0;
      data.selfBagsCount = 0;
      if (data.stackAllocations) {
        data.stackAllocations = data.stackAllocations.map((s: any) => ({ ...s, stockType: 'Purchase' }));
      }
    }

    // Clean up empty strings for enums to avoid validation errors
    if (data.grade === '') {
      delete data.grade;
    }

    const commodity = await ColdCommodity.findOne({ _id: data.commodityId, ...getTenantFilter(session) }).lean();
    const unit = commodity?.unit || 'KG';

    const inward = await ColdInward.create(appendOwnership({
      ...data,
      unit,
      remainingQuantityKg: data.quantityKg,
      remainingBagsCount: data.bagsCount,
      status: 'Active',
      qrId: crypto.randomUUID(),
      qualityEntries: data.qualityEntries || [],
      date: data.date ? new Date(data.date) : new Date(),
    }, session));
    
    revalidatePath('/cold/inward');
    return { success: true, data: JSON.parse(JSON.stringify(inward)), warning };
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
    const warnings: string[] = [];

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
    const stackCapacities = new Map<string, { totalCapacity: number, bufferCapacity: number, occupied: number, availableCapacity: number }>();

    for (const client of data.clients) {
      const clientId = client.clientId;
      if (!clientUsedStacks.has(clientId)) {
        clientUsedStacks.set(clientId, new Set<string>());
      }
      const usedStacks = clientUsedStacks.get(clientId)!;

      for (const stack of client.stacks) {
        const stackKey = `${stack.chamberName || stack.chamberNo}-${stack.floorNo}-${stack.stackNo}`;
        
        if (usedStacks.has(stackKey)) {
          throw new Error(`Duplicate stack selected for same client: Chamber ${stack.chamberName || stack.chamberNo}, Floor ${stack.floorNo}, Stack ${stack.stackNo}`);
        }
        usedStacks.add(stackKey);

        if (!stackCapacities.has(stackKey)) {
          const capacityInfo = await getStackAvailableCapacity(data.warehouseId, stack.chamberName || stack.chamberNo?.toString(), parseInt(stack.floorNo), parseInt(stack.stackNo));
          stackCapacities.set(stackKey, { totalCapacity: capacityInfo.totalCapacity, bufferCapacity: capacityInfo.bufferCapacity, occupied: capacityInfo.occupied, availableCapacity: capacityInfo.availableCapacity });
        }
        
        const { totalCapacity, bufferCapacity, occupied, availableCapacity } = stackCapacities.get(stackKey)!;
        const maxAllowedCapacity = totalCapacity + bufferCapacity - occupied;
        const availableStackCapacity = availableCapacity;

        const currentStackWeight = stackAllocatedWeight.get(stackKey) || 0;
        const newTotalWeight = currentStackWeight + (Number(stack.allocatedWeight) || 0);
        
        if (newTotalWeight > maxAllowedCapacity) {
          return { success: false, error: 'Maximum capacity exceeded.' };
        }

        if (newTotalWeight > availableStackCapacity && newTotalWeight <= maxAllowedCapacity) {
          if (!data.confirmed) {
            return { success: false, requireConfirmation: true, error: 'Stack capacity exceeded. Use buffer capacity?' };
          }
          warnings.push(`Buffer capacity used in Chamber ${stack.chamberName || stack.chamberNo}, Stack ${stack.stackNo}.`);
        }
        
        stackAllocatedWeight.set(stackKey, newTotalWeight);
      }
    }

    // Now insert
    for (const client of data.clients) {
      if (client.grade === '') {
        delete client.grade;
      }

      const dbClient = await Client.findOne({ _id: client.clientId, ...getTenantFilter(session) }).lean();
      const isPurchaseClient = dbClient?.clientType === 'PURCHASE';

      const stackAllocations = client.stacks.map((s: any) => ({
        chamberName: s.chamberName || s.chamberNo?.toString(),
        chamberNo: s.chamberNo && !isNaN(parseInt(s.chamberNo)) ? parseInt(s.chamberNo) : undefined,
        floorNo: parseInt(s.floorNo),
        stackNo: parseInt(s.stackNo),
        allocatedWeight: Number(s.allocatedWeight) || 0,
        bagsCount: Number(s.allocatedBags) || 0,
        stockType: isPurchaseClient ? 'Purchase' : (s.stockType || 'Self'),
      }));
      
      const totalQuantity = stackAllocations.reduce((sum: number, s: any) => sum + s.allocatedWeight, 0);
      const totalAllocatedBags = stackAllocations.reduce((sum: number, s: any) => sum + s.bagsCount, 0);

      const commodity = await ColdCommodity.findOne({ _id: client.commodityId, ...getTenantFilter(session) }).lean();
      const unit = commodity?.unit || 'KG';

      const inwardData = {
        ...data.common,
        clientId: client.clientId,
        commodityId: client.commodityId,
        unit,
        grade: client.grade,
        qualityEntries: client.qualityEntries || [],
        stackAllocations,
        quantityKg: totalQuantity,
        bagsCount: totalAllocatedBags,
        remainingQuantityKg: totalQuantity,
        remainingBagsCount: totalAllocatedBags,
        status: 'Active',
        qrId: crypto.randomUUID(),
        jin: client.jin || 0,
        mixed: client.mixed || 0,
        totalBags: totalAllocatedBags + (client.jin || 0) + (client.mixed || 0),
        grossWeight: client.grossWeight || totalQuantity,
        emptyWeight: client.emptyWeight || 0,
        kataBharati: client.kataBharati,
        marko: client.marko,
        farmerName: client.farmerName,
        farmerId: client.farmerId,
        referencePersons: client.referencePersons,
        warehouseId: data.warehouseId,
        gradingApplied: client.gradingApplied || false,
        gradingChargeType: client.gradingChargeType,
        gradingRate: client.gradingRate,
        gradingCharge: client.gradingCharge,
        stockType: isPurchaseClient ? 'Purchase' : (client.stockType || 'Self'),
        purchaseQuantityKg: isPurchaseClient ? totalQuantity : (client.purchaseQuantityKg || 0),
        purchaseBagsCount: isPurchaseClient ? totalAllocatedBags : (client.purchaseBagsCount || 0),
        selfQuantityKg: isPurchaseClient ? 0 : (client.selfQuantityKg || totalQuantity),
        selfBagsCount: isPurchaseClient ? 0 : (client.selfBagsCount || totalAllocatedBags),
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
    const uniqueWarnings = [...new Set(warnings)];
    return { success: true, createdIds: createdInwards.map(i => i._id.toString()), clientReceiptMap, warning: uniqueWarnings.length > 0 ? uniqueWarnings.join(' ') : undefined };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
