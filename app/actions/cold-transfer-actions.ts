'use server';

import mongoose from 'mongoose';
import connectToDatabase from '@/lib/mongoose';
import ColdInward from '@/lib/models/ColdInward';
import ColdOutward from '@/lib/models/ColdOutward';
import ColdTransfer from '@/lib/models/ColdTransfer';
import ColdCommodity from '@/lib/models/ColdCommodity';
import ColdWarehouse from '@/lib/models/ColdWarehouse';
import { revalidatePath } from 'next/cache';
import { getTenantFilter, requireSession, appendOwnership } from '@/lib/ownership';
import { getDb } from '@/lib/mongodb';
import { requireWspActionPermission } from '@/lib/server-wsp-permissions';
import { hasPermission } from '@/lib/permissions';
import { logColdActivity } from '@/lib/cold-logger';

export async function getAvailableInwardsForTransfer(clientId: string, transferType: 'Self' | 'Purchase' = 'Self') {
  await connectToDatabase();
  const session = await requireSession();
  const tenantFilter = getTenantFilter(session);
  // Ensure models are registered to avoid MissingSchemaError when populating
  ColdCommodity.init();
  ColdWarehouse.init();

  const inwards = await ColdInward.find({ clientId: new mongoose.Types.ObjectId(clientId), ...tenantFilter })
    .populate('commodityId', 'name type')
    .populate('warehouseId', 'name chambers')
    .sort({ date: -1, createdAt: -1 })
    .lean();

  const outwards = await ColdOutward.aggregate([
    { 
      $match: { 
        clientId: new mongoose.Types.ObjectId(clientId), 
        remarks: { $nin: ['Ownership Transfer Out', 'Ownership Transfer Purchase'] },
        ...tenantFilter 
      } 
    },
    { $group: { 
        _id: { inwardId: '$inwardId', chamberName: '$chamberName', chamberNo: '$chamberNo', floorNo: '$floorNo', stackNo: '$stackNo' }, 
        totalOutward: { $sum: '$quantityKg' },
        totalBagsOut: { $sum: '$bagsCount' }
      } 
    }
  ]);

  const outwardMap = new Map();
  outwards.forEach(o => {
    if (o._id.inwardId) {
      const chamberKey = o._id.chamberName || o._id.chamberNo;
      const key = `${o._id.inwardId.toString()}_${chamberKey}_${o._id.floorNo}_${o._id.stackNo}`;
      outwardMap.set(key, { out: o.totalOutward, bagsOut: o.totalBagsOut });
    }
  });

  const transfers = await ColdTransfer.find({
    fromClientId: new mongoose.Types.ObjectId(clientId),
    transferType: { $ne: 'Purchase' },
    ...tenantFilter
  }).lean();

  const transferMap = new Map();
  transfers.forEach((t: any) => {
    if (t.originalInwardId && t.stackAllocations) {
      t.stackAllocations.forEach((alloc: any) => {
        const chamberKey = alloc.chamberName || alloc.chamberNo;
        const key = `${t.originalInwardId.toString()}_${chamberKey}_${alloc.floorNo}_${alloc.stackNo}`;
        const existing = transferMap.get(key) || { transferredQty: 0, transferredBags: 0 };
        transferMap.set(key, {
          transferredQty: existing.transferredQty + (alloc.allocatedWeight || 0),
          transferredBags: existing.transferredBags + (alloc.bagsCount || 0)
        });
      });
    }
  });

  const availableInwards = inwards.map((inward: any) => {
    if (!inward.stackAllocations) return null;
    
    const mergedAllocations = new Map();
    inward.stackAllocations.forEach((alloc: any) => {
      // Filter by stockType (only Self stock can be transferred)
      const stockType = alloc.stockType || inward.stockType || 'Self';
      if (stockType !== 'Self') return;

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
           bagsCount: alloc.bagsCount || 0,
           stockType: stockType
         });
      }
    });
    
    let totalAvailableQty = 0;
    let totalAvailableBags = 0;
    const availableAllocations: any[] = [];
    
    Array.from(mergedAllocations.values()).forEach((alloc: any) => {
      const chamberKey = alloc.chamberName || alloc.chamberNo;
      const key = `${inward._id.toString()}_${chamberKey}_${alloc.floorNo}_${alloc.stackNo}`;
      const outData = outwardMap.get(key) || { out: 0, bagsOut: 0 };
      const transData = transferMap.get(key) || { transferredQty: 0, transferredBags: 0 };

      const availableQty = Math.max(0, alloc.allocatedWeight - outData.out - transData.transferredQty);
      const availableBags = Math.max(0, alloc.bagsCount - outData.bagsOut - transData.transferredBags);
      
      if (availableQty > 0) {
        totalAvailableQty += availableQty;
        totalAvailableBags += availableBags;
        availableAllocations.push({
          chamberName: alloc.chamberName,
          chamberNo: alloc.chamberNo,
          floorNo: alloc.floorNo,
          stackNo: alloc.stackNo,
          allocatedWeight: availableQty,
          bagsCount: availableBags,
          stockType: alloc.stockType
        });
      }
    });
    
    if (totalAvailableQty > 0) {
      return { 
        ...inward,
        uniqueKey: inward._id.toString(),
        availableQty: totalAvailableQty,
        availableBags: totalAvailableBags,
        availableAllocations 
      };
    }
    
    return null;
  }).filter(Boolean);

  return JSON.parse(JSON.stringify(availableInwards));
}

export async function searchAvailableInwardsForTransfer(query: string, searchBy: 'receipt' | 'lot') {
  if (!query || typeof query !== 'string') return [];
  
  await connectToDatabase();
  const session = await requireSession();
  const tenantFilter = getTenantFilter(session);
  ColdCommodity.init();
  ColdWarehouse.init();

  const terms = query.split(/[\s,]+/).filter(Boolean);
  if (terms.length === 0) return [];

  const regexArray = terms.map(term => new RegExp(`^${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'));

  const searchFilter = searchBy === 'receipt' 
    ? { receiptNumber: { $in: regexArray } }
    : { lotNo: { $in: regexArray } };

  const inwards = await ColdInward.find({ ...searchFilter, ...tenantFilter })
    .populate('commodityId', 'name type unit')
    .populate('warehouseId', 'name chambers')
    .populate('clientId', 'name')
    .sort({ date: -1, createdAt: -1 })
    .lean();

  if (inwards.length === 0) return [];

  const inwardIds = inwards.map(i => i._id);

  const outwards = await ColdOutward.aggregate([
    { 
      $match: { 
        inwardId: { $in: inwardIds },
        remarks: { $nin: ['Ownership Transfer Out', 'Ownership Transfer Purchase'] },
        ...tenantFilter 
      } 
    },
    { $group: { 
        _id: { inwardId: '$inwardId', chamberName: '$chamberName', chamberNo: '$chamberNo', floorNo: '$floorNo', stackNo: '$stackNo' }, 
        totalOutward: { $sum: '$quantityKg' },
        totalBagsOut: { $sum: '$bagsCount' }
      } 
    }
  ]);

  const outwardMap = new Map();
  outwards.forEach(o => {
    if (o._id.inwardId) {
      const chamberKey = o._id.chamberName || o._id.chamberNo;
      const key = `${o._id.inwardId.toString()}_${chamberKey}_${o._id.floorNo}_${o._id.stackNo}`;
      outwardMap.set(key, { out: o.totalOutward, bagsOut: o.totalBagsOut });
    }
  });

  const transfers = await ColdTransfer.find({
    originalInwardId: { $in: inwardIds },
    transferType: { $ne: 'Purchase' },
    ...tenantFilter
  }).lean();

  const transferMap = new Map();
  transfers.forEach((t: any) => {
    if (t.originalInwardId && t.stackAllocations) {
      t.stackAllocations.forEach((alloc: any) => {
        const chamberKey = alloc.chamberName || alloc.chamberNo;
        const key = `${t.originalInwardId.toString()}_${chamberKey}_${alloc.floorNo}_${alloc.stackNo}`;
        const existing = transferMap.get(key) || { transferredQty: 0, transferredBags: 0 };
        transferMap.set(key, {
          transferredQty: existing.transferredQty + (alloc.allocatedWeight || 0),
          transferredBags: existing.transferredBags + (alloc.bagsCount || 0)
        });
      });
    }
  });

  const availableInwards = inwards.map((inward: any) => {
    if (!inward.stackAllocations) return null;
    
    const mergedAllocations = new Map();
    inward.stackAllocations.forEach((alloc: any) => {
      // Filter by stockType (only Self stock can be transferred)
      const stockType = alloc.stockType || inward.stockType || 'Self';
      if (stockType !== 'Self') return;

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
           bagsCount: alloc.bagsCount || 0,
           stockType: stockType
         });
      }
    });
    
    let totalAvailableQty = 0;
    let totalAvailableBags = 0;
    const availableAllocations: any[] = [];
    
    Array.from(mergedAllocations.values()).forEach((alloc: any) => {
      const chamberKey = alloc.chamberName || alloc.chamberNo;
      const key = `${inward._id.toString()}_${chamberKey}_${alloc.floorNo}_${alloc.stackNo}`;
      const outData = outwardMap.get(key) || { out: 0, bagsOut: 0 };
      const transData = transferMap.get(key) || { transferredQty: 0, transferredBags: 0 };

      const availableQty = Math.max(0, alloc.allocatedWeight - outData.out - transData.transferredQty);
      const availableBags = Math.max(0, alloc.bagsCount - outData.bagsOut - transData.transferredBags);
      
      if (availableQty > 0) {
        totalAvailableQty += availableQty;
        totalAvailableBags += availableBags;
        availableAllocations.push({
          chamberName: alloc.chamberName,
          chamberNo: alloc.chamberNo,
          floorNo: alloc.floorNo,
          stackNo: alloc.stackNo,
          allocatedWeight: availableQty,
          bagsCount: availableBags,
          stockType: alloc.stockType
        });
      }
    });
    
    if (totalAvailableQty > 0) {
      return { 
        ...inward,
        uniqueKey: inward._id.toString(),
        availableQty: totalAvailableQty,
        availableBags: totalAvailableBags,
        availableAllocations 
      };
    }
    
    return null;
  }).filter(Boolean);

  return JSON.parse(JSON.stringify(availableInwards));
}

export async function createOwnershipTransfer(data: {
  fromClientId?: string;
  toClientId: string;
  inwardId?: string;
  transferDate: string;
  transferWeight?: number;
  transferBags?: number;
  transferType?: 'Self' | 'Purchase';
  sources?: Array<{
    fromClientId: string;
    inwardId: string;
    transferWeight: number;
    transferBags: number;
  }>;
}) {
  await requireWspActionPermission('inward');
  await connectToDatabase();
  const session = await requireSession();
  
  if (!hasPermission(session, 'ownershipTransfer', 'create')) {
    throw new Error('403_FORBIDDEN: Unauthorized access to create ownership transfer');
  }

  const transferType = data.transferType || 'Self';
  const transferDateObj = new Date(data.transferDate);
  const toClientId = data.toClientId;
  
  // Normalize sources
  const sources = data.sources || [];
  if (data.inwardId && data.fromClientId && data.transferWeight !== undefined && data.transferBags !== undefined) {
    sources.push({
      fromClientId: data.fromClientId,
      inwardId: data.inwardId,
      transferWeight: data.transferWeight,
      transferBags: data.transferBags
    });
  }
  
  if (sources.length === 0) {
    return { success: false, error: 'No sources selected for transfer.' };
  }

  // Validate all sources first
  const validatedSources: any[] = [];
  for (const source of sources) {
    const availableInwards = await getAvailableInwardsForTransfer(source.fromClientId, transferType);
    const targetInward = availableInwards.find((inv: any) => inv._id.toString() === source.inwardId);

    if (!targetInward) {
      return { success: false, error: `Inward receipt not found or has 0 available stock for selected client.` };
    }

    if (targetInward.availableQty <= 0) {
      return { success: false, error: `Cannot transfer. Available stock is 0 for receipt ${targetInward.receiptNumber}.` };
    }

    if (source.transferWeight > targetInward.availableQty) {
      return { success: false, error: `Transfer weight exceeds available stock for receipt ${targetInward.receiptNumber}.` };
    }
    
    if (source.transferBags > targetInward.availableBags) {
      return { success: false, error: `Transfer bags exceed available bags for receipt ${targetInward.receiptNumber}.` };
    }
    
    validatedSources.push({
      source,
      targetInward
    });
  }

  const batchId = new mongoose.Types.ObjectId().toString();
  const createdTransferIds: string[] = [];
  
  // Create all transfers atomically
  const mongooseSession = await mongoose.startSession();
  
  try {
    await mongooseSession.withTransaction(async () => {
      for (const { source, targetInward } of validatedSources) {
        let remainingWeight = source.transferWeight;
        let remainingBags = source.transferBags;

        // 1. Distribute across available allocations
        const transferAllocations = [];
        
        for (const alloc of targetInward.availableAllocations) {
          if (remainingWeight <= 0 && remainingBags <= 0) break;
          
          const takeWeight = Math.min(alloc.allocatedWeight, remainingWeight);
          const takeBags = Math.min(alloc.bagsCount, remainingBags);
          
          if (takeWeight > 0 || takeBags > 0) {
            transferAllocations.push({
              chamberName: alloc.chamberName,
              chamberNo: alloc.chamberNo,
              floorNo: alloc.floorNo,
              stackNo: alloc.stackNo,
              allocatedWeight: takeWeight,
              bagsCount: takeBags,
              grade: targetInward.grade,
              gradingType: targetInward.gradingType,
              stockType: transferType
            });
            
            remainingWeight -= takeWeight;
            remainingBags -= takeBags;
          }
        }

        if (transferType === 'Purchase') {
          const originalInward = await ColdInward.findById(targetInward._id).session(mongooseSession);
          if (!originalInward) throw new Error("Original inward not found");

          for (const item of transferAllocations) {
            const selfAlloc = originalInward.stackAllocations.find((a: any) => 
              (a.chamberName === item.chamberName || (a.chamberNo && a.chamberNo === item.chamberNo)) && 
              a.floorNo === item.floorNo && 
              a.stackNo === item.stackNo &&
              (a.stockType === 'Self' || !a.stockType)
            );

            if (selfAlloc) {
              selfAlloc.allocatedWeight -= item.allocatedWeight;
              if (selfAlloc.bagsCount) selfAlloc.bagsCount -= item.bagsCount;
              if (selfAlloc.allocatedWeight < 0) selfAlloc.allocatedWeight = 0;
              if (selfAlloc.bagsCount && selfAlloc.bagsCount < 0) selfAlloc.bagsCount = 0;
            }

            originalInward.stackAllocations.push({
              chamberName: item.chamberName,
              chamberNo: item.chamberNo,
              floorNo: item.floorNo,
              stackNo: item.stackNo,
              allocatedWeight: item.allocatedWeight,
              bagsCount: item.bagsCount,
              stockType: 'Purchase'
            });
          }

          const hasSelf = originalInward.stackAllocations.some((a: any) => a.allocatedWeight > 0 && (a.stockType === 'Self' || !a.stockType));
          const hasPurchase = originalInward.stackAllocations.some((a: any) => a.allocatedWeight > 0 && a.stockType === 'Purchase');
          
          if (hasSelf && hasPurchase) {
            originalInward.stockType = 'Both';
          } else if (hasPurchase) {
            originalInward.stockType = 'Purchase';
          } else {
            originalInward.stockType = 'Self';
          }

          await originalInward.save({ session: mongooseSession });

          const transferData = {
            fromClientId: source.fromClientId,
            toClientId: toClientId || targetInward.warehouseId._id,
            toClientModel: 'ColdWarehouse',
            originalInwardId: targetInward._id,
            newInwardId: targetInward._id, 
            warehouseId: targetInward.warehouseId._id,
            commodityId: targetInward.commodityId._id,
            stackAllocations: transferAllocations,
            quantityKg: source.transferWeight,
            bagsCount: source.transferBags,
            transferType: transferType,
            date: transferDateObj,
            batchId
          };

          const transfer = (await ColdTransfer.create([appendOwnership(transferData, session)], { session: mongooseSession }))[0];
          createdTransferIds.push(transfer._id.toString());

          await logColdActivity({
            actionType: 'CREATE',
            module: 'Ownership Transfer',
            recordId: transfer._id.toString(),
            description: `Ownership transferred (Purchase): ${source.transferWeight} Kg (Batch: ${batchId})`,
            newValue: JSON.parse(JSON.stringify(transfer)),
            sessionFallback: session
          });
        } else {
          // Self transfer
          const newInwardData = {
            clientId: toClientId,
            commodityId: targetInward.commodityId._id,
            warehouseId: targetInward.warehouseId._id,
            stackAllocations: transferAllocations,
            quantityKg: source.transferWeight,
            bagsCount: source.transferBags,
            grade: targetInward.grade,
            gradingType: targetInward.gradingType,
            stockType: transferType,
            seed: targetInward.seed,
            tableLabel: targetInward.tableLabel,
            date: transferDateObj,
            remarks: 'Ownership Transfer In',
            weighbridgeSlipNo: targetInward.weighbridgeSlipNo,
            marko: targetInward.marko,
          };

          const newInward = (await ColdInward.create([appendOwnership(newInwardData, session)], { session: mongooseSession }))[0];

          const transferData = {
            fromClientId: source.fromClientId,
            toClientId: toClientId,
            originalInwardId: targetInward._id,
            newInwardId: newInward._id,
            warehouseId: targetInward.warehouseId._id,
            commodityId: targetInward.commodityId._id,
            stackAllocations: transferAllocations,
            quantityKg: source.transferWeight,
            bagsCount: source.transferBags,
            transferType: transferType,
            date: transferDateObj,
            batchId
          };

          const transfer = (await ColdTransfer.create([appendOwnership(transferData, session)], { session: mongooseSession }))[0];
          createdTransferIds.push(transfer._id.toString());

          await logColdActivity({
            actionType: 'CREATE',
            module: 'Ownership Transfer',
            recordId: transfer._id.toString(),
            description: `Ownership transferred: ${source.transferWeight} Kg to new receipt ${newInward.receiptNumber} (Batch: ${batchId})`,
            newValue: JSON.parse(JSON.stringify(transfer)),
            sessionFallback: session
          });
        }
      }
    });
  } finally {
    await mongooseSession.endSession();
  }

  revalidatePath('/cold/dashboard');
  revalidatePath('/cold/transfers');
  revalidatePath('/cold/inward');
  revalidatePath('/cold/outward');

  return { success: true, transferId: batchId };
}

export async function getColdTransfers() {
  await connectToDatabase();
  const session = await requireSession();
  const tenantFilter = getTenantFilter(session);
  ColdCommodity.init();
  ColdWarehouse.init();

  const transfers = await ColdTransfer.find(tenantFilter)
    .populate('fromClientId', 'name mobile')
    .populate('toClientId', 'name mobile')
    .populate('commodityId', 'name type')
    .populate('warehouseId', 'name')
    .populate('originalInwardId', 'receiptNumber')
    .sort({ date: -1, createdAt: -1 })
    .lean();

  return JSON.parse(JSON.stringify(transfers));
}
