'use server';

import connectToDatabase from '@/lib/mongoose';
import ColdInward from '@/lib/models/ColdInward';
import ColdWarehouse from '@/lib/models/ColdWarehouse';
import ColdOutward from '@/lib/models/ColdOutward';
import { revalidatePath } from 'next/cache';
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
        totalInward: { $sum: '$quantityKg' }
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
        totalOutward: { $sum: '$quantityKg' },
        totalPlusMinus: { $sum: '$plusMinus' }
      }
    }
  ]);

  const totalInward = inwards.length > 0 ? inwards[0].totalInward : 0;
  const totalOutward = outwards.length > 0 ? outwards[0].totalOutward : 0;
  const totalPlusMinus = outwards.length > 0 ? (outwards[0].totalPlusMinus || 0) : 0;
  const occupied = Math.max(0, totalInward + totalPlusMinus - totalOutward);
  
  return { availableCapacity: Math.max(0, totalCapacity - occupied), totalCapacity, occupied };
}

export async function createColdInward(data: any) {
  await connectToDatabase();
  try {
    const session = await requireSession();
    
    // Check capacity first
    const capacityInfo = await getStackAvailableCapacity(data.warehouseId, data.chamberNo, data.floorNo, data.stackNo);
    
    if (data.quantityKg > capacityInfo.availableCapacity) {
      return { success: false, error: `Quantity exceeds available stack capacity. Available: ${capacityInfo.availableCapacity} Kg` };
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
