'use server';

import connectToDatabase from '@/lib/mongoose';
import ColdWarehouse from '@/lib/models/ColdWarehouse';
import ColdInward from '@/lib/models/ColdInward';
import ColdOutward from '@/lib/models/ColdOutward';
import ColdTransfer from '@/lib/models/ColdTransfer';
import { hasPermission } from '@/lib/permissions';
import { requireSession, getTenantFilter, getWarehouseFilter } from '@/lib/ownership';
import { Types } from 'mongoose';

export async function getFloorInventory(warehouseId: string, chamberName: string, floorNo: number) {
  try {
    await connectToDatabase();
    const session = await requireSession();
    const tenantFilter = getTenantFilter(session);

    // Get the warehouse layout details
    const warehouse = await ColdWarehouse.findOne({ _id: warehouseId, ...tenantFilter, ...getWarehouseFilter(session, '_id') }).lean();
    if (!warehouse) throw new Error('Warehouse not found');

    const chamber = warehouse.chambers.find((c: any) => c.name === chamberName || c.chamberNo === parseInt(chamberName));
    if (!chamber) throw new Error('Chamber not found');

    const floor = chamber.floors.find((f: any) => f.floorNo === floorNo);
    if (!floor) throw new Error('Floor not found');

    // Get all inwards for this floor
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
      'stackAllocations.floorNo': floorNo,
      ...tenantFilter
    }).populate('commodityId', 'name type').populate('clientId', 'name').lean();

    // Get all outwards for this floor
    const outwards = await ColdOutward.find({
      warehouseId,
      $or: [
        { chamberName: chamberName },
        ...(chamber?.chamberNo ? [{ chamberNo: chamber.chamberNo }] : [])
      ],
      floorNo,
      ...tenantFilter
    })
      .populate('clientId', 'name clientType')
      .populate('commodityId', 'name type')
      .populate('inwardId')
      .lean();

    // Fetch previous owners via ColdTransfer
    const inwardIds = inwards.map((i: any) => i._id);
    const transfers = await ColdTransfer.find({ newInwardId: { $in: inwardIds } })
      .populate('fromClientId', 'name')
      .lean();
    
    const previousOwnerMap = new Map();
    transfers.forEach((t: any) => {
      if (t.newInwardId && t.fromClientId) {
        previousOwnerMap.set(t.newInwardId.toString(), t.fromClientId.name || '-');
      }
    });

    // Group active inventory by stack
    const stacksMap = new Map();
    
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
      const cap = Number(s.capacity || customCap || warehouse.stackCapacity || 1000);

      stacksMap.set(s.stackNo, {
        stackNo: s.stackNo,
        capacity: cap,
        usedCapacity: 0,
        clients: new Set(),
        commodities: new Map(), // map commodity display string to qty
        totalBags: 0,
        receiptNos: new Set(),
        records: []
      });
    });

    // Map outwards by inwardId -> total outward quantity
    const outwardMap = new Map<string, number>();
    outwards.forEach((o: any) => {
      const inwardIdStr = (o.inwardId?._id || o.inwardId)?.toString();
      if (inwardIdStr) {
        const current = outwardMap.get(inwardIdStr) || 0;
        outwardMap.set(inwardIdStr, current + (o.quantityKg || 0));
      }
    });

    const remainingOutwardMap = new Map<string, number>(outwardMap);

    // Process inwards
    inwards.forEach((inward: any) => {
      if (!inward.stackAllocations) return;
      const inwardIdStr = inward._id.toString();
      let remainingOutQty = remainingOutwardMap.get(inwardIdStr) || 0;

      inward.stackAllocations.forEach((alloc: any) => {
        const matchChamber = (
          alloc.chamberName === chamberName || 
          (chamber?.chamberNo && alloc.chamberNo === chamber.chamberNo) ||
          (chamber?.name && alloc.chamberName === chamber.name)
        );

        if (matchChamber && alloc.floorNo === floorNo) {
          const s = stacksMap.get(alloc.stackNo);
          if (s) {
            const allocWeight = alloc.allocatedWeight || 0;
            let allocAvailable = allocWeight;

            if (remainingOutQty > 0) {
              const deduct = Math.min(allocAvailable, remainingOutQty);
              allocAvailable -= deduct;
              remainingOutQty -= deduct;
              remainingOutwardMap.set(inwardIdStr, remainingOutQty);
            }

            s.usedCapacity += allocAvailable;
            
            if (allocAvailable > 0) {
              s.totalBags += (alloc.bagsCount || 0);
              
              const receiptNo = inward.weighbridgeSlipNo || `INW-${inwardIdStr.slice(-6).toUpperCase()}`;
              s.receiptNos.add(receiptNo);
              
              const resolvedClientName = inward.clientId?.name || inward.farmerName || inward.referencePersons?.[0]?.name || 'Unknown';
              if (resolvedClientName && resolvedClientName !== 'Unknown') {
                s.clients.add(resolvedClientName);
              }

              const type = inward.commodityId?.type ? ` (${inward.commodityId.type})` : '';
              const gradeOrWet = inward.grade ? `(${inward.grade})` : (inward.gradingType && inward.gradingType !== 'Grading' ? `(${inward.gradingType})` : '');
              const commodityDisplay = `${inward.commodityId?.name || 'Unknown'}${type}${gradeOrWet}`;

              const currentQty = s.commodities.get(commodityDisplay) || 0;
              s.commodities.set(commodityDisplay, currentQty + allocAvailable);

              s.records.push({
                inwardId: inwardIdStr,
                clientName: resolvedClientName,
                farmerName: inward.farmerName || '-',
                referencePerson: inward.referencePersons && inward.referencePersons.length > 0 ? inward.referencePersons.map((rp: any) => rp.name).join(', ') : '-',
                commodity: commodityDisplay,
                quantity: allocAvailable,
                bags: (alloc.bagsCount || 0) + (inward.jin || 0) + (inward.mixed || 0),
                inwardDate: inward.date ? new Date(inward.date).toLocaleDateString('en-GB') : '-',
                previousOwner: previousOwnerMap.get(inwardIdStr) || '-'
              });
            }
          }
        }
      });
    });

    const stackData = Array.from(stacksMap.values()).map(s => {
      const activeCommodities = Array.from(s.commodities.entries())
        .filter(([_, qty]: any) => qty > 0)
        .map(([name, _]: any) => name);

      const capacity = Number(s.capacity || 1000);
      const usedCapacity = Math.round(s.usedCapacity * 100) / 100;
      const availableCapacity = Math.max(0, Math.round((capacity - usedCapacity) * 100) / 100);

      // Rules:
      // Used >= Capacity -> FULL
      // Used > 0 && Used < Capacity -> PARTIAL
      // Used = 0 -> EMPTY
      let status = 'Empty';
      if (usedCapacity >= capacity - 0.01) {
        status = 'Full';
      } else if (usedCapacity > 0) {
        status = 'Partial';
      }

      return {
        stackNo: s.stackNo,
        capacity,
        usedCapacity,
        availableCapacity,
        clients: Array.from(s.clients),
        commodities: activeCommodities,
        bags: Math.max(0, s.totalBags),
        receiptNos: Array.from(s.receiptNos),
        status,
        records: s.records.filter((r: any) => r.quantity > 0)
      };
    });

    return {
      success: true,
      data: {
        warehouseId,
        chamberName,
        floorNo,
        stackLayout: floor.stackLayout || warehouse.stackLayout || 'ROW_WISE',
        gridRows: floor.gridRows || warehouse.gridRows,
        gridCols: floor.gridCols || warehouse.gridCols,
        customLayout: (floor.customLayout && floor.customLayout.length > 0) ? floor.customLayout : warehouse.customLayout,
        noOfStacks: floor.stacks.length,
        stacks: stackData
      }
    };

  } catch (error: any) {
    console.error('getFloorInventory Error:', error);
    return { success: false, error: error.message };
  }
}


