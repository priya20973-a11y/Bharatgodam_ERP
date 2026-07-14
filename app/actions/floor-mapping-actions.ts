'use server';

import connectToDatabase from '@/lib/mongoose';
import ColdWarehouse from '@/lib/models/ColdWarehouse';
import ColdInward from '@/lib/models/ColdInward';
import ColdOutward from '@/lib/models/ColdOutward';
import { hasPermission } from '@/lib/permissions';
import { requireSession, getTenantFilter } from '@/lib/ownership';
import { Types } from 'mongoose';

export async function getFloorInventory(warehouseId: string, chamberNo: number, floorNo: number) {
  try {
    await connectToDatabase();
    const session = await requireSession();
    const tenantFilter = getTenantFilter(session);

    // Get the warehouse layout details
    const warehouse = await ColdWarehouse.findOne({ _id: warehouseId, ...tenantFilter }).lean();
    if (!warehouse) throw new Error('Warehouse not found');

    const chamber = warehouse.chambers.find((c: any) => c.chamberNo === chamberNo);
    if (!chamber) throw new Error('Chamber not found');

    const floor = chamber.floors.find((f: any) => f.floorNo === floorNo);
    if (!floor) throw new Error('Floor not found');

    // Get all inwards for this floor
    const inwards = await ColdInward.find({
      warehouseId,
      chamberNo,
      floorNo,
      ...tenantFilter
    }).populate('commodityId', 'name type').lean();

    // Get all outwards for this floor
    const outwards = await ColdOutward.find({
      warehouseId,
      chamberNo,
      floorNo,
      ...tenantFilter
    }).lean();

    // Group active inventory by stack
    const stacksMap = new Map();
    
    floor.stacks.forEach((s: any) => {
      stacksMap.set(s.stackNo, {
        stackNo: s.stackNo,
        capacity: s.capacity,
        usedCapacity: 0,
        clients: new Set(),
        commodities: new Map(), // map commodity display string to qty
      });
    });

    // Process inwards
    inwards.forEach((inward: any) => {
      const s = stacksMap.get(inward.stackNo);
      if (s) {
        s.usedCapacity += inward.quantityKg;
        
        if (inward.farmerName) s.clients.add(inward.farmerName);
        else if (inward.referencePersons && inward.referencePersons.length > 0) {
          inward.referencePersons.forEach((rp: any) => s.clients.add(rp.name));
        }

        const type = inward.commodityId?.type ? ` (${inward.commodityId.type})` : '';
        const gradeOrWet = inward.grade ? `(${inward.grade})` : (inward.gradingType && inward.gradingType !== 'Grading' ? `(${inward.gradingType})` : '');
        const commodityDisplay = `${inward.commodityId?.name || 'Unknown'}${type}${gradeOrWet}`;

        const currentQty = s.commodities.get(commodityDisplay) || 0;
        s.commodities.set(commodityDisplay, currentQty + inward.quantityKg);
      }
    });

    // Process outwards
    outwards.forEach((outward: any) => {
      const s = stacksMap.get(outward.stackNo);
      if (s) {
        s.usedCapacity -= outward.quantityKg;
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
        status
      };
    });

    return {
      success: true,
      data: {
        warehouseId,
        chamberNo,
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

export async function getStackDetails(warehouseId: string, chamberNo: number, floorNo: number, stackNo: number) {
  try {
    await connectToDatabase();
    const session = await requireSession();
    const tenantFilter = getTenantFilter(session);

    const warehouse = await ColdWarehouse.findOne({ _id: warehouseId, ...tenantFilter }).lean();
    if (!warehouse) throw new Error('Warehouse not found');

    const chamber = warehouse.chambers.find((c: any) => Number(c.chamberNo) === Number(chamberNo));
    const floor = chamber?.floors.find((f: any) => Number(f.floorNo) === Number(floorNo));
    const stack = floor?.stacks.find((s: any) => Number(s.stackNo) === Number(stackNo));
    if (!stack) throw new Error(`Stack ${stackNo} not found in Chamber ${chamberNo}, Floor ${floorNo}`);

    const inwards = await ColdInward.find({ warehouseId, chamberNo, floorNo, stackNo, ...tenantFilter })
      .populate('commodityId', 'name type')
      .populate('clientId', 'name')
      .lean();

    const outwards = await ColdOutward.find({ warehouseId, chamberNo, floorNo, stackNo, ...tenantFilter })
      .lean();

    let usedCapacity = 0;
    const clients = new Set<string>();
    const referencePersons = new Set<string>();
    const commodities = new Map<string, number>();

    const transactions: any[] = [];
    const activeStocksMap = new Map<string, any>();

    inwards.forEach((inward: any) => {
      usedCapacity += inward.quantityKg;
      
      const clientName = inward.clientId?.name;
      if (clientName) clients.add(clientName);
      if (inward.farmerName) clients.add(inward.farmerName);
      if (inward.referencePersons) {
        inward.referencePersons.forEach((rp: any) => {
          if (rp.name) referencePersons.add(rp.name);
          if (!clientName && !inward.farmerName) clients.add(rp.name); // Fallback
        });
      }

      const type = inward.commodityId?.type ? ` (${inward.commodityId.type})` : '';
      const gradeOrWet = inward.grade ? `(${inward.grade})` : (inward.gradingType && inward.gradingType !== 'Grading' ? `(${inward.gradingType})` : '');
      const commodityDisplay = `${inward.commodityId?.name || 'Unknown'}${type}${gradeOrWet}`;

      const currentQty = commodities.get(commodityDisplay) || 0;
      commodities.set(commodityDisplay, currentQty + inward.quantityKg);

      activeStocksMap.set(inward._id.toString(), {
        id: inward._id.toString(),
        client: inward.clientId?.name || 'Unknown',
        farmer: inward.farmerName || '-',
        commodity: commodityDisplay,
        quantity: inward.quantityKg,
        truckNo: inward.truckNo || '-',
        date: inward.createdAt,
        referencePersons: inward.referencePersons && inward.referencePersons.length > 0 
          ? inward.referencePersons.map((rp: any) => rp.name).join(', ') 
          : '-',
        largeBags: inward.bagsCount || 0,
        smallBags: inward.jin || 0,
        mixedBags: inward.mixed || 0,
        totalBags: inward.totalBags || ((inward.bagsCount || 0) + (inward.jin || 0) + (inward.mixed || 0)),
      });

      transactions.push({
        id: inward._id.toString(),
        date: inward.createdAt,
        type: 'INWARD',
        receiptNo: inward.weighbridgeSlipNo || `INW-${inward._id.toString().slice(-6).toUpperCase()}`,
        commodity: commodityDisplay,
        quantity: inward.quantityKg,
        client: inward.clientId?.name || inward.farmerName || inward.referencePersons?.[0]?.name || 'Unknown'
      });
    });

    outwards.forEach((outward: any) => {
      usedCapacity -= outward.quantityKg;

      if (outward.inwardId) {
        const matchingInward: any = inwards.find((i: any) => i._id.toString() === outward.inwardId.toString());
        if (matchingInward) {
          const type = matchingInward.commodityId?.type ? ` (${matchingInward.commodityId.type})` : '';
          const gradeOrWet = matchingInward.grade ? `(${matchingInward.grade})` : (matchingInward.gradingType && matchingInward.gradingType !== 'Grading' ? `(${matchingInward.gradingType})` : '');
          const commodityDisplay = `${matchingInward.commodityId?.name || 'Unknown'}${type}${gradeOrWet}`;
          
          const currentQty = commodities.get(commodityDisplay) || 0;
          commodities.set(commodityDisplay, Math.max(0, currentQty - outward.quantityKg));
          
          const idStr = outward.inwardId.toString();
          if (activeStocksMap.has(idStr)) {
            const stock = activeStocksMap.get(idStr);
            stock.quantity -= outward.quantityKg;
            stock.largeBags -= outward.bagsCount || 0;
            stock.smallBags -= outward.jin || 0;
            stock.mixedBags -= outward.mixed || 0;
            stock.totalBags -= outward.totalBags || ((outward.bagsCount || 0) + (outward.jin || 0) + (outward.mixed || 0));
          }
          
          transactions.push({
            id: outward._id.toString(),
            date: outward.createdAt,
            type: 'OUTWARD',
            receiptNo: outward.weighbridgeSlipNo || `OUT-${outward._id.toString().slice(-6).toUpperCase()}`,
            commodity: commodityDisplay,
            quantity: outward.quantityKg,
            client: matchingInward.clientId?.name || matchingInward.farmerName || matchingInward.referencePersons?.[0]?.name || 'Unknown'
          });
        } else {
          transactions.push({
            id: outward._id.toString(),
            date: outward.createdAt,
            type: 'OUTWARD',
            receiptNo: outward.weighbridgeSlipNo || `OUT-${outward._id.toString().slice(-6).toUpperCase()}`,
            commodity: 'Unknown',
            quantity: outward.quantityKg,
            client: 'Unknown'
          });
        }
      }
    });

    transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    let status = 'Empty';
    if (usedCapacity > 0) {
      status = usedCapacity >= stack.capacity ? 'Full' : 'Partial';
    }

    return {
      success: true,
      data: {
        stackNo,
        capacity: stack.capacity,
        usedCapacity,
        availableCapacity: Math.max(0, stack.capacity - usedCapacity),
        commodities: Array.from(commodities.entries()).filter(([_, q]) => q > 0).map(([c, _]) => c),
        clients: Array.from(clients),
        referencePersons: Array.from(referencePersons),
        activeStocks: Array.from(activeStocksMap.values()).filter(s => s.quantity > 0),
        status,
        transactions
      }
    };

  } catch (error: any) {
    console.error('getStackDetails Error:', error);
    return { success: false, error: error.message };
  }
}
