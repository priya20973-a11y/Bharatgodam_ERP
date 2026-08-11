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
      warehouseId,
      $or: [
        { 'stackAllocations.chamberName': chamberName },
        ...(chamber?.chamberNo ? [{ 'stackAllocations.chamberNo': chamber.chamberNo }] : [])
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
    }).lean();

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
      stacksMap.set(s.stackNo, {
        stackNo: s.stackNo,
        capacity: s.capacity,
        usedCapacity: 0,
        clients: new Set(),
        commodities: new Map(), // map commodity display string to qty
        totalBags: 0,
        receiptNos: new Set(),
        records: []
      });
    });

    // Process inwards
    inwards.forEach((inward: any) => {
      if (!inward.stackAllocations) return;
      inward.stackAllocations.forEach((alloc: any) => {
        if ((alloc.chamberName === chamberName || alloc.chamberNo === chamber?.chamberNo) && alloc.floorNo === floorNo) {
          const s = stacksMap.get(alloc.stackNo);
          if (s) {
            s.usedCapacity += alloc.allocatedWeight;
            s.totalBags += (alloc.bagsCount || 0);
            
            const receiptNo = inward.weighbridgeSlipNo || `INW-${inward._id.toString().slice(-6).toUpperCase()}`;
            s.receiptNos.add(receiptNo);
            
            if (inward.farmerName) s.clients.add(inward.farmerName);
            else if (inward.referencePersons && inward.referencePersons.length > 0) {
              inward.referencePersons.forEach((rp: any) => s.clients.add(rp.name));
            }

            const type = inward.commodityId?.type ? ` (${inward.commodityId.type})` : '';
            const gradeOrWet = inward.grade ? `(${inward.grade})` : (inward.gradingType && inward.gradingType !== 'Grading' ? `(${inward.gradingType})` : '');
            const commodityDisplay = `${inward.commodityId?.name || 'Unknown'}${type}${gradeOrWet}`;

            const currentQty = s.commodities.get(commodityDisplay) || 0;
            s.commodities.set(commodityDisplay, currentQty + alloc.allocatedWeight);

            s.records.push({
              inwardId: inward._id.toString(),
              clientName: inward.clientId?.name || 'Unknown',
              farmerName: inward.farmerName || '-',
              referencePerson: inward.referencePersons && inward.referencePersons.length > 0 ? inward.referencePersons.map((rp: any) => rp.name).join(', ') : '-',
              commodity: commodityDisplay,
              quantity: alloc.allocatedWeight,
              bags: (alloc.bagsCount || 0) + (inward.jin || 0) + (inward.mixed || 0),
              inwardDate: inward.date ? new Date(inward.date).toLocaleDateString('en-GB') : '-',
              previousOwner: previousOwnerMap.get(inward._id.toString()) || '-'
            });
          }
        }
      });
    });

    // Process outwards
    outwards.forEach((outward: any) => {
      const s = stacksMap.get(outward.stackNo);
      if (s) {
        s.usedCapacity -= outward.quantityKg;
        const outBags = outward.totalBags || ((outward.bagsCount || 0) + (outward.jin || 0) + (outward.mixed || 0));
        s.totalBags -= outBags;

        if (outward.inwardId) {
          const rec = s.records.find((r: any) => r.inwardId === outward.inwardId.toString());
          if (rec) {
            rec.quantity -= outward.quantityKg;
            rec.bags -= outBags;
          }
        }
      }
    });
    
    // Correctly process commodities with outwards if inwardId exists
    outwards.forEach((outward: any) => {
      const s = stacksMap.get(outward.stackNo);
      if (s && outward.inwardId) {
        const matchingInward: any = inwards.find((i: any) => i._id.toString() === outward.inwardId.toString());
        if (matchingInward) {
          const type = matchingInward.commodityId?.type ? ` (${matchingInward.commodityId.type})` : '';
          const gradeOrWet = matchingInward.grade ? `(${matchingInward.grade})` : (matchingInward.gradingType && matchingInward.gradingType !== 'Grading' ? `(${matchingInward.gradingType})` : '');
          const commodityDisplay = `${matchingInward.commodityId?.name || 'Unknown'}${type}${gradeOrWet}`;
          
          const currentQty = s.commodities.get(commodityDisplay) || 0;
          s.commodities.set(commodityDisplay, Math.max(0, currentQty - outward.quantityKg));
        }
      }
    });

    const stackData = Array.from(stacksMap.values()).map(s => {
      const activeCommodities = Array.from(s.commodities.entries())
        .filter(([_, qty]: any) => qty > 0)
        .map(([name, _]: any) => name);

      let status = 'Empty';
      if (s.usedCapacity > 0) {
        status = s.usedCapacity >= s.capacity ? 'Full' : 'Partial';
      }

      return {
        stackNo: s.stackNo,
        capacity: s.capacity,
        usedCapacity: s.usedCapacity,
        availableCapacity: Math.max(0, s.capacity - s.usedCapacity),
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
        stackLayout: warehouse.stackLayout,
        gridRows: warehouse.gridRows,
        gridCols: warehouse.gridCols,
        customLayout: warehouse.customLayout,
        noOfStacks: floor.stacks.length,
        stacks: stackData
      }
    };

  } catch (error: any) {
    console.error('getFloorInventory Error:', error);
    return { success: false, error: error.message };
  }
}


