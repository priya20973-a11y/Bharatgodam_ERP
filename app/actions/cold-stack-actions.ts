'use server';

import connectToDatabase from '@/lib/mongoose';
import ColdWarehouse from '@/lib/models/ColdWarehouse';
import ColdInward from '@/lib/models/ColdInward';
import ColdOutward from '@/lib/models/ColdOutward';
import { getTenantFilter, requireSession } from '@/lib/ownership';
import mongoose from 'mongoose';
import '@/lib/models/Client';
import '@/lib/models/ColdCommodity';

export async function getStackDetails(warehouseId: string, chamberName: string, floorNo: number, stackNo: number) {
  await connectToDatabase();
  const session = await requireSession();

  const warehouse = await ColdWarehouse.findOne({ _id: warehouseId, ...getTenantFilter(session) });
  if (!warehouse) return { success: false, error: 'Warehouse not found' };

  const chamber = warehouse.chambers.find((c: any) => c.name === chamberName || c.chamberNo === parseInt(chamberName));
  if (!chamber) return { success: false, error: 'Chamber not found' };

  const floor = chamber.floors.find((f: any) => f.floorNo === floorNo);
  if (!floor) return { success: false, error: 'Floor not found' };

  const stack = floor.stacks.find((s: any) => s.stackNo === stackNo);
  if (!stack) return { success: false, error: 'Stack not found' };

  const totalCapacity = stack.capacity;

  const matchCriteria = {
    $and: [
      { warehouseId: new mongoose.Types.ObjectId(warehouseId) },
      {
        $or: [
          { 'stackAllocations.chamberName': chamberName },
          ...(chamber.chamberNo ? [{ 'stackAllocations.chamberNo': chamber.chamberNo }] : [])
        ]
      },
      { 'stackAllocations.floorNo': floorNo },
      { 'stackAllocations.stackNo': stackNo },
      getTenantFilter(session)
    ]
  };

  const activeInwards = await ColdInward.find({
    warehouseId: new mongoose.Types.ObjectId(warehouseId),
    status: { $in: ['Active', 'Partial'] },
    'stackAllocations': {
      $elemMatch: {
        $or: [
          { chamberName: chamberName },
          ...(chamber.chamberNo ? [{ chamberNo: chamber.chamberNo }] : [])
        ],
        floorNo,
        stackNo
      }
    },
    ...getTenantFilter(session)
  })
    .populate('clientId', 'name')
    .populate('commodityId', 'name')
    .lean();

  const outwardCriteria = {
    $and: [
      { warehouseId: new mongoose.Types.ObjectId(warehouseId) },
      {
        $or: [
          { chamberName: chamberName },
          ...(chamber.chamberNo ? [{ chamberNo: chamber.chamberNo }] : [])
        ]
      },
      { floorNo },
      { stackNo },
      getTenantFilter(session)
    ]
  };

  const outwardsDocs = await ColdOutward.find(outwardCriteria).lean();

  const outwardMap = new Map();
  outwardsDocs.forEach((o: any) => {
    if (o.inwardId) {
      const idStr = o.inwardId.toString();
      const current = outwardMap.get(idStr) || 0;
      outwardMap.set(idStr, current + o.quantityKg);
    }
  });

  let occupied = 0;
  const currentStockList: any[] = [];
  const entries: any[] = [];
  const activeStocksMap = new Map<string, any>();
  const transactions: any[] = [];
  
  // We need to fetch all inwards related to outwards to correctly show outward transactions.
  // We'll keep a reference to inwards by ID.
  const allInwardsMap = new Map<string, any>();
  activeInwards.forEach(inward => allInwardsMap.set(inward._id.toString(), inward));

  activeInwards.forEach(inward => {
    let stackAllocated = 0;
    let allocBagsCount = 0;
    inward.stackAllocations.forEach((alloc: any) => {
      const matchChamber = alloc.chamberName === chamberName || (chamber.chamberNo && alloc.chamberNo === chamber.chamberNo);
      if (matchChamber && alloc.floorNo === floorNo && alloc.stackNo === stackNo) {
        stackAllocated += (alloc.allocatedWeight || 0);
        allocBagsCount += (alloc.bagsCount || 0);
      }
    });

    if (stackAllocated > 0) {
      const outQty = outwardMap.get(inward._id.toString()) || 0;
      const available = Math.max(0, stackAllocated - outQty);

      const type = (inward.commodityId as any)?.type ? ` (${(inward.commodityId as any).type})` : '';
      const gradeOrWet = inward.grade ? `(${inward.grade})` : (inward.gradingType && inward.gradingType !== 'Grading' ? `(${inward.gradingType})` : '');
      const commodityDisplay = `${(inward.commodityId as any)?.name || 'Unknown'}${type}${gradeOrWet}`;
      const clientNameDisplay = (inward.clientId as any)?.name || inward.farmerName || inward.referencePersons?.[0]?.name || 'Unknown';

      // Record inward transaction
      transactions.push({
        id: inward._id.toString(),
        date: inward.createdAt || inward.date,
        type: 'INWARD',
        receiptNo: inward.weighbridgeSlipNo || (inward as any).receiptNo || `INW-${inward._id.toString().slice(-6).toUpperCase()}`,
        commodity: commodityDisplay,
        quantity: stackAllocated,
        client: clientNameDisplay
      });

      if (available > 0) {
        occupied += available;

        currentStockList.push({
          clientId: inward.clientId?._id?.toString(),
          clientName: (inward.clientId as any)?.name || 'Unknown',
          commodityId: inward.commodityId?._id?.toString(),
          commodityName: (inward.commodityId as any)?.name || 'Unknown',
          quantity: available,
          unit: inward.unit,
          stockType: inward.stackAllocations.find((a: any) =>
            (a.chamberName === chamberName || a.chamberNo === chamber.chamberNo) && a.floorNo === floorNo && a.stackNo === stackNo
          )?.stockType || 'Self'
        });

        entries.push({
          _id: inward._id.toString(),
          receiptNo: (inward as any).receiptNo || inward.weighbridgeSlipNo,
          date: inward.date,
          clientName: clientNameDisplay,
          quantity: available,
          qrId: inward.qrId,
        });

        // Compute remaining bags for activeStocks
        // Note: For simplicity, we deduct outQty mostly from quantity. Outward bags deduction requires outward documents check.
        // We will process outward documents next to accurately update activeStocksMap bags.
        activeStocksMap.set(inward._id.toString(), {
          id: inward._id.toString(),
          client: (inward.clientId as any)?.name || 'Unknown',
          farmer: inward.farmerName || '-',
          commodity: commodityDisplay,
          quantity: stackAllocated, // We'll subtract outwards below
          truckNo: inward.truckNo || '-',
          date: inward.createdAt || inward.date,
          referencePersons: inward.referencePersons && inward.referencePersons.length > 0 
            ? inward.referencePersons.map((rp: any) => rp.name).join(', ') 
            : '-',
          largeBags: allocBagsCount || 0,
          smallBags: inward.jin || 0,
          mixedBags: inward.mixed || 0,
          totalBags: (allocBagsCount || 0) + (inward.jin || 0) + (inward.mixed || 0),
        });
      }
    }
  });

  outwardsDocs.forEach((outward: any) => {
    if (outward.inwardId) {
      const idStr = outward.inwardId.toString();
      const inward = allInwardsMap.get(idStr);
      
      let commodityDisplay = 'Unknown';
      let clientNameDisplay = 'Unknown';
      
      if (inward) {
        const type = inward.commodityId?.type ? ` (${inward.commodityId.type})` : '';
        const gradeOrWet = inward.grade ? `(${inward.grade})` : (inward.gradingType && inward.gradingType !== 'Grading' ? `(${inward.gradingType})` : '');
        commodityDisplay = `${(inward.commodityId as any)?.name || 'Unknown'}${type}${gradeOrWet}`;
        clientNameDisplay = (inward.clientId as any)?.name || inward.farmerName || inward.referencePersons?.[0]?.name || 'Unknown';
      }

      transactions.push({
        id: outward._id.toString(),
        date: outward.createdAt || outward.date,
        type: 'OUTWARD',
        receiptNo: outward.weighbridgeSlipNo || `OUT-${outward._id.toString().slice(-6).toUpperCase()}`,
        commodity: commodityDisplay,
        quantity: outward.quantityKg,
        client: clientNameDisplay
      });

      if (activeStocksMap.has(idStr)) {
        const stock = activeStocksMap.get(idStr);
        stock.quantity -= outward.quantityKg;
        stock.largeBags -= outward.bagsCount || 0;
        stock.smallBags -= outward.jin || 0;
        stock.mixedBags -= outward.mixed || 0;
        stock.totalBags -= outward.totalBags || ((outward.bagsCount || 0) + (outward.jin || 0) + (outward.mixed || 0));
      }
    }
  });

  transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Group currentStockList by Client + Commodity + StockType
  const groupedStock = new Map();
  currentStockList.forEach(st => {
    const key = `${st.clientId}_${st.commodityId}_${st.stockType}`;
    if (!groupedStock.has(key)) {
      groupedStock.set(key, { ...st });
    } else {
      groupedStock.get(key).quantity += st.quantity;
    }
  });

  const availableCapacity = Math.max(0, totalCapacity - occupied);
  const status = occupied >= totalCapacity ? 'Full' : occupied > 0 ? 'Partial' : 'Empty';

  return {
    success: true,
    data: {
      warehouseName: warehouse.name,
      warehouseId,
      chamberName,
      floorNo,
      stackNo,
      totalCapacity,
      capacity: totalCapacity, // Aliased for compatibility
      occupied,
      usedCapacity: occupied, // Aliased for compatibility
      availableCapacity,
      status,
      currentStock: Array.from(groupedStock.values()),
      inwards: entries,
      activeStocks: Array.from(activeStocksMap.values()).filter(s => s.quantity > 0),
      transactions
    }
  };
}
