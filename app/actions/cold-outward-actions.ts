'use server';

import connectToDatabase from '@/lib/mongoose';
import ColdOutward from '@/lib/models/ColdOutward';
import ColdInward from '@/lib/models/ColdInward';
import ColdCommodity from '@/lib/models/ColdCommodity';
import { revalidatePath } from 'next/cache';
import { hasPermission } from '@/lib/permissions';
import { appendOwnership, getTenantFilter, requireSession } from '@/lib/ownership';
import mongoose from 'mongoose';

export async function getColdOutwards() {
  await connectToDatabase();
  const session = await requireSession();
  
  const outwards = await ColdOutward.find(getTenantFilter(session))
    .populate('clientId', 'name')
    .populate('commodityId', 'name type')
    .populate('warehouseId', 'name warehouseId')
    .sort({ date: -1, createdAt: -1 });
    
  // Group by batchId
  const grouped: Record<string, any> = {};
  const result: any[] = [];
  
  for (const out of JSON.parse(JSON.stringify(outwards))) {
    const key = out.batchId || out._id;
    if (!grouped[key]) {
      grouped[key] = {
        ...out,
        items: [out],
        // Aggregate totals for the row display
        quantityKg: out.quantityKg,
        bagsCount: out.bagsCount,
        isBatch: !!out.batchId
      };
      result.push(grouped[key]);
    } else {
      grouped[key].items.push(out);
      grouped[key].quantityKg += out.quantityKg;
      grouped[key].bagsCount += out.bagsCount;
    }
  }
    
  return result;
}

export async function getStackAvailableClientStock(
  clientId: string,
  commodityId: string,
  warehouseId: string,
  chamberNo: number,
  floorNo: number,
  stackNo: number
) {
  await connectToDatabase();
  const session = await requireSession();

  const matchCriteria = {
    $and: [
      { clientId: new mongoose.Types.ObjectId(clientId) },
      { commodityId: new mongoose.Types.ObjectId(commodityId) },
      { warehouseId: new mongoose.Types.ObjectId(warehouseId) },
      { chamberNo },
      { floorNo },
      { stackNo },
      getTenantFilter(session)
    ]
  };

  const inwardMatchCriteria = {
    $and: [
      { clientId: new mongoose.Types.ObjectId(clientId) },
      { commodityId: new mongoose.Types.ObjectId(commodityId) },
      { warehouseId: new mongoose.Types.ObjectId(warehouseId) },
      { 'stackAllocations.chamberNo': chamberNo },
      { 'stackAllocations.floorNo': floorNo },
      { 'stackAllocations.stackNo': stackNo },
      getTenantFilter(session)
    ]
  };

  const inwards = await ColdInward.aggregate([
    { $unwind: '$stackAllocations' },
    { $match: inwardMatchCriteria },
    { $group: { _id: null, totalInward: { $sum: '$stackAllocations.allocatedWeight' } } }
  ]);
  const totalInward = inwards.length > 0 ? inwards[0].totalInward : 0;

  const outwards = await ColdOutward.aggregate([
    { $match: matchCriteria },
    { $group: { _id: null, totalOutward: { $sum: '$quantityKg' }, totalPlusMinus: { $sum: '$plusMinus' } } }
  ]);
  const totalOutward = outwards.length > 0 ? outwards[0].totalOutward : 0;
  const totalPlusMinus = outwards.length > 0 ? (outwards[0].totalPlusMinus || 0) : 0;

  const availableStock = Math.max(0, totalInward + totalPlusMinus - totalOutward);
  
  return { availableStock, totalInward, totalOutward, totalPlusMinus };
}

export async function getAvailableInwardsForClient(clientId: string) {
  await connectToDatabase();
  const session = await requireSession();
  const tenantFilter = getTenantFilter(session);

  const inwards = await ColdInward.find({ clientId: new mongoose.Types.ObjectId(clientId), ...tenantFilter })
    .populate('commodityId', 'name type')
    .populate('warehouseId', 'name')
    .sort({ date: -1, createdAt: -1 })
    .lean();

  const outwards = await ColdOutward.aggregate([
    { $match: { clientId: new mongoose.Types.ObjectId(clientId), ...tenantFilter } },
    { $group: { 
        _id: { inwardId: '$inwardId', chamberNo: '$chamberNo', floorNo: '$floorNo', stackNo: '$stackNo' }, 
        totalOutward: { $sum: '$quantityKg' }, 
        totalPlusMinus: { $sum: '$plusMinus' } 
      } 
    }
  ]);

  const outwardMap = new Map();
  outwards.forEach(o => {
    if (o._id.inwardId) {
      const key = `${o._id.inwardId.toString()}_${o._id.chamberNo}_${o._id.floorNo}_${o._id.stackNo}`;
      outwardMap.set(key, { out: o.totalOutward, plusMinus: o.totalPlusMinus || 0 });
    }
  });

  const availableInwards = inwards.flatMap((inward: any) => {
    if (!inward.stackAllocations) return [];
    
    return inward.stackAllocations.map((alloc: any) => {
      const key = `${inward._id.toString()}_${alloc.chamberNo}_${alloc.floorNo}_${alloc.stackNo}`;
      const outData = outwardMap.get(key) || { out: 0, plusMinus: 0 };
      const availableQty = Math.max(0, alloc.allocatedWeight + outData.plusMinus - outData.out);
      
      // We return an object that looks exactly like a standard inward to the frontend
      // but with the specific stack details from the allocation
      return { 
        ...inward,
        uniqueKey: key,
        chamberNo: alloc.chamberNo,
        floorNo: alloc.floorNo,
        stackNo: alloc.stackNo,
        quantityKg: alloc.allocatedWeight,
        bagsCount: alloc.bagsCount,
        availableQty 
      };
    }).filter((inw: any) => inw.availableQty > 0);
  });

  return JSON.parse(JSON.stringify(availableInwards));
}

export async function createColdOutward(data: any) {
  await connectToDatabase();
  try {
    const session = await requireSession();
    if (!hasPermission(session, 'outward', 'create')) throw new Error('Forbidden: Insufficient permissions');
    
    // Check available stock first
    const stockInfo = await getStackAvailableClientStock(
      data.clientId,
      data.commodityId,
      data.warehouseId,
      data.chamberNo,
      data.floorNo,
      data.stackNo
    );
    
    const adjustedAvailableStock = stockInfo.availableStock + (Number(data.plusMinus) || 0);
    if (data.quantityKg > adjustedAvailableStock) {
      return { success: false, error: `Quantity exceeds available stock. Available: ${adjustedAvailableStock} Kg` };
    }

    if (data.grade === '') {
      delete data.grade;
    }

    let rentRs = 0;
    const commodity = await ColdCommodity.findById(data.commodityId);
    const outDate = data.date ? new Date(data.date) : new Date();
    
    if (commodity && commodity.seasonalPrices && commodity.seasonalPrices.length > 0) {
      const month = outDate.getMonth() + 1;
      const season = commodity.seasonalPrices.find((s: any) => month >= s.fromMonth && month <= s.toMonth) || commodity.seasonalPrices[0];
      
      if (season) {
        let currentPrice = 0;
        if (commodity.priceType === 'Different Price') {
          if (data.grade === 'Large') currentPrice = season.priceLarge || 0;
          else if (data.grade === 'Small') currentPrice = season.priceSmall || 0;
          else if (data.grade === 'Mixed') currentPrice = season.priceMixed || 0;
        } else {
          currentPrice = season.pricePerKg || 0;
        }
        
        if (commodity.gradingType === 'Wet') {
          rentRs = (data.quantityKg / 81) * currentPrice * 4;
        } else {
          rentRs = data.quantityKg * currentPrice;
        }
      }
    }

    const outward = await ColdOutward.create(appendOwnership({
      ...data,
      rentRs,
      date: outDate,
    }, session));
    
    revalidatePath('/cold/outward');
    return { success: true, data: JSON.parse(JSON.stringify(outward)) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
export async function createBatchColdOutwards(payload: any) {
  await connectToDatabase();
  try {
    const session = await requireSession();
    if (!hasPermission(session, 'outward', 'create')) throw new Error('Forbidden: Insufficient permissions');
    
    if (!payload.items || !Array.isArray(payload.items) || payload.items.length === 0) {
      return { success: false, error: 'No items provided for batch.' };
    }

    const batchId = new mongoose.Types.ObjectId().toString();
    const createdOutwards = [];

    for (const item of payload.items) {
      // Check available stock first
      const stockInfo = await getStackAvailableClientStock(
        payload.clientId,
        item.commodityId,
        item.warehouseId,
        item.chamberNo,
        item.floorNo,
        item.stackNo
      );
      
      const adjustedAvailableStock = stockInfo.availableStock + (Number(item.plusMinus) || 0);
      if (item.quantityKg > adjustedAvailableStock) {
        return { success: false, error: `Quantity exceeds available stock for one of the items. Available: ${adjustedAvailableStock} Kg` };
      }

      if (item.grade === '') {
        delete item.grade;
      }

      let rentRs = 0;
      const commodity = await ColdCommodity.findById(item.commodityId);
      const outDate = payload.date ? new Date(payload.date) : new Date();
      
      if (commodity && commodity.seasonalPrices && commodity.seasonalPrices.length > 0) {
        const month = outDate.getMonth() + 1;
        const season = commodity.seasonalPrices.find((s: any) => month >= s.fromMonth && month <= s.toMonth) || commodity.seasonalPrices[0];
        
        if (season) {
          let currentPrice = 0;
          if (commodity.priceType === 'Different Price') {
            if (item.grade === 'Large') currentPrice = season.priceLarge || 0;
            else if (item.grade === 'Small') currentPrice = season.priceSmall || 0;
            else if (item.grade === 'Mixed') currentPrice = season.priceMixed || 0;
          } else {
            currentPrice = season.pricePerKg || 0;
          }
          
          if (commodity.gradingType === 'Wet') {
            rentRs = (item.quantityKg / 81) * currentPrice * 4;
          } else {
            rentRs = item.quantityKg * currentPrice;
          }
        }
      }

      const outward = await ColdOutward.create(appendOwnership({
        ...item,
        clientId: payload.clientId,
        truckNo: payload.truckNo,
        remarks: payload.remarks,
        note: payload.note,
        rentRs,
        date: outDate,
        batchId
      }, session));
      createdOutwards.push(outward);
    }
    
    revalidatePath('/cold/outward');
    return { success: true, data: JSON.parse(JSON.stringify(createdOutwards)) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
