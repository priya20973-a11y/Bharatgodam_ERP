'use server';

import connectToDatabase from '@/lib/mongoose';
import ColdStockShifting from '@/lib/models/ColdStockShifting';
import ColdInward from '@/lib/models/ColdInward';
import ColdWarehouse from '@/lib/models/ColdWarehouse';
import ColdOutward from '@/lib/models/ColdOutward';
import { requireSession, getTenantFilter, appendOwnership, getWarehouseFilter } from '@/lib/ownership';
import { hasPermission } from '@/lib/permissions';
import { revalidatePath } from 'next/cache';
import mongoose from 'mongoose';

export interface ISourceAllocInput {
  warehouseId: string;
  chamberName: string;
  chamberNo?: number;
  floorNo: number;
  floorName?: string;
  stackNo: number;
  shiftWeight: number;
  shiftBags: number;
}

export interface IDestAllocInput {
  warehouseId: string;
  chamberName: string;
  chamberNo?: number;
  floorNo: number;
  floorName?: string;
  stackNo: number;
  allocatedWeight: number;
  bagsCount: number;
}

export async function createColdStockShifting(data: {
  date?: string | Date;
  clientId: string;
  inwardId: string;
  sourceAllocations: ISourceAllocInput[];
  destAllocations: IDestAllocInput[];
  remarks?: string;
  note?: string;
}) {
  try {
    await connectToDatabase();
    const session = await requireSession();
    const tenantFilter = getTenantFilter(session);

    if (!hasPermission(session, 'stockShifting', 'create')) {
      return { success: false, error: 'Permission denied: Cannot perform stock shifting' };
    }

    if (!data.clientId || !data.inwardId) {
      return { success: false, error: 'Client and Inward receipt selection are required.' };
    }

    const sources = data.sourceAllocations || [];
    const dests = data.destAllocations || [];

    if (sources.length === 0) {
      return { success: false, error: 'At least one source stack must be selected.' };
    }

    if (dests.length === 0) {
      return { success: false, error: 'At least one destination stack must be selected.' };
    }

    // 1. Calculate and validate total weight and bags
    const totalSourceWeight = sources.reduce((acc, s) => acc + Number(s.shiftWeight || 0), 0);
    const totalSourceBags = sources.reduce((acc, s) => acc + Number(s.shiftBags || 0), 0);

    const totalDestWeight = dests.reduce((acc, d) => acc + Number(d.allocatedWeight || 0), 0);
    const totalDestBags = dests.reduce((acc, d) => acc + Number(d.bagsCount || 0), 0);

    if (totalSourceWeight <= 0) {
      return { success: false, error: 'Total shifted weight must be greater than 0.' };
    }

    if (Math.abs(totalSourceWeight - totalDestWeight) > 0.01) {
      return {
        success: false,
        error: `Weight Mismatch: Total source weight (${totalSourceWeight.toFixed(2)} KG) does not match total destination weight (${totalDestWeight.toFixed(2)} KG).`,
      };
    }

    if (totalSourceBags !== totalDestBags) {
      return {
        success: false,
        error: `Bags Mismatch: Total source bags (${totalSourceBags}) does not match total destination bags (${totalDestBags}).`,
      };
    }

    // 2. Fetch Inward Record
    const inward = await ColdInward.findOne({
      _id: data.inwardId,
      clientId: data.clientId,
      ...tenantFilter,
    });

    if (!inward) {
      return { success: false, error: 'Inward stock record not found.' };
    }

    const cleanStr = (val: any) => String(val || '').toLowerCase().replace(/^(chamber|floor|stack|c|f|s)\s*/i, '').trim();
    const allocations = inward.stackAllocations || [];

    // 3. Validate each Source Stack
    for (const src of sources) {
      const srcChamberClean = cleanStr(src.chamberName || src.chamberNo);
      const matchingAlloc = allocations.find((alloc: any) => {
        const cClean = cleanStr(alloc.chamberName || alloc.chamberNo);
        return cClean === srcChamberClean && alloc.floorNo === src.floorNo && alloc.stackNo === src.stackNo;
      });

      if (!matchingAlloc) {
        return {
          success: false,
          error: `Source stack Chamber ${src.chamberName}/Floor ${src.floorNo}/Stack ${src.stackNo} not found in inward receipt.`,
        };
      }

      if (matchingAlloc.allocatedWeight < src.shiftWeight) {
        return {
          success: false,
          error: `Insufficient weight in Stack ${src.stackNo}. Available: ${matchingAlloc.allocatedWeight} KG, Requested: ${src.shiftWeight} KG.`,
        };
      }

      if (matchingAlloc.bagsCount !== undefined && matchingAlloc.bagsCount < src.shiftBags) {
        return {
          success: false,
          error: `Insufficient bags in Stack ${src.stackNo}. Available: ${matchingAlloc.bagsCount}, Requested: ${src.shiftBags}.`,
        };
      }
    }

    // 4. Validate each Destination Stack Capacity
    for (const dest of dests) {
      const destWarehouse = await ColdWarehouse.findOne({
        _id: dest.warehouseId,
        ...tenantFilter,
        ...getWarehouseFilter(session, '_id'),
      }).lean();

      if (!destWarehouse) {
        return { success: false, error: `Destination warehouse not found.` };
      }

      const destChamberClean = cleanStr(dest.chamberName || dest.chamberNo);
      const destChamber = destWarehouse.chambers.find((c: any) => cleanStr(c.name || c.chamberNo) === destChamberClean);
      if (!destChamber) {
        return { success: false, error: `Destination chamber ${dest.chamberName} not found in warehouse layout.` };
      }

      const destFloor = destChamber.floors.find((f: any) => f.floorNo === dest.floorNo);
      if (!destFloor) {
        return { success: false, error: `Destination floor ${dest.floorNo} not found in layout.` };
      }

      const destStackObj = destFloor.stacks.find((s: any) => s.stackNo === dest.stackNo);
      if (!destStackObj) {
        return { success: false, error: `Destination stack ${dest.stackNo} not found on floor ${dest.floorNo}.` };
      }

      // Calculate current used capacity of destination stack
      const destInwards = await ColdInward.find({
        warehouseId: dest.warehouseId,
        $or: [
          { 'stackAllocations.chamberName': dest.chamberName },
          ...(dest.chamberNo ? [{ 'stackAllocations.chamberNo': dest.chamberNo }] : []),
        ],
        'stackAllocations.floorNo': dest.floorNo,
        'stackAllocations.stackNo': dest.stackNo,
        ...tenantFilter,
      }).lean();

      const destOutwards = await ColdOutward.find({
        warehouseId: dest.warehouseId,
        $or: [
          { chamberName: dest.chamberName },
          ...(dest.chamberNo ? [{ chamberNo: dest.chamberNo }] : []),
        ],
        floorNo: dest.floorNo,
        stackNo: dest.stackNo,
        ...tenantFilter,
      }).lean();

      let destUsedWeight = 0;
      destInwards.forEach((inw: any) => {
        (inw.stackAllocations || []).forEach((alloc: any) => {
          if (
            cleanStr(alloc.chamberName || alloc.chamberNo) === destChamberClean &&
            alloc.floorNo === dest.floorNo &&
            alloc.stackNo === dest.stackNo
          ) {
            destUsedWeight += alloc.allocatedWeight || 0;
          }
        });
      });

      destOutwards.forEach((outw: any) => {
        destUsedWeight -= outw.quantityKg || 0;
      });

      destUsedWeight = Math.max(0, destUsedWeight);

      const customCapKey1 = `${dest.chamberNo || destChamber.chamberNo}-${dest.floorNo}-${dest.stackNo}`;
      const customCapKey2 = `${dest.chamberName || destChamber.name}-${dest.floorNo}-${dest.stackNo}`;
      let customCap: number | undefined = undefined;
      if (destWarehouse.customStackCapacities) {
        if (typeof (destWarehouse.customStackCapacities as any).get === 'function') {
          customCap = (destWarehouse.customStackCapacities as any).get(customCapKey1) || (destWarehouse.customStackCapacities as any).get(customCapKey2);
        } else {
          customCap = (destWarehouse.customStackCapacities as any)[customCapKey1] || (destWarehouse.customStackCapacities as any)[customCapKey2];
        }
      }

      const destCapacity = Number(destStackObj.capacity || customCap || destWarehouse.stackCapacity || 1000);
      
      // Calculate how much weight is being deducted from this stack if it's also a source stack
      const selfDeduction = sources
        .filter(s => s.warehouseId === dest.warehouseId && cleanStr(s.chamberName || s.chamberNo) === destChamberClean && s.floorNo === dest.floorNo && s.stackNo === dest.stackNo)
        .reduce((sum, s) => sum + s.shiftWeight, 0);

      const netDestUsed = Math.max(0, destUsedWeight - selfDeduction);
      const destAvailableSpace = destCapacity - netDestUsed;

      if (destAvailableSpace < dest.allocatedWeight) {
        return {
          success: false,
          error: `Destination stack Stack ${dest.stackNo} capacity exceeded. Available space: ${destAvailableSpace.toFixed(2)} KG, Shifting quantity: ${dest.allocatedWeight} KG.`,
        };
      }
    }

    // 5. Execute Deductions from Sources and Additions to Destinations
    for (const src of sources) {
      const srcChamberClean = cleanStr(src.chamberName || src.chamberNo);
      const matchingAlloc = allocations.find((alloc: any) => {
        const cClean = cleanStr(alloc.chamberName || alloc.chamberNo);
        return cClean === srcChamberClean && alloc.floorNo === src.floorNo && alloc.stackNo === src.stackNo;
      });

      if (matchingAlloc) {
        matchingAlloc.allocatedWeight -= src.shiftWeight;
        if (matchingAlloc.bagsCount !== undefined) {
          matchingAlloc.bagsCount = Math.max(0, matchingAlloc.bagsCount - src.shiftBags);
        }
      }
    }

    for (const dest of dests) {
      const destChamberClean = cleanStr(dest.chamberName || dest.chamberNo);
      const matchingAlloc = allocations.find((alloc: any) => {
        const cClean = cleanStr(alloc.chamberName || alloc.chamberNo);
        return cClean === destChamberClean && alloc.floorNo === dest.floorNo && alloc.stackNo === dest.stackNo;
      });

      if (matchingAlloc) {
        matchingAlloc.allocatedWeight += dest.allocatedWeight;
        matchingAlloc.isStockShifting = true;
        if (matchingAlloc.bagsCount !== undefined) {
          matchingAlloc.bagsCount = (matchingAlloc.bagsCount || 0) + dest.bagsCount;
        } else {
          matchingAlloc.bagsCount = dest.bagsCount;
        }
        if (dest.floorName) matchingAlloc.floorName = dest.floorName;
        if (dest.warehouseId) matchingAlloc.warehouseId = new mongoose.Types.ObjectId(dest.warehouseId) as any;
      } else {
        allocations.push({
          warehouseId: new mongoose.Types.ObjectId(dest.warehouseId) as any,
          chamberName: dest.chamberName,
          chamberNo: dest.chamberNo,
          floorNo: dest.floorNo,
          floorName: dest.floorName,
          stackNo: dest.stackNo,
          allocatedWeight: dest.allocatedWeight,
          bagsCount: dest.bagsCount,
          stockType: inward.stockType === 'Purchase' ? 'Purchase' : 'Self',
          isStockShifting: true,
        });
      }
    }

    // Filter out remaining 0-weight allocations
    inward.stackAllocations = allocations.filter((alloc: any) => alloc.allocatedWeight > 0);

    // Update top-level location fields on ColdInward
    if (inward.stackAllocations.length > 0) {
      const primaryAlloc = inward.stackAllocations[0];
      (inward as any).chamberName = primaryAlloc.chamberName;
      (inward as any).chamberNo = primaryAlloc.chamberNo;
      (inward as any).floorNo = primaryAlloc.floorNo;
      if (primaryAlloc.floorName) (inward as any).floorName = primaryAlloc.floorName;
      (inward as any).stackNo = primaryAlloc.stackNo;
      if (primaryAlloc.warehouseId) {
        inward.warehouseId = primaryAlloc.warehouseId;
      } else if (dests[0]?.warehouseId) {
        inward.warehouseId = new mongoose.Types.ObjectId(dests[0].warehouseId) as any;
      }
    }

    await inward.save();

    // 6. Record ColdStockShifting Document
    const totalShiftings = await ColdStockShifting.countDocuments({ ...tenantFilter });
    const receiptNo = `SHIFT-${String(totalShiftings + 1).padStart(4, '0')}`;
    const qrId = `SHIFT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const firstSource = sources[0];
    const firstDest = dests[0];

    const shiftingData = appendOwnership(
      {
        receiptNo,
        date: data.date ? new Date(data.date) : new Date(),
        clientId: data.clientId,
        inwardId: data.inwardId,
        commodityId: inward.commodityId,
        
        sourceAllocations: sources,
        destAllocations: dests,

        // Legacy fields for backward compatibility
        sourceWarehouseId: firstSource.warehouseId,
        sourceChamberName: firstSource.chamberName,
        sourceChamberNo: firstSource.chamberNo,
        sourceFloorNo: firstSource.floorNo,
        sourceStackNo: firstSource.stackNo,

        destWarehouseId: firstDest.warehouseId,
        destChamberName: firstDest.chamberName,
        destChamberNo: firstDest.chamberNo,
        destFloorNo: firstDest.floorNo,
        destStackNo: firstDest.stackNo,

        quantityKg: totalSourceWeight,
        bagsCount: totalSourceBags,
        remarks: data.remarks || '',
        note: data.note || '',
        qrId,
      },
      session
    );

    const newShifting = await ColdStockShifting.create(shiftingData);

    revalidatePath('/cold/floor-mapping');
    revalidatePath('/cold/stock-shifting');
    revalidatePath('/cold/inward');

    return {
      success: true,
      shiftingId: newShifting._id.toString(),
      receiptNo,
      message: 'Internal stock shifting recorded successfully.',
    };
  } catch (error: any) {
    console.error('Error in createColdStockShifting:', error);
    return { success: false, error: error.message || 'Failed to record stock shifting' };
  }
}

export async function getColdStockShiftings() {
  try {
    await connectToDatabase();
    const session = await requireSession();
    const tenantFilter = getTenantFilter(session);

    if (!hasPermission(session, 'stockShifting', 'view')) {
      return [];
    }

    const shiftings = await ColdStockShifting.find({ ...tenantFilter })
      .populate('clientId', 'name')
      .populate('commodityId', 'name type unit')
      .populate('sourceWarehouseId', 'name')
      .populate('destWarehouseId', 'name')
      .populate('sourceAllocations.warehouseId', 'name')
      .populate('destAllocations.warehouseId', 'name')
      .populate('inwardId', 'weighbridgeSlipNo date')
      .sort({ date: -1, createdAt: -1 })
      .lean();

    return JSON.parse(JSON.stringify(shiftings));
  } catch (error: any) {
    console.error('Error in getColdStockShiftings:', error);
    return [];
  }
}

export async function getColdStockShiftingById(id: string) {
  try {
    await connectToDatabase();
    const session = await requireSession();
    const tenantFilter = getTenantFilter(session);

    if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;

    const shifting = await ColdStockShifting.findOne({ _id: id, ...tenantFilter })
      .populate('clientId', 'name address village')
      .populate('commodityId', 'name type unit')
      .populate('sourceWarehouseId', 'name address')
      .populate('destWarehouseId', 'name address')
      .populate('sourceAllocations.warehouseId', 'name address')
      .populate('destAllocations.warehouseId', 'name address')
      .populate('inwardId')
      .lean();

    if (!shifting) return null;
    return JSON.parse(JSON.stringify(shifting));
  } catch (error: any) {
    console.error('Error in getColdStockShiftingById:', error);
    return null;
  }
}

export async function getAvailableInwardsForShifting(clientId: string) {
  try {
    await connectToDatabase();
    const session = await requireSession();
    const tenantFilter = getTenantFilter(session);

    if (!clientId) return [];

    const inwards = await ColdInward.find({
      clientId: new mongoose.Types.ObjectId(clientId),
      ...tenantFilter,
      'stackAllocations.allocatedWeight': { $gt: 0 },
    })
      .populate('commodityId', 'name type unit')
      .populate('warehouseId', 'name chambers')
      .sort({ date: -1 })
      .lean();

    return JSON.parse(JSON.stringify(inwards));
  } catch (error: any) {
    console.error('Error in getAvailableInwardsForShifting:', error);
    return [];
  }
}

export async function getFloorStackCapacities(warehouseId: string, chamberName: string, floorNo: number) {
  try {
    await connectToDatabase();
    const session = await requireSession();
    const tenantFilter = getTenantFilter(session);

    if (!warehouseId || !chamberName || !floorNo) return {};

    const cleanStr = (val: any) => String(val || '').toLowerCase().replace(/^(chamber|floor|stack|c|f|s)\s*/i, '').trim();

    const warehouse = await ColdWarehouse.findOne({
      _id: warehouseId,
      ...tenantFilter,
      ...getWarehouseFilter(session, '_id'),
    }).lean();

    if (!warehouse || !warehouse.chambers) return {};

    const targetChamberClean = cleanStr(chamberName);
    const chamber = warehouse.chambers.find((c: any) => cleanStr(c.name || c.chamberNo) === targetChamberClean);
    if (!chamber || !chamber.floors) return {};

    const floor = chamber.floors.find((f: any) => f.floorNo === Number(floorNo));
    if (!floor || !floor.stacks) return {};

    // Get all inwards for this chamber and floor
    const inwards = await ColdInward.find({
      $and: [
        {
          $or: [
            { warehouseId },
            { 'stackAllocations.warehouseId': warehouseId }
          ]
        },
        {
          $or: [
            { 'stackAllocations.chamberName': chamberName },
            ...(chamber?.chamberNo ? [{ 'stackAllocations.chamberNo': chamber.chamberNo }] : [])
          ]
        }
      ],
      'stackAllocations.floorNo': Number(floorNo),
      ...tenantFilter
    }).lean();

    // Get all outwards for this chamber and floor
    const outwards = await ColdOutward.find({
      warehouseId,
      $or: [
        { chamberName: chamberName },
        ...(chamber?.chamberNo ? [{ chamberNo: chamber.chamberNo }] : [])
      ],
      floorNo: Number(floorNo),
      ...tenantFilter
    }).lean();

    const capacitiesMap: Record<number, { capacity: number; usedCapacity: number; availableCapacity: number }> = {};

    floor.stacks.forEach((s: any) => {
      const customCapKey1 = `${chamber.chamberNo}-${floor.floorNo}-${s.stackNo}`;
      const customCapKey2 = `${chamber.name || chamber.chamberNo}-${floor.name || floor.floorNo}-${s.stackNo}`;
      let customCap: number | undefined = undefined;

      if (warehouse.customStackCapacities) {
        if (typeof (warehouse.customStackCapacities as any).get === 'function') {
          customCap = (warehouse.customStackCapacities as any).get(customCapKey1) || (warehouse.customStackCapacities as any).get(customCapKey2);
        } else {
          customCap = (warehouse.customStackCapacities as any)[customCapKey1] || (warehouse.customStackCapacities as any)[customCapKey2];
        }
      }

      const totalCap = Number(s.capacity || customCap || warehouse.stackCapacity || 1000);
      let usedWeight = 0;

      inwards.forEach((inw: any) => {
        (inw.stackAllocations || []).forEach((alloc: any) => {
          if (
            cleanStr(alloc.chamberName || alloc.chamberNo) === targetChamberClean &&
            alloc.floorNo === Number(floorNo) &&
            alloc.stackNo === s.stackNo
          ) {
            usedWeight += Number(alloc.allocatedWeight || 0);
          }
        });
      });

      outwards.forEach((outw: any) => {
        if (outw.stackNo === s.stackNo) {
          usedWeight -= Number(outw.quantityKg || 0);
        }
      });

      usedWeight = Math.max(0, usedWeight);
      const availCap = Math.max(0, totalCap - usedWeight);

      capacitiesMap[s.stackNo] = {
        capacity: totalCap,
        usedCapacity: usedWeight,
        availableCapacity: availCap,
      };
    });

    return capacitiesMap;
  } catch (error: any) {
    console.error('Error in getFloorStackCapacities:', error);
    return {};
  }
}
