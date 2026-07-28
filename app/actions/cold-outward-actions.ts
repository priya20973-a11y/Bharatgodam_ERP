'use server';

import connectToDatabase from '@/lib/mongoose';
import ColdOutward from '@/lib/models/ColdOutward';
import ColdInward from '@/lib/models/ColdInward';
import ColdCommodity from '@/lib/models/ColdCommodity';
import { revalidatePath } from 'next/cache';
import { hasPermission } from '@/lib/permissions';
import { appendOwnership, getTenantFilter, requireSession, getWarehouseFilter } from '@/lib/ownership';
import mongoose from 'mongoose';

export async function getColdOutwards() {
  await connectToDatabase();
  const session = await requireSession();
  
  const outwards = await ColdOutward.find({ ...getTenantFilter(session), ...getWarehouseFilter(session) })
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
  chamberName: string,
  floorNo: number,
  stackNo: number
) {
  await connectToDatabase();
  const session = await requireSession();

  const warehouse = await connectToDatabase().then(() => mongoose.model('ColdWarehouse').findOne({ _id: warehouseId, ...getTenantFilter(session) }));
  const chamber = warehouse?.chambers.find((c: any) => c.name === chamberName || c.chamberNo === parseInt(chamberName));

  const matchCriteria = {
    $and: [
      { clientId: new mongoose.Types.ObjectId(clientId) },
      { commodityId: new mongoose.Types.ObjectId(commodityId) },
      { warehouseId: new mongoose.Types.ObjectId(warehouseId) },
      { 
        $or: [
          { chamberName: chamberName },
          ...(chamber?.chamberNo ? [{ chamberNo: chamber.chamberNo }] : [])
        ]
      },
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
      { 
        $or: [
          { 'stackAllocations.chamberName': chamberName },
          ...(chamber?.chamberNo ? [{ 'stackAllocations.chamberNo': chamber.chamberNo }] : [])
        ]
      },
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
    { $group: { _id: null, totalOutward: { $sum: '$quantityKg' } } }
  ]);
  const totalOutward = outwards.length > 0 ? outwards[0].totalOutward : 0;

  const availableStock = Math.max(0, totalInward - totalOutward);
  
  return { availableStock, totalInward, totalOutward };
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
        _id: { inwardId: '$inwardId', chamberName: '$chamberName', chamberNo: '$chamberNo', floorNo: '$floorNo', stackNo: '$stackNo' }, 
        totalOutward: { $sum: '$quantityKg' }
      } 
    }
  ]);

  const outwardMap = new Map();
  outwards.forEach(o => {
    if (o._id.inwardId) {
      const chamberKey = o._id.chamberName || o._id.chamberNo;
      const key = `${o._id.inwardId.toString()}_${chamberKey}_${o._id.floorNo}_${o._id.stackNo}`;
      outwardMap.set(key, { out: o.totalOutward });
    }
  });

  const availableInwards = inwards.map((inward: any) => {
    if (!inward.stackAllocations) return null;
    
    // Merge duplicate stack allocations to handle legacy data with duplicate stacks
    const mergedAllocations = new Map();
    inward.stackAllocations.forEach((alloc: any) => {
      const chamberKey = alloc.chamberName || alloc.chamberNo;
      const k = `${chamberKey}_${alloc.floorNo}_${alloc.stackNo}`;
      if (mergedAllocations.has(k)) {
         const existing = mergedAllocations.get(k);
         existing.allocatedWeight += (alloc.allocatedWeight || 0);
         existing.bagsCount += (alloc.bagsCount || 0);
      } else {
         mergedAllocations.set(k, {
           chamberName: alloc.chamberName,
           chamberNo: alloc.chamberNo,
           floorNo: alloc.floorNo,
           stackNo: alloc.stackNo,
           allocatedWeight: alloc.allocatedWeight || 0,
           bagsCount: alloc.bagsCount || 0
         });
      }
    });
    
    let totalAvailableQty = 0;
    const availableAllocations: any[] = [];
    
    Array.from(mergedAllocations.values()).forEach((alloc: any) => {
      const chamberKey = alloc.chamberName || alloc.chamberNo;
      const key = `${inward._id.toString()}_${chamberKey}_${alloc.floorNo}_${alloc.stackNo}`;
      const outData = outwardMap.get(key) || { out: 0 };
      const availableQty = Math.max(0, alloc.allocatedWeight - outData.out);
      
      if (availableQty > 0) {
        totalAvailableQty += availableQty;
        availableAllocations.push({
          chamberName: alloc.chamberName,
          chamberNo: alloc.chamberNo,
          floorNo: alloc.floorNo,
          stackNo: alloc.stackNo,
          allocatedWeight: alloc.allocatedWeight,
          bagsCount: alloc.bagsCount,
          availableQty
        });
      }
    });
    
    if (totalAvailableQty > 0) {
      return { 
        ...inward,
        uniqueKey: inward._id.toString(),
        availableQty: totalAvailableQty,
        availableAllocations 
      };
    }
    
    return null;
  }).filter(Boolean);

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
      data.chamberName || data.chamberNo?.toString(),
      data.floorNo,
      data.stackNo
    );
    
    const adjustedAvailableStock = stockInfo.availableStock;
    if (data.quantityKg > adjustedAvailableStock) {
      return { success: false, error: `Quantity exceeds available stock. Available: ${adjustedAvailableStock} Kg` };
    }

    let rentRs = 0;
    let rentReason = '';
    const commodity = await ColdCommodity.findById(data.commodityId);
    const outDate = data.date ? new Date(data.date) : new Date();
    
    if (commodity && commodity.seasonalPrices && commodity.seasonalPrices.length > 0) {
      const outTime = outDate.getTime();
      const season = commodity.seasonalPrices.find((s: any) => outTime >= new Date(s.fromDate).getTime() && outTime <= new Date(s.toDate).getTime()) || commodity.seasonalPrices[0];
      
      if (season) {
        const bagsLarge = Number(data.bagsCount) || 0;
        const bagsSmall = Number(data.jin) || 0;
        const bagsMixed = Number(data.mixed) || 0;
        const totalBags = bagsLarge + bagsSmall + bagsMixed;
        const quantityKg = Number(data.quantityKg) || 0;

        let largeWeight = 0, smallWeight = 0, mixedWeight = 0;
        if (totalBags > 0) {
          largeWeight = (bagsLarge / totalBags) * quantityKg;
          smallWeight = (bagsSmall / totalBags) * quantityKg;
          mixedWeight = (bagsMixed / totalBags) * quantityKg;
        } else {
          largeWeight = quantityKg; // Fallback if bags are 0
        }

        let pLarge = 0, pSmall = 0, pMixed = 0;

        if (commodity.priceType === 'Different Price') {
          pLarge = season.priceLarge || 0;
          pSmall = season.priceSmall || 0;
          pMixed = season.priceMixed || 0;
          if (!pLarge && !pSmall && !pMixed) rentReason = 'Rates not found for any bag types';
        } else {
          // Same Price
          pLarge = season.pricePerKg || 0;
          pSmall = season.pricePerKg || 0;
          pMixed = season.pricePerKg || 0;
          if (!pLarge) rentReason = 'Price Per Kg not set';
        }

        if (commodity.gradingType === 'Wet') {
          const rateLarge = (largeWeight / 81) * pLarge * 4;
          const rateSmall = (smallWeight / 81) * pSmall * 4;
          const rateMixed = (mixedWeight / 81) * pMixed * 4;
          rentRs = rateLarge + rateSmall + rateMixed;
        } else {
          const rateLarge = largeWeight * pLarge;
          const rateSmall = smallWeight * pSmall;
          const rateMixed = mixedWeight * pMixed;
          rentRs = rateLarge + rateSmall + rateMixed;
        }
      } else {
        rentReason = 'Seasonal price not found for date';
      }
    } else {
      rentReason = 'Commodity pricing not configured';
    }

    if (data.grade === '') delete data.grade;

    const outward = await ColdOutward.create(appendOwnership({
      ...data,
      totalBags: (Number(data.bagsCount) || 0) + (Number(data.jin) || 0) + (Number(data.mixed) || 0),
      serviceType: data.serviceType,
      serviceChargeType: data.serviceChargeType,
      serviceRate: data.serviceRate,
      serviceAmount: data.serviceAmount,
      rentRs,
      rentReason,
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
        item.chamberName || item.chamberNo?.toString(),
        item.floorNo,
        item.stackNo
      );
      
      const adjustedAvailableStock = stockInfo.availableStock;
      if (item.quantityKg > adjustedAvailableStock) {
        return { success: false, error: `Quantity exceeds available stock for one of the items. Available: ${adjustedAvailableStock} Kg` };
      }

      let rentRs = 0;
      let rentReason = '';
      const commodity = await ColdCommodity.findById(item.commodityId);
      const outDate = payload.date ? new Date(payload.date) : new Date();
      
      if (commodity && commodity.seasonalPrices && commodity.seasonalPrices.length > 0) {
        const outTime = outDate.getTime();
        const season = commodity.seasonalPrices.find((s: any) => outTime >= new Date(s.fromDate).getTime() && outTime <= new Date(s.toDate).getTime()) || commodity.seasonalPrices[0];
        
        if (season) {
          const bagsLarge = Number(item.bagsCount) || 0;
          const bagsSmall = Number(item.jin) || 0;
          const bagsMixed = Number(item.mixed) || 0;
          const totalBags = bagsLarge + bagsSmall + bagsMixed;
          const quantityKg = Number(item.quantityKg) || 0;

          let largeWeight = 0, smallWeight = 0, mixedWeight = 0;
          if (totalBags > 0) {
            largeWeight = (bagsLarge / totalBags) * quantityKg;
            smallWeight = (bagsSmall / totalBags) * quantityKg;
            mixedWeight = (bagsMixed / totalBags) * quantityKg;
          } else {
            largeWeight = quantityKg; // Fallback
          }

          let pLarge = 0, pSmall = 0, pMixed = 0;

          if (commodity.priceType === 'Different Price') {
            pLarge = season.priceLarge || 0;
            pSmall = season.priceSmall || 0;
            pMixed = season.priceMixed || 0;
            if (!pLarge && !pSmall && !pMixed) rentReason = 'Rates not found for any bag types';
          } else {
            pLarge = season.pricePerKg || 0;
            pSmall = season.pricePerKg || 0;
            pMixed = season.pricePerKg || 0;
            if (!pLarge) rentReason = 'Price Per Kg not set';
          }

          if (commodity.gradingType === 'Wet') {
            const rateLarge = (largeWeight / 81) * pLarge * 4;
            const rateSmall = (smallWeight / 81) * pSmall * 4;
            const rateMixed = (mixedWeight / 81) * pMixed * 4;
            rentRs = rateLarge + rateSmall + rateMixed;
          } else {
            const rateLarge = largeWeight * pLarge;
            const rateSmall = smallWeight * pSmall;
            const rateMixed = mixedWeight * pMixed;
            rentRs = rateLarge + rateSmall + rateMixed;
          }
        } else {
          rentReason = 'Seasonal price not found for date';
        }
      } else {
        rentReason = 'Commodity pricing not configured';
      }

      if (item.grade === '') delete item.grade;

      const outward = await ColdOutward.create(appendOwnership({
        ...item,
        batchId: payload.batchId || payload.batchId,
        date: outDate,
        totalBags: (Number(item.bagsCount) || 0) + (Number(item.jin) || 0) + (Number(item.mixed) || 0),
        rentRs,
        rentReason,
        clientId: payload.clientId,
        truckNo: payload.truckNo,
        weighbridgeSlipNo: payload.weighbridgeSlipNo,
        grossWeight: payload.grossWeight,
        emptyWeight: payload.emptyWeight,
        kataBharati: payload.kataBharati,
        referencePersons: payload.referencePersons,
        remarks: payload.remarks,
        note: payload.note,
        serviceType: item.serviceType,
        serviceChargeType: item.serviceChargeType,
        serviceRate: item.serviceRate,
        serviceAmount: item.serviceAmount,
      }, session));
      createdOutwards.push(outward);
    }
    
    revalidatePath('/cold/outward');
    return { success: true, data: JSON.parse(JSON.stringify(createdOutwards)) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
