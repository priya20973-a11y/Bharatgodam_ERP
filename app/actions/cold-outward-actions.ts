'use server';

import connectToDatabase from '@/lib/mongoose';
import ColdOutward from '@/lib/models/ColdOutward';
import ColdInward from '@/lib/models/ColdInward';
import ColdTransfer from '@/lib/models/ColdTransfer';
import ColdCommodity from '@/lib/models/ColdCommodity';
import { generateReceiptNumber } from '@/lib/receipt-generator';
import { revalidatePath } from 'next/cache';
import { hasPermission } from '@/lib/permissions';
import { appendOwnership, getTenantFilter, requireSession, getWarehouseFilter } from '@/lib/ownership';
import mongoose from 'mongoose';
import { formatChamberName, formatFloorName } from '@/lib/utils/cold-naming';
import { calculatePerMonthRent } from '@/lib/utils/cold-rent-calculator';
import { logColdActivity } from '@/lib/cold-logger';

export async function getColdOutwards() {
  await connectToDatabase();
  const session = await requireSession();
  
  const outwards = await ColdOutward.find({ ...getTenantFilter(session), ...getWarehouseFilter(session) })
    .populate('clientId', 'name')
    .populate('commodityId', 'name type')
    .populate('warehouseId', 'name warehouseId')
    .sort({ date: -1, createdAt: -1 });
    
  const groups: any[] = [];
  
  for (const out of JSON.parse(JSON.stringify(outwards))) {
    let existingGroup = null;
    
    if (out.batchId) {
      existingGroup = groups.find(g => g.batchId === out.batchId);
    } else {
      const outTime = new Date(out.createdAt).getTime();
      existingGroup = groups.find(g => {
        if (g.batchId) return false;
        
        const gClientId = g.clientId?._id?.toString() || g.clientId?.toString();
        const oClientId = out.clientId?._id?.toString() || out.clientId?.toString();
        if (gClientId !== oClientId) return false;
        
        const gTime = new Date(g.createdAt).getTime();
        return Math.abs(gTime - outTime) <= 60000;
      });
    }

    if (existingGroup) {
      existingGroup.items.push(out);
      existingGroup.quantityKg += out.quantityKg;
      existingGroup.bagsCount += out.bagsCount;
      existingGroup.isBatch = true;
    } else {
      groups.push({
        ...out,
        items: [out],
        quantityKg: out.quantityKg,
        bagsCount: out.bagsCount,
        isBatch: !!out.batchId
      });
    }
  }
    
  return groups;
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

export async function getAvailableInwardsForClient(clientId: string, isWarehouse: boolean = false) {
  await connectToDatabase();
  const session = await requireSession();
  const tenantFilter = getTenantFilter(session);

  let inwardMatch: any;
  let outwardMatch: any;

  if (isWarehouse) {
    inwardMatch = { warehouseId: new mongoose.Types.ObjectId(clientId), ...tenantFilter };
    outwardMatch = { clientId: new mongoose.Types.ObjectId(clientId), clientModel: 'ColdWarehouse', ...tenantFilter };
  } else {
    inwardMatch = { clientId: new mongoose.Types.ObjectId(clientId), ...tenantFilter };
    outwardMatch = { 
      clientId: new mongoose.Types.ObjectId(clientId), 
      $or: [{ clientModel: 'Client' }, { clientModel: { $exists: false } }],
      ...tenantFilter 
    };
  }

  const inwards = await ColdInward.find(inwardMatch)
    .populate('commodityId', 'name type unit')
    .populate('warehouseId')
    .sort({ date: -1, createdAt: -1 })
    .lean();

  const outwards = await ColdOutward.aggregate([
    { $match: outwardMatch },
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

  const transfers = await ColdTransfer.find({
    fromClientId: new mongoose.Types.ObjectId(clientId),
    ...tenantFilter
  }).lean();

  const transferMap = new Map();
  transfers.forEach((t: any) => {
    if (t.originalInwardId && t.stackAllocations) {
      t.stackAllocations.forEach((alloc: any) => {
        const chamberKey = alloc.chamberName || alloc.chamberNo;
        const key = `${t.originalInwardId.toString()}_${chamberKey}_${alloc.floorNo}_${alloc.stackNo}`;
        const existing = transferMap.get(key) || { transferredQty: 0 };
        transferMap.set(key, {
          transferredQty: existing.transferredQty + (alloc.allocatedWeight || 0)
        });
      });
    }
  });

  const availableInwards = inwards.map((inward: any) => {
    if (!inward.stackAllocations) return null;
    
    // Merge duplicate stack allocations to handle legacy data with duplicate stacks
    const mergedAllocations = new Map();
    inward.stackAllocations.forEach((alloc: any) => {
      if (isWarehouse) {
        if (alloc.stockType !== 'Purchase') return;
      } else {
        if (alloc.stockType === 'Purchase') return;
      }

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
      const transData = transferMap.get(key) || { transferredQty: 0 };
      const availableQty = Math.max(0, alloc.allocatedWeight - outData.out - transData.transferredQty);
      
      if (availableQty > 0) {
        totalAvailableQty += availableQty;
        let finalChamberName = alloc.chamberName;
        let finalFloorName = formatFloorName(null, alloc.floorNo);
        let finalStackName = `Stack ${alloc.stackNo}`;
        
        if (inward.warehouseId && inward.warehouseId.chambers) {
          const chamber = inward.warehouseId.chambers.find((c: any) => (c.name || c.chamberNo?.toString()) === (alloc.chamberName || alloc.chamberNo?.toString()));
          if (chamber) {
            finalChamberName = chamber.name || finalChamberName;
            const floor = chamber.floors?.find((f: any) => f.floorNo === alloc.floorNo);
            if (floor) {
              finalFloorName = floor.name || finalFloorName;
              const stack = floor.stacks?.find((s: any) => s.stackNo === alloc.stackNo);
              if (stack) {
                finalStackName = stack.name || finalStackName;
              }
            }
          }
        }

        availableAllocations.push({
          chamberName: finalChamberName,
          chamberNo: alloc.chamberNo,
          floorName: finalFloorName,
          floorNo: alloc.floorNo,
          stackName: finalStackName,
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
    
    if (!data.inwardId) {
      return { success: false, error: 'Cannot create outward: Inward ID is required.' };
    }

    let inward: any = null;
    if (data.inwardId) {
      inward = await ColdInward.findById(data.inwardId);
      if (!inward) {
        return { success: false, error: 'Cannot create outward: Inward not found.' };
      }
      
      const outwards = await ColdOutward.aggregate([
        { $match: { inwardId: inward._id } },
        { $group: { _id: null, totalOut: { $sum: '$quantityKg' }, totalBags: { $sum: '$bagsCount' } } }
      ]);
      const totalOutward = outwards[0]?.totalOut || 0;
      const totalOutwardBags = outwards[0]?.totalBags || 0;
      
      const currentRemaining = inward.quantityKg - totalOutward;
      
      if (currentRemaining <= 0) {
        if (inward.status !== 'Completed') {
          inward.status = 'Completed';
          inward.remainingQuantityKg = 0;
          await inward.save();
        }
        return { success: false, error: 'Cannot create outward: Inward is already completed.' };
      }
      
      if (data.quantityKg > currentRemaining) {
        return { success: false, error: `Quantity exceeds the remaining stock for this specific Inward. Available: ${currentRemaining} Kg` };
      }
      
      const remainingKg = currentRemaining - data.quantityKg;
      const remainingBags = (inward.bagsCount - totalOutwardBags) - data.bagsCount;
      
      inward.remainingQuantityKg = Math.max(0, remainingKg);
      inward.remainingBagsCount = Math.max(0, remainingBags);
      inward.status = inward.remainingQuantityKg <= 0 ? 'Completed' : 'Partial';
      await inward.save();
    }

    let rentRs = 0;
    let rentReason = '';
    let rentBreakdown: any = null;
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

        let pLarge = 0, pSmall = 0, pMixed = 0;
        let baseUnitRate = 0;

        if (commodity.priceType === 'Different Price') {
          pLarge = season.priceLarge || 0;
          pSmall = season.priceSmall || 0;
          pMixed = season.priceMixed || 0;
          baseUnitRate = pLarge; // Fallback for schema
          if (!pLarge && !pSmall && !pMixed) rentReason = 'Rates not found for any bag types';
        } else {
          // Same Price
          pLarge = season.pricePerKg || 0;
          pSmall = season.pricePerKg || 0;
          pMixed = season.pricePerKg || 0;
          baseUnitRate = season.pricePerKg || 0;
          if (!pLarge) rentReason = 'Price Per Unit not set';
        }

        // Store the base unit rate on the data object so it gets saved to the model
        data.unitRate = baseUnitRate;

        // Rent Calculation
        const unit = (commodity.unit || 'KG').toUpperCase();
        const isKg = (unit === 'KG' || unit === 'KILOGRAM' || unit === 'KGS') && commodity.rentCalculationOn !== 'Bag';

        if (isKg) {
          if (commodity.priceType === 'Different Price') {
            // Even if unit is KG, 'Different Price' might still apply per kg proportionally, but here we just fallback to the previous logic 
            // Wait, previous logic for createColdOutward was actually doing bagsLarge * pLarge
            rentRs = (bagsLarge * pLarge) + (bagsSmall * pSmall) + (bagsMixed * pMixed);
          } else {
            rentRs = quantityKg * baseUnitRate;
          }
        } else {
          // Unit != KG -> Calculate using storage units
          if (commodity.priceType === 'Different Price') {
            rentRs = (bagsLarge * pLarge) + (bagsSmall * pSmall) + (bagsMixed * pMixed);
          } else {
            rentRs = totalBags * baseUnitRate;
          }
        }

        if (commodity.rentType === 'Per Month') {
          const perMonthResult = calculatePerMonthRent({
            inwardDate: inward.date,
            outwardDate: outDate,
            seasonalPrices: commodity.seasonalPrices,
            priceType: commodity.priceType || 'Same Price',
            unit: commodity.unit || 'KG',
            rentCalculationOn: commodity.rentCalculationOn,
            gradingType: commodity.gradingType,
            quantityKg: Number(data.quantityKg) || 0,
            bagsLarge: Number(data.bagsCount) || 0,
            bagsSmall: Number(data.jin) || 0,
            bagsMixed: Number(data.mixed) || 0,
            totalBags: (Number(data.bagsCount) || 0) + (Number(data.jin) || 0) + (Number(data.mixed) || 0),
          });
          rentRs = perMonthResult.totalRent;
          rentBreakdown = perMonthResult.monthBreakdown;
          if (!rentReason) rentReason = perMonthResult.rentReason;
        }
      } else {
        rentReason = 'Seasonal price not found for date';
      }
    } else {
      rentReason = 'Commodity pricing not configured';
    }

    if (data.grade === '') delete data.grade;

    const outwardReceiptNumber = await generateReceiptNumber(data.warehouseId, 'outward', data.chamberName || data.chamberNo?.toString());

    const outward = await ColdOutward.create(appendOwnership({
      ...data,
      receiptNumber: outwardReceiptNumber,
      totalBags: (Number(data.bagsCount) || 0) + (Number(data.jin) || 0) + (Number(data.mixed) || 0),
      clientModel: data.clientModel || 'Client',
      serviceType: data.serviceType,
      serviceChargeType: data.serviceChargeType,
      serviceRate: data.serviceRate,
      serviceAmount: data.serviceAmount,
      gradingApplied: data.gradingApplied,
      gradingChargeType: data.gradingChargeType,
      gradingRate: data.gradingRate,
      gradingCharge: data.gradingCharge,
      rentRs,
      rentReason,
      rentBreakdown,
      unitRate: data.unitRate,
      date: outDate,
      netWeightLoss: data.netWeightLoss,
      unit: commodity?.unit || 'KG',
    }, session));
    
    await logColdActivity({
      actionType: 'CREATE',
      module: 'Outward',
      recordId: outward._id.toString(),
      description: `Created Outward Receipt: ${outwardReceiptNumber}`,
      newValue: JSON.parse(JSON.stringify(outward)),
      sessionFallback: session
    });

    revalidatePath('/cold/outward');
    revalidatePath('/cold/floor-mapping');
    revalidatePath('/cold/inward');
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

    const firstItem = payload.items[0];
    const warehouseId = firstItem.warehouseId || payload.warehouseId;
    const batchReceiptNumber = await generateReceiptNumber(warehouseId, 'outward', firstItem.chamberName || firstItem.chamberNo?.toString());

    for (const item of payload.items) {
      if (!item.inwardId) {
        return { success: false, error: 'Cannot create outward: Inward ID is required for all items.' };
      }

      let inward: any = null;
      if (item.inwardId) {
        inward = await ColdInward.findById(item.inwardId);
        if (!inward) {
          return { success: false, error: 'Cannot create outward: Inward not found.' };
        }
        
        const outwards = await ColdOutward.aggregate([
          { $match: { inwardId: inward._id } },
          { $group: { _id: null, totalOut: { $sum: '$quantityKg' }, totalBags: { $sum: '$bagsCount' } } }
        ]);
        const totalOutward = outwards[0]?.totalOut || 0;
        const totalOutwardBags = outwards[0]?.totalBags || 0;
        
        const currentRemaining = inward.quantityKg - totalOutward;
        
        if (currentRemaining <= 0) {
          if (inward.status !== 'Completed') {
            inward.status = 'Completed';
            inward.remainingQuantityKg = 0;
            await inward.save();
          }
          return { success: false, error: 'Cannot create outward: Inward is already completed.' };
        }
        
        if (item.quantityKg > currentRemaining) {
          return { success: false, error: `Quantity exceeds the remaining stock for this specific Inward. Available: ${currentRemaining} Kg` };
        }
        
        const remainingKg = currentRemaining - item.quantityKg;
        const remainingBags = (inward.bagsCount - totalOutwardBags) - item.bagsCount;
        
        inward.remainingQuantityKg = Math.max(0, remainingKg);
        inward.remainingBagsCount = Math.max(0, remainingBags);
        inward.status = inward.remainingQuantityKg <= 0 ? 'Completed' : 'Partial';
        await inward.save();
      }

      let rentRs = 0;
      let rentReason = '';
      let rentBreakdown: any = null;
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

          let pLarge = 0, pSmall = 0, pMixed = 0;
          let baseUnitRate = 0;

          if (commodity.priceType === 'Different Price') {
            pLarge = season.priceLarge || 0;
            pSmall = season.priceSmall || 0;
            pMixed = season.priceMixed || 0;
            baseUnitRate = pLarge;
            if (!pLarge && !pSmall && !pMixed) rentReason = 'Rates not found for any bag types';
          } else {
            baseUnitRate = season.pricePerKg || 0;
            if (!baseUnitRate) rentReason = 'Price Per Unit not set';
          }

          const unit = (commodity.unit || 'KG').toUpperCase();
          const isKg = (unit === 'KG' || unit === 'KILOGRAM' || unit === 'KGS') && commodity.rentCalculationOn !== 'Bag';

          if (isKg) {
            let largeWeight = 0, smallWeight = 0, mixedWeight = 0;
            if (totalBags > 0) {
              largeWeight = (bagsLarge / totalBags) * quantityKg;
              smallWeight = (bagsSmall / totalBags) * quantityKg;
              mixedWeight = (bagsMixed / totalBags) * quantityKg;
            } else {
              largeWeight = quantityKg; // Fallback
            }

            if (commodity.priceType === 'Different Price') {
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
              rentRs = quantityKg * baseUnitRate;
            }
          } else {
            // Storage Unit != KG
            if (commodity.priceType === 'Different Price') {
              rentRs = (bagsLarge * pLarge) + (bagsSmall * pSmall) + (bagsMixed * pMixed);
            } else {
              rentRs = totalBags * baseUnitRate;
            }
          }

          if (commodity.rentType === 'Per Month') {
            const perMonthResult = calculatePerMonthRent({
              inwardDate: inward.date,
              outwardDate: outDate,
              seasonalPrices: commodity.seasonalPrices,
              priceType: commodity.priceType || 'Same Price',
              unit: commodity.unit || 'KG',
              rentCalculationOn: commodity.rentCalculationOn,
              gradingType: commodity.gradingType,
              quantityKg: Number(item.quantityKg) || 0,
              bagsLarge: Number(item.bagsCount) || 0,
              bagsSmall: Number(item.jin) || 0,
              bagsMixed: Number(item.mixed) || 0,
              totalBags: (Number(item.bagsCount) || 0) + (Number(item.jin) || 0) + (Number(item.mixed) || 0),
            });
            rentRs = perMonthResult.totalRent;
            rentBreakdown = perMonthResult.monthBreakdown;
            if (!rentReason) rentReason = perMonthResult.rentReason;
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
        receiptNumber: batchReceiptNumber,
        batchId: payload.batchId || batchId,
        date: outDate,
        totalBags: (Number(item.bagsCount) || 0) + (Number(item.jin) || 0) + (Number(item.mixed) || 0),
        rentRs,
        rentReason,
        rentBreakdown,
        clientId: payload.clientId,
        clientModel: payload.clientModel || 'Client',
        truckNo: payload.truckNo,
        vehicleType: payload.vehicleType,
        weighbridgeSlipNo: payload.weighbridgeSlipNo,
        weighbridgeCharge: payload.weighbridgeCharge,
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
        gradingApplied: item.gradingApplied,
        gradingChargeType: item.gradingChargeType,
        gradingRate: item.gradingRate,
        gradingCharge: item.gradingCharge,
        netWeightLoss: item.netWeightLoss,
        unit: commodity?.unit || 'KG',
      }, session));
      createdOutwards.push(outward);
      
      await logColdActivity({
        actionType: 'CREATE',
        module: 'Bulk Upload',
        recordId: outward._id.toString(),
        description: `Created Outward Receipt (Batch): ${batchReceiptNumber}`,
        newValue: JSON.parse(JSON.stringify(outward)),
        sessionFallback: session
      });
    }
    
    revalidatePath('/cold/outward');
    revalidatePath('/cold/floor-mapping');
    revalidatePath('/cold/inward');
    return { success: true, data: JSON.parse(JSON.stringify(createdOutwards)) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function resolveQRForColdOutward(qrCodeString: string) {
  await connectToDatabase();
  const session = await requireSession();
  const tenantFilter = getTenantFilter(session);

  if (!qrCodeString || typeof qrCodeString !== 'string') {
    return { success: false, error: 'Invalid QR code scanned.' };
  }

  const trimmed = qrCodeString.trim();

  const parseUrlPath = (str: string) => {
    try {
      if (str.startsWith('http://') || str.startsWith('https://')) {
        const url = new URL(str);
        return url.pathname;
      }
    } catch (e) {}
    return str;
  };

  const path = parseUrlPath(trimmed);
  const isTransferUrl = path.includes('/qr/transfer/');
  const isInwardUrl = path.includes('/qr/inward/') || path.includes('/cold/inward/qr/');

  let idOrQrId = trimmed;
  if (isTransferUrl) {
    idOrQrId = path.split('/qr/transfer/')[1]?.split('?')[0]?.split('/')[0] || trimmed;
  } else if (isInwardUrl) {
    if (path.includes('/qr/inward/')) {
      idOrQrId = path.split('/qr/inward/')[1]?.split('?')[0]?.split('/')[0] || trimmed;
    } else if (path.includes('/cold/inward/qr/')) {
      idOrQrId = path.split('/cold/inward/qr/')[1]?.split('?')[0]?.split('/')[0] || trimmed;
    }
  }

  ColdCommodity.init();
  ColdInward.init();
  ColdTransfer.init();

  // 1. Try ColdTransfer lookup if URL specifies transfer or ID format matches
  let transfer: any = null;
  if (isTransferUrl || (mongoose.Types.ObjectId.isValid(idOrQrId) && !isInwardUrl)) {
    if (mongoose.Types.ObjectId.isValid(idOrQrId)) {
      transfer = await ColdTransfer.findOne({ _id: idOrQrId, ...tenantFilter })
        .populate('fromClientId', 'name')
        .populate('toClientId', 'name')
        .populate('commodityId', 'name type unit')
        .populate('warehouseId', 'name chambers')
        .lean();
    }
  }

  if (transfer) {
    const newOwnerId = transfer.toClientId._id ? transfer.toClientId._id.toString() : transfer.toClientId.toString();
    const newOwnerModel = transfer.toClientModel || 'Client';

    let newInward: any = null;
    if (transfer.newInwardId) {
      newInward = await ColdInward.findById(transfer.newInwardId)
        .populate('commodityId', 'name type unit')
        .populate('warehouseId')
        .lean();
    }

    if (!newInward && transfer.originalInwardId) {
      newInward = await ColdInward.findById(transfer.originalInwardId)
        .populate('commodityId', 'name type unit')
        .populate('warehouseId')
        .lean();
    }

    if (!newInward) {
      return { success: false, error: 'Associated inward stock record for transfer not found.' };
    }

    const availableForNewOwner = await getAvailableInwardsForClient(newOwnerId, newOwnerModel === 'ColdWarehouse');
    const matchedInward = availableForNewOwner.find((inv: any) => inv._id === newInward._id.toString());

    if (!matchedInward || matchedInward.availableQty <= 0) {
      return { 
        success: false, 
        error: `Transferred stock for ${transfer.toClientId?.name || 'New Client'} has no available stock remaining.`,
        clientName: transfer.toClientId?.name,
        clientId: newOwnerId,
        clientModel: newOwnerModel
      };
    }

    return {
      success: true,
      qrType: 'transfer',
      clientId: newOwnerId,
      clientModel: newOwnerModel,
      clientName: transfer.toClientId?.name,
      inward: matchedInward,
      message: `Ownership Transfer QR loaded for ${transfer.toClientId?.name}. Available transferred stock: ${matchedInward.availableQty.toFixed(2)} KG.`
    };
  }

  // 2. Try ColdInward lookup by qrId or _id
  let inward: any = null;
  if (isInwardUrl || !isTransferUrl) {
    inward = await ColdInward.findOne({ qrId: idOrQrId, ...tenantFilter })
      .populate('clientId', 'name')
      .populate('commodityId', 'name type unit')
      .populate('warehouseId')
      .lean();

    if (!inward && mongoose.Types.ObjectId.isValid(idOrQrId)) {
      inward = await ColdInward.findOne({ _id: idOrQrId, ...tenantFilter })
        .populate('clientId', 'name')
        .populate('commodityId', 'name type unit')
        .populate('warehouseId')
        .lean();
    }
  }

  if (inward) {
    const clientId = inward.clientId._id ? inward.clientId._id.toString() : inward.clientId.toString();
    const isWarehouse = false;

    const availableInwards = await getAvailableInwardsForClient(clientId, isWarehouse);
    const matchedInward = availableInwards.find((inv: any) => inv._id === inward._id.toString());

    if (!matchedInward || matchedInward.availableQty <= 0) {
      return {
        success: false,
        error: `Inward receipt for ${inward.clientId?.name || 'Client'} has no remaining available stock after outwards/transfers.`,
        clientName: inward.clientId?.name,
        clientId: clientId,
        clientModel: 'Client'
      };
    }

    return {
      success: true,
      qrType: 'inward',
      clientId: clientId,
      clientModel: 'Client',
      clientName: inward.clientId?.name,
      inward: matchedInward,
      message: `Inward Receipt QR loaded for ${inward.clientId?.name}. Remaining available stock: ${matchedInward.availableQty.toFixed(2)} KG.`
    };
  }

  return { success: false, error: 'No matching Inward or Ownership Transfer record found for scanned QR code.' };
}
