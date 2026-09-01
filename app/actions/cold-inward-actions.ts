'use server';

import connectToDatabase from '@/lib/mongoose';
import ColdInward from '@/lib/models/ColdInward';
import ColdWarehouse from '@/lib/models/ColdWarehouse';
import ColdOutward from '@/lib/models/ColdOutward';
import ColdCommodity from '@/lib/models/ColdCommodity';
import ColdInwardDraft from '@/lib/models/ColdInwardDraft';
import Client from '@/lib/models/Client';
import ColdTransfer from '@/lib/models/ColdTransfer';
import { generateReceiptNumber } from '@/lib/receipt-generator';
import { revalidatePath } from 'next/cache';
import { hasPermission } from '@/lib/permissions';
import { appendOwnership, getTenantFilter, requireSession, getWarehouseFilter } from '@/lib/ownership';
import mongoose from 'mongoose';
import crypto from 'crypto';

function isSameStack(a: any, b: any): boolean {
  if (!a || !b) return false;
  const cA = a.chamberNo ?? a.chamberName;
  const cB = b.chamberNo ?? b.chamberName;
  if (cA !== undefined && cA !== null && cB !== undefined && cB !== null) {
    if (String(cA).replace(/^Chamber\s+/i, '').trim() !== String(cB).replace(/^Chamber\s+/i, '').trim()) return false;
  }
  const fA = a.floorNo ?? a.floorName;
  const fB = b.floorNo ?? b.floorName;
  if (fA !== undefined && fA !== null && fB !== undefined && fB !== null) {
    if (String(fA).trim() !== String(fB).trim()) return false;
  }
  const sA = a.stackNo ?? a.stackName;
  const sB = b.stackNo ?? b.stackName;
  if (sA !== undefined && sA !== null && sB !== undefined && sB !== null) {
    if (String(sA).trim() !== String(sB).trim()) return false;
  } else {
    return false;
  }
  return true;
}

export async function getColdInwards() {
  await connectToDatabase();
  const session = await requireSession();
  
  const inwards = await ColdInward.find({ 
    ...getTenantFilter(session), 
    ...getWarehouseFilter(session),
    remarks: { $ne: 'Ownership Transfer In' }
  })
    .populate('clientId', 'name')
    .populate('commodityId', 'name type')
    .populate('warehouseId', 'name warehouseId chambers')
    .sort({ date: -1, createdAt: -1 })
    .lean();
    
  const inwardIds = inwards.map(i => i._id);
  
  const [allOutwards, allTransfers] = await Promise.all([
    ColdOutward.find({ inwardId: { $in: inwardIds } }).lean(),
    ColdTransfer.find({ originalInwardId: { $in: inwardIds } }).lean()
  ]);

  const outwardsByInward = allOutwards.reduce((acc: any, out: any) => {
    if (!out.inwardId) return acc;
    const id = out.inwardId.toString();
    if (!acc[id]) acc[id] = [];
    acc[id].push(out);
    return acc;
  }, {});

  const transfersByInward = allTransfers.reduce((acc: any, t: any) => {
    if (!t.originalInwardId) return acc;
    const id = t.originalInwardId.toString();
    if (!acc[id]) acc[id] = [];
    acc[id].push(t);
    return acc;
  }, {});

  const processedInwards = inwards.map((inward: any) => {
    const inwardIdStr = inward._id.toString();
    const outwards = outwardsByInward[inwardIdStr] || [];
    const transfersForOwnership = transfersByInward[inwardIdStr] || [];

    const regularOutwards = outwards.filter((o: any) => o.remarks !== 'Ownership Transfer Out' && o.remarks !== 'Ownership Transfer Purchase');
    
    let totalOutwardKg = 0;
    let totalOutwardBags = 0;
    let totalTransferKg = 0;
    let totalTransferBags = 0;

    regularOutwards.forEach((o: any) => {
      totalOutwardKg += (o.quantityKg || 0);
      totalOutwardBags += (o.bagsCount || 0);
    });

    transfersForOwnership.forEach((t: any) => {
      totalTransferKg += (t.quantityKg || 0);
      totalTransferBags += (t.bagsCount || 0);
    });

    const currentBalanceKg = Math.max(0, (inward.quantityKg || 0) - totalOutwardKg - totalTransferKg);
    const currentBalanceBags = Math.max(0, (inward.bagsCount || 0) - totalOutwardBags - totalTransferBags);

    const computedStackAllocations = (inward.stackAllocations || []).reduce((acc: any[], alloc: any) => {
      const key = `${alloc.chamberName || alloc.chamberNo}-${alloc.floorName || alloc.floorNo}-${alloc.stackName || alloc.stackNo}`;
      if (!acc.some(a => `${a.chamberName || a.chamberNo}-${a.floorName || a.floorNo}-${a.stackName || a.stackNo}` === key)) {
        let outwardedWeight = 0;
        let outwardedBags = 0;
        let transferredWeight = 0;
        let transferredBags = 0;

        regularOutwards.forEach((out: any) => {
          if (isSameStack(out, alloc)) {
            outwardedWeight += (Number(out.quantityKg) || 0);
            outwardedBags += (Number(out.bagsCount) || 0);
          }
        });

        transfersForOwnership.forEach((t: any) => {
          (t.stackAllocations || []).forEach((s: any) => {
            if (isSameStack(s, alloc)) {
              transferredWeight += (Number(s.allocatedWeight) || 0);
              transferredBags += (Number(s.bagsCount) || 0);
            }
          });
        });

        const originalWeight = Number(alloc.allocatedWeight) || 0;
        const remainingWeight = Math.max(0, originalWeight - outwardedWeight - transferredWeight);
        
        const originalBags = Number(alloc.bagsCount) || 0;
        const remainingBags = Math.max(0, originalBags - outwardedBags - transferredBags);

        acc.push({
          ...alloc,
          allocatedWeight: remainingWeight,
          bagsCount: remainingBags
        });
      }
      return acc;
    }, []);

    return {
      ...inward,
      quantityKg: currentBalanceKg,
      bagsCount: currentBalanceBags,
      stackAllocations: computedStackAllocations
    };
  });

  return JSON.parse(JSON.stringify(processedInwards));
}

export async function checkExistingReceiptNumber(receiptNumber: string) {
  await connectToDatabase();
  const existing = await ColdInward.findOne({ receiptNumber }).lean();
  return !!existing;
}

export async function searchColdInwardByReceipt(receiptNo: string) {
  if (!receiptNo || typeof receiptNo !== 'string') return null;
  
  // Reuse the robust getColdInwards function to get all inwards with their available quantities pre-calculated
  const allInwards = await getColdInwards();
  
  // Find the matching receipt number
  const matchedInward = allInwards.find((inward: any) => 
    String(inward.receiptNumber).trim() === receiptNo.trim()
  );
  
  return matchedInward || null;
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

export async function getStackAvailableCapacity(warehouseId: string, chamberName: string | number, floorNo: string | number, stackNo: string | number) {
  await connectToDatabase();
  const session = await requireSession();
  
  const warehouse = await ColdWarehouse.findOne({ _id: warehouseId, ...getTenantFilter(session) });
  if (!warehouse) throw new Error('Warehouse not found');

  const chamberStr = (chamberName || '').toString().trim();
  const floorStr = (floorNo || '').toString().trim();
  const stackStr = (stackNo || '').toString().trim();

  // Match Chamber (supports custom names or chamberNo)
  const chamber = warehouse.chambers.find((c: any) => 
    (c.name || '').toString().toLowerCase() === chamberStr.toLowerCase() ||
    c.chamberNo?.toString() === chamberStr ||
    (c.name && c.name.toLowerCase() === chamberStr.toLowerCase()) ||
    c.chamberNo === parseInt(chamberStr)
  );
  if (!chamber) throw new Error(`Chamber "${chamberName}" not found`);

  // Match Floor (supports custom names or floorNo)
  const floor = chamber.floors.find((f: any) => 
    (f.name || '').toString().toLowerCase() === floorStr.toLowerCase() ||
    f.floorNo?.toString() === floorStr ||
    (f.name && f.name.toLowerCase() === floorStr.toLowerCase()) ||
    f.floorNo === parseInt(floorStr)
  );
  if (!floor) throw new Error(`Floor "${floorNo}" not found`);

  // Match Stack (supports name or stackNo)
  const cleanStackStr = (str: string) => (str || '').toString().toLowerCase().replace(/^stack\s*/i, '').trim();

  const stack = floor.stacks.find((s: any) => 
    s.stackNo?.toString() === stackStr ||
    cleanStackStr(stackStr) === s.stackNo?.toString() ||
    (s.name && s.name.toLowerCase() === stackStr.toLowerCase()) ||
    s.stackNo === parseInt(stackStr)
  );
  if (!stack) throw new Error(`Stack "${stackNo}" not found`);

  // Calculate actual total capacity for this specific stack (Custom stack capacity if configured; otherwise floor default)
  const customCapKey1 = `${chamber.chamberNo}-${floor.floorNo}-${stack.stackNo}`;
  const customCapKey2 = `${chamber.name || chamber.chamberNo}-${floor.name || floor.floorNo}-${stack.stackNo}`;
  
  let customCap: number | undefined = undefined;
  if (warehouse.customStackCapacities) {
    if (typeof (warehouse.customStackCapacities as any).get === 'function') {
      customCap = (warehouse.customStackCapacities as any).get(customCapKey1) || (warehouse.customStackCapacities as any).get(customCapKey2);
    } else {
      customCap = (warehouse.customStackCapacities as any)[customCapKey1] || (warehouse.customStackCapacities as any)[customCapKey2];
    }
  }

  const totalCapacity = Number(stack.capacity || customCap || warehouse.stackCapacity || 1000);

  // Calculate occupied quantity for this selected stack ONLY
  const targetChamberName = (chamber.name || chamber.chamberNo?.toString() || '').toLowerCase();
  const targetChamberNo = chamber.chamberNo;
  const targetFloorNo = floor.floorNo;
  const targetStackNo = stack.stackNo;

  const inwardDocs = await ColdInward.find({
    warehouseId: new mongoose.Types.ObjectId(warehouseId),
    ...getTenantFilter(session)
  }).lean();

  let totalInwardWeight = 0;
  for (const inward of inwardDocs) {
    if (Array.isArray(inward.stackAllocations)) {
      for (const sa of inward.stackAllocations) {
        const saChamberName = (sa.chamberName || sa.chamberNo || '').toString().toLowerCase();
        const saChamberNo = sa.chamberNo !== undefined ? Number(sa.chamberNo) : undefined;
        const saFloorNo = Number(sa.floorNo);
        const saStackNo = Number(sa.stackNo);

        const matchesChamber = 
          saChamberName === targetChamberName ||
          saChamberName === targetChamberNo?.toString() ||
          (targetChamberNo !== undefined && saChamberNo === targetChamberNo);

        const matchesFloor = saFloorNo === targetFloorNo;
        const matchesStack = saStackNo === targetStackNo;

        if (matchesChamber && matchesFloor && matchesStack) {
          totalInwardWeight += Number(sa.allocatedWeight || 0);
        }
      }
    }
  }

  const outwardDocs = await ColdOutward.find({
    warehouseId: new mongoose.Types.ObjectId(warehouseId),
    ...getTenantFilter(session)
  }).lean();

  let totalOutwardWeight = 0;
  for (const outward of outwardDocs) {
    const oChamberName = (outward.chamberName || outward.chamberNo || '').toString().toLowerCase();
    const oChamberNo = outward.chamberNo !== undefined ? Number(outward.chamberNo) : undefined;
    const oFloorNo = Number(outward.floorNo);
    const oStackNo = Number(outward.stackNo);

    const matchesChamber = 
      oChamberName === targetChamberName ||
      oChamberName === targetChamberNo?.toString() ||
      (targetChamberNo !== undefined && oChamberNo === targetChamberNo);

    const matchesFloor = oFloorNo === targetFloorNo;
    const matchesStack = oStackNo === targetStackNo;

    if (matchesChamber && matchesFloor && matchesStack) {
      totalOutwardWeight += Number(outward.quantityKg || 0);
    }
  }

  const occupied = Math.max(0, totalInwardWeight - totalOutwardWeight);
  const availableCapacity = Math.max(0, totalCapacity - occupied);
  const bufferCapacity = Number(warehouse.bufferCapacity || 0);

  return { 
    availableCapacity, 
    totalCapacity, 
    occupied,
    bufferCapacity
  };
}

function isAllocChamberMatch(saChamberNameOrNo: any, chamber: any) {
  if (saChamberNameOrNo === undefined || saChamberNameOrNo === null) return false;
  const str = saChamberNameOrNo.toString().trim().toLowerCase();
  const clean = str.replace(/^chamber\s*/i, '').trim();

  const cName = (chamber.name || '').toString().trim().toLowerCase();
  const cNo = chamber.chamberNo !== undefined ? chamber.chamberNo.toString().trim().toLowerCase() : '';
  const cCleanName = cName.replace(/^chamber\s*/i, '').trim();

  return (
    str === cName ||
    str === cNo ||
    clean === cCleanName ||
    clean === cNo ||
    (cNo !== '' && parseInt(clean) === parseInt(cNo))
  );
}

function isAllocFloorMatch(saFloorNoOrName: any, floor: any) {
  if (saFloorNoOrName === undefined || saFloorNoOrName === null) return false;
  const str = saFloorNoOrName.toString().trim().toLowerCase();
  const clean = str.replace(/^floor\s*/i, '').trim();

  const fName = (floor.name || '').toString().trim().toLowerCase();
  const fNo = floor.floorNo !== undefined ? floor.floorNo.toString().trim().toLowerCase() : '';
  const fCleanName = fName.replace(/^floor\s*/i, '').trim();

  return (
    str === fName ||
    str === fNo ||
    clean === fCleanName ||
    clean === fNo ||
    (fNo !== '' && parseInt(clean) === parseInt(fNo))
  );
}

function isAllocStackMatch(saStackNoOrName: any, stack: any) {
  if (saStackNoOrName === undefined || saStackNoOrName === null) return false;
  const str = saStackNoOrName.toString().trim().toLowerCase();
  const clean = str.replace(/^stack\s*/i, '').trim();

  const sName = (stack.name || '').toString().trim().toLowerCase();
  const sNo = stack.stackNo !== undefined ? stack.stackNo.toString().trim().toLowerCase() : '';
  const sCleanName = sName.replace(/^stack\s*/i, '').trim();

  return (
    str === sName ||
    str === sNo ||
    clean === sCleanName ||
    clean === sNo ||
    (sNo !== '' && parseInt(clean) === parseInt(sNo))
  );
}

export async function getMultipleStackCapacities(requests: Array<{ warehouseId: string; chamberNo: string | number; floorNo: string | number; stackNo: string | number }>) {
  await connectToDatabase();
  const session = await requireSession();
  const tenantFilter = getTenantFilter(session);

  if (!requests || requests.length === 0) return {};

  const warehouseMap = new Map<string, Array<{ chamberNo: string | number; floorNo: string | number; stackNo: string | number; key: string }>>();
  for (const req of requests) {
    if (!req.warehouseId || req.chamberNo === undefined || req.floorNo === undefined || req.stackNo === undefined) continue;
    const key = `${req.warehouseId}-${req.chamberNo}-${req.floorNo}-${req.stackNo}`;
    if (!warehouseMap.has(req.warehouseId)) {
      warehouseMap.set(req.warehouseId, []);
    }
    warehouseMap.get(req.warehouseId)!.push({ ...req, key });
  }

  const results: Record<string, { availableCapacity: number; totalCapacity: number; occupied: number; bufferCapacity: number }> = {};

  const warehouseEntries = Array.from(warehouseMap.entries());

  await Promise.all(warehouseEntries.map(async ([wId, reqList]) => {
    try {
      const warehouse = await ColdWarehouse.findOne({ _id: wId, ...tenantFilter }).lean();
      if (!warehouse) return;

      const bufferCapacity = Number(warehouse.bufferCapacity || 0);

      const [inwardDocs, outwardDocs] = await Promise.all([
        ColdInward.find({
          warehouseId: new mongoose.Types.ObjectId(wId),
          ...tenantFilter
        }).select('stackAllocations').lean(),
        ColdOutward.find({
          warehouseId: new mongoose.Types.ObjectId(wId),
          ...tenantFilter
        }).select('chamberName chamberNo floorNo stackNo quantityKg').lean()
      ]);

      const inwardAllocations: Array<{ chamberRaw: any; floorRaw: any; stackRaw: any; allocatedWeight: number }> = [];
      for (const inward of inwardDocs) {
        if (Array.isArray(inward.stackAllocations)) {
          for (const sa of inward.stackAllocations) {
            inwardAllocations.push({
              chamberRaw: sa.chamberName || sa.chamberNo,
              floorRaw: sa.floorNo,
              stackRaw: sa.stackNo,
              allocatedWeight: Number(sa.allocatedWeight || 0)
            });
          }
        }
      }

      const outwardRecords: Array<{ chamberRaw: any; floorRaw: any; stackRaw: any; quantityKg: number }> = [];
      for (const outward of outwardDocs) {
        outwardRecords.push({
          chamberRaw: outward.chamberName || outward.chamberNo,
          floorRaw: outward.floorNo,
          stackRaw: outward.stackNo,
          quantityKg: Number(outward.quantityKg || 0)
        });
      }

      for (const req of reqList) {
        const chamber = warehouse.chambers?.find((c: any) => isAllocChamberMatch(req.chamberNo, c));
        if (!chamber) continue;

        const floor = chamber.floors?.find((f: any) => isAllocFloorMatch(req.floorNo, f));
        if (!floor) continue;

        const stack = floor.stacks?.find((s: any) => isAllocStackMatch(req.stackNo, s));
        if (!stack) continue;

        const customCapKey1 = `${chamber.chamberNo}-${floor.floorNo}-${stack.stackNo}`;
        const customCapKey2 = `${chamber.name || chamber.chamberNo}-${floor.name || floor.floorNo}-${stack.stackNo}`;

        let customCap: number | undefined = undefined;
        if (warehouse.customStackCapacities) {
          if (typeof (warehouse.customStackCapacities as any).get === 'function') {
            customCap = (warehouse.customStackCapacities as any).get(customCapKey1) || (warehouse.customStackCapacities as any).get(customCapKey2);
          } else {
            customCap = (warehouse.customStackCapacities as any)[customCapKey1] || (warehouse.customStackCapacities as any)[customCapKey2];
          }
        }

        const totalCapacity = Number(stack.capacity || customCap || warehouse.stackCapacity || 1000);

        let totalInwardWeight = 0;
        for (const sa of inwardAllocations) {
          if (
            isAllocChamberMatch(sa.chamberRaw, chamber) &&
            isAllocFloorMatch(sa.floorRaw, floor) &&
            isAllocStackMatch(sa.stackRaw, stack)
          ) {
            totalInwardWeight += sa.allocatedWeight;
          }
        }

        let totalOutwardWeight = 0;
        for (const outward of outwardRecords) {
          if (
            isAllocChamberMatch(outward.chamberRaw, chamber) &&
            isAllocFloorMatch(outward.floorRaw, floor) &&
            isAllocStackMatch(outward.stackRaw, stack)
          ) {
            totalOutwardWeight += outward.quantityKg;
          }
        }

        const occupied = Math.max(0, totalInwardWeight - totalOutwardWeight);
        const availableCapacity = Math.max(0, totalCapacity - occupied);

        results[req.key] = {
          availableCapacity,
          totalCapacity,
          occupied,
          bufferCapacity
        };
      }
    } catch (err) {
      console.error('Error fetching multiple stack capacities:', err);
    }
  }));

  return results;
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
      return { success: false, error: 'Allocation quantity cannot exceed available weight.' };
    }

    if (data.quantityKg > availableStackCapacity && data.quantityKg <= maxAllowedCapacity) {
      if (!data.confirmed) {
        return { success: false, requireConfirmation: true, error: 'Stack capacity exceeded. Use buffer capacity?' };
      }
      warning = "Buffer capacity used.";
      data.remarks = data.remarks ? `${data.remarks} | Buffer Capacity Used` : 'Buffer Capacity Used';
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

    const inwardReceiptNumber = await generateReceiptNumber(data.warehouseId, 'inward', data.chamberName || data.chamberNo?.toString());

    const inward = await ColdInward.create(appendOwnership({
      ...data,
      unit,
      remainingQuantityKg: data.quantityKg,
      remainingBagsCount: data.bagsCount,
      status: 'Active',
      qrId: crypto.randomUUID(),
      receiptNumber: inwardReceiptNumber,
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
          const capacityInfo = await getStackAvailableCapacity(data.warehouseId, stack.chamberName || stack.chamberNo?.toString(), stack.floorNo, stack.stackNo);
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
          warnings.push(`Buffer capacity used in Chamber ${stack.chamberName || stack.chamberNo}, Stack ${stack.stackNo}.`);
          client.usedBufferCapacity = true;
        }
        
        stackAllocatedWeight.set(stackKey, newTotalWeight);
      }
    }

    const warehouse = await ColdWarehouse.findOne({ _id: data.warehouseId, ...getTenantFilter(session) }).lean();

    // Now insert
    for (const client of data.clients) {
      if (client.grade === '') {
        delete client.grade;
      }

      const dbClient = await Client.findOne({ _id: client.clientId, ...getTenantFilter(session) }).lean();
      const isPurchaseClient = dbClient?.clientType === 'PURCHASE';

      const stackAllocations = client.stacks.map((s: any) => {
        const chamberStr = (s.chamberName || s.chamberNo || '').toString().trim();
        const floorStr = (s.floorNo || '').toString().trim();
        const stackStr = (s.stackNo || '').toString().trim();

        const cleanStackStr = (str: string) => (str || '').toString().toLowerCase().replace(/^stack\s*/i, '').trim();

        const chamber = warehouse?.chambers?.find((c: any) => 
          (c.name || '').toString().toLowerCase() === chamberStr.toLowerCase() ||
          c.chamberNo?.toString() === chamberStr ||
          c.chamberNo === parseInt(chamberStr)
        );

        const floor = chamber?.floors?.find((f: any) => 
          (f.name || '').toString().toLowerCase() === floorStr.toLowerCase() ||
          f.floorNo?.toString() === floorStr ||
          f.floorNo === parseInt(floorStr)
        );

        const stackObj = floor?.stacks?.find((st: any) => 
          st.stackNo?.toString() === stackStr ||
          cleanStackStr(stackStr) === st.stackNo?.toString() ||
          (st.name && st.name.toLowerCase() === stackStr.toLowerCase()) ||
          st.stackNo === parseInt(stackStr)
        );

        const numericFloorNo = floor?.floorNo ?? (!isNaN(parseInt(s.floorNo)) ? parseInt(s.floorNo) : 1);
        const numericStackNo = stackObj?.stackNo ?? (!isNaN(parseInt(s.stackNo)) ? parseInt(s.stackNo) : 1);
        const finalChamberName = s.chamberName || chamber?.name || s.chamberNo || chamber?.chamberNo?.toString() || 'Chamber 1';
        const numericChamberNo = chamber?.chamberNo ?? (s.chamberNo && !isNaN(parseInt(s.chamberNo)) ? parseInt(s.chamberNo) : undefined);

        return {
          chamberName: finalChamberName,
          chamberNo: numericChamberNo,
          floorNo: numericFloorNo,
          stackNo: numericStackNo,
          allocatedWeight: Number(s.allocatedWeight) || 0,
          bagsCount: Number(s.allocatedBags) || 0,
          stockType: isPurchaseClient ? 'Purchase' : (s.stockType || 'Self'),
        };
      });
      
      const totalQuantity = stackAllocations.reduce((sum: number, s: any) => sum + s.allocatedWeight, 0);
      const totalAllocatedBags = stackAllocations.reduce((sum: number, s: any) => sum + s.bagsCount, 0);
      const derivedSelfWeight = stackAllocations
        .filter((s: any) => s.stockType === 'Self')
        .reduce((sum: number, s: any) => sum + (Number(s.allocatedWeight) || 0), 0);
      const derivedPurchaseWeight = stackAllocations
        .filter((s: any) => s.stockType === 'Purchase')
        .reduce((sum: number, s: any) => sum + (Number(s.allocatedWeight) || 0), 0);
      const derivedSelfBags = stackAllocations
        .filter((s: any) => s.stockType === 'Self')
        .reduce((sum: number, s: any) => sum + (Number(s.bagsCount) || 0), 0);
      const derivedPurchaseBags = stackAllocations
        .filter((s: any) => s.stockType === 'Purchase')
        .reduce((sum: number, s: any) => sum + (Number(s.bagsCount) || 0), 0);

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
        remarks: client.usedBufferCapacity 
          ? (data.common.remarks ? `${data.common.remarks} | Buffer Capacity Used` : 'Buffer Capacity Used')
          : data.common.remarks,
        farmerName: client.farmerName,
        villageName: client.villageName,
        largeBag: client.largeBag,
        smallBag: client.smallBag,
        farmerId: client.farmerId,
        referencePersons: client.referencePersons,
        warehouseId: data.warehouseId,
        gradingApplied: client.gradingApplied || false,
        gradingChargeType: client.gradingChargeType,
        gradingRate: client.gradingRate,
        gradingCharge: client.gradingCharge,
        stockType: isPurchaseClient ? 'Purchase' : (client.stockType || 'Self'),
        purchaseQuantityKg: isPurchaseClient ? totalQuantity : (client.stockType === 'Both' ? (client.purchaseQuantityKg ?? derivedPurchaseWeight) : (client.purchaseQuantityKg ?? 0)),
        purchaseBagsCount: isPurchaseClient ? totalAllocatedBags : (client.stockType === 'Both' ? (client.purchaseBagsCount ?? derivedPurchaseBags) : (client.purchaseBagsCount ?? 0)),
        selfQuantityKg: isPurchaseClient ? 0 : (client.stockType === 'Both' ? (client.selfQuantityKg ?? derivedSelfWeight) : (client.selfQuantityKg ?? totalQuantity)),
        selfBagsCount: isPurchaseClient ? 0 : (client.stockType === 'Both' ? (client.selfBagsCount ?? derivedSelfBags) : (client.selfBagsCount ?? totalAllocatedBags)),
      };
      
      const firstChamberName = stackAllocations.length > 0 ? stackAllocations[0].chamberName : undefined;
      const inwardReceiptNumber = await generateReceiptNumber(data.warehouseId, 'inward', firstChamberName);
      
      const inward = await ColdInward.create(appendOwnership({
        ...inwardData,
        receiptNumber: inwardReceiptNumber,
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
