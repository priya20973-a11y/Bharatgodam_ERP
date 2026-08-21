'use server';

import connectToDatabase from '@/lib/mongoose';
import ColdWarehouse from '@/lib/models/ColdWarehouse';
import ColdInward from '@/lib/models/ColdInward';
import ColdOutward from '@/lib/models/ColdOutward';
import { getTenantFilter, requireSession } from '@/lib/ownership';
import mongoose from 'mongoose';
import '@/lib/models/ColdCommodity';
import ColdTransfer from '@/lib/models/ColdTransfer';

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

  const allStackInwards = await ColdInward.find({
    warehouseId: new mongoose.Types.ObjectId(warehouseId),
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
    .populate('clientId', 'name clientType')
    .populate('commodityId', 'name type')
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

  const outwardsDocs = await ColdOutward.find(outwardCriteria)
    .populate('clientId', 'name clientType')
    .populate('commodityId', 'name type')
    .populate({
      path: 'inwardId',
      populate: [
        { path: 'clientId', select: 'name clientType' },
        { path: 'commodityId', select: 'name type' }
      ]
    })
    .lean();

  const allInwardsMap = new Map<string, any>();
  allStackInwards.forEach(inward => allInwardsMap.set(inward._id.toString(), inward));

  const missingInwardIds: mongoose.Types.ObjectId[] = [];
  outwardsDocs.forEach((o: any) => {
    if (o.inwardId) {
      const inwardObj = typeof o.inwardId === 'object' ? o.inwardId : null;
      const inwardIdStr = (inwardObj?._id || o.inwardId).toString();
      if (inwardObj && inwardObj._id) {
        allInwardsMap.set(inwardIdStr, inwardObj);
      } else if (!allInwardsMap.has(inwardIdStr)) {
        missingInwardIds.push(new mongoose.Types.ObjectId(inwardIdStr));
      }
    }
  });

  if (missingInwardIds.length > 0) {
    const extraInwards = await ColdInward.find({ _id: { $in: missingInwardIds }, ...getTenantFilter(session) })
      .populate('clientId', 'name clientType')
      .populate('commodityId', 'name type')
      .lean();
    extraInwards.forEach(inward => allInwardsMap.set(inward._id.toString(), inward));
  }

  const getResolvedClientName = (doc: any, linkedInward?: any): string => {
    if (linkedInward) {
      const inwardClient = (linkedInward.clientId as any)?.name || linkedInward.farmerName || linkedInward.referencePersons?.[0]?.name;
      if (inwardClient && inwardClient !== 'Unknown') return inwardClient;
    }
    if (doc) {
      const docClient = (doc.clientId as any)?.name || doc.farmerName || doc.referencePersons?.[0]?.name;
      if (docClient && docClient !== 'Unknown') return docClient;
    }
    return 'Unknown';
  };

  const getResolvedCommodityDisplay = (doc: any, linkedInward?: any): string => {
    const comm = linkedInward?.commodityId || doc?.commodityId;
    const grade = linkedInward?.grade || doc?.grade;
    const gradingType = linkedInward?.gradingType || doc?.gradingType;
    
    const commName = (comm as any)?.name || 'Unknown';
    const commType = (comm as any)?.type ? ` (${(comm as any).type})` : '';
    const gradeOrWet = grade ? `(${grade})` : (gradingType && gradingType !== 'Grading' ? `(${gradingType})` : '');
    
    return `${commName}${commType}${gradeOrWet}`;
  };

  const outwardSummaryMap = new Map<string, { quantityKg: number, bagsCount: number, jin: number, mixed: number, totalBags: number }>();
  outwardsDocs.forEach((o: any) => {
    const inwardIdStr = (o.inwardId?._id || o.inwardId)?.toString();
    if (inwardIdStr) {
      const current = outwardSummaryMap.get(inwardIdStr) || { quantityKg: 0, bagsCount: 0, jin: 0, mixed: 0, totalBags: 0 };
      const bags = o.bagsCount || 0;
      const jin = o.jin || 0;
      const mixed = o.mixed || 0;
      const totalBags = o.totalBags || (bags + jin + mixed);
      outwardSummaryMap.set(inwardIdStr, {
        quantityKg: current.quantityKg + (o.quantityKg || 0),
        bagsCount: current.bagsCount + bags,
        jin: current.jin + jin,
        mixed: current.mixed + mixed,
        totalBags: current.totalBags + totalBags
      });
    }
  });

  let occupied = 0;
  const currentStockList: any[] = [];
  const entries: any[] = [];
  const activeStocksMap = new Map<string, any>();
  const transactions: any[] = [];

  const inwardIds = allStackInwards.map(i => i._id);
  const transfers = await ColdTransfer.find({ newInwardId: { $in: inwardIds } })
    .populate('fromClientId', 'name')
    .lean();
    
  const previousOwnerMap = new Map();
  transfers.forEach((t: any) => {
    if (t.newInwardId && t.fromClientId) {
      previousOwnerMap.set(t.newInwardId.toString(), t.fromClientId.name || '-');
    }
  });

  allStackInwards.forEach(inward => {
    const inwardIdStr = inward._id.toString();
    const outData = outwardSummaryMap.get(inwardIdStr) || { quantityKg: 0, bagsCount: 0, jin: 0, mixed: 0, totalBags: 0 };
    
    let remainingOutQty = outData.quantityKg;
    let stackAllocated = 0;
    let allocBagsCount = 0;
    let stackAvailable = 0;

    inward.stackAllocations.forEach((alloc: any) => {
      const matchChamber = alloc.chamberName === chamberName || (chamber.chamberNo && alloc.chamberNo === chamber.chamberNo);
      if (matchChamber && alloc.floorNo === floorNo && alloc.stackNo === stackNo) {
        stackAllocated += (alloc.allocatedWeight || 0);
        allocBagsCount += (alloc.bagsCount || 0);
        
        let allocAvailable = alloc.allocatedWeight || 0;
        if (remainingOutQty > 0) {
          const deduct = Math.min(allocAvailable, remainingOutQty);
          allocAvailable -= deduct;
          remainingOutQty -= deduct;
        }
        
        stackAvailable += allocAvailable;

        if (allocAvailable > 0) {
          occupied += allocAvailable;
          currentStockList.push({
            clientId: inward.clientId?._id?.toString(),
            clientName: getResolvedClientName(inward),
            commodityId: inward.commodityId?._id?.toString(),
            commodityName: getResolvedCommodityDisplay(inward),
            quantity: allocAvailable,
            unit: inward.unit || 'KG',
            stockType: (inward.clientId as any)?.clientType === 'PURCHASE' ? 'Purchase' : (alloc.stockType || 'Self')
          });
        }
      }
    });

    if (stackAllocated > 0) {
      const commodityDisplay = getResolvedCommodityDisplay(inward);
      const clientNameDisplay = getResolvedClientName(inward);

      transactions.push({
        id: inwardIdStr,
        createdAt: inward.createdAt || inward.date,
        date: inward.date || inward.createdAt,
        type: 'INWARD',
        receiptNo: inward.weighbridgeSlipNo || (inward as any).receiptNo || `INW-${inwardIdStr.slice(-6).toUpperCase()}`,
        commodity: commodityDisplay,
        quantity: stackAllocated,
        client: clientNameDisplay
      });

      if (stackAvailable > 0) {
        entries.push({
          _id: inwardIdStr,
          receiptNo: (inward as any).receiptNo || inward.weighbridgeSlipNo,
          date: inward.date,
          clientName: clientNameDisplay,
          quantity: stackAvailable,
          qrId: inward.qrId,
        });

        const remLargeBags = Math.max(0, allocBagsCount - outData.bagsCount);
        const remSmallBags = Math.max(0, (inward.jin || 0) - outData.jin);
        const remMixedBags = Math.max(0, (inward.mixed || 0) - outData.mixed);
        const remTotalBags = Math.max(0, (allocBagsCount + (inward.jin || 0) + (inward.mixed || 0)) - outData.totalBags);

        activeStocksMap.set(inwardIdStr, {
          id: inwardIdStr,
          client: clientNameDisplay,
          farmer: inward.farmerName || '-',
          commodity: commodityDisplay,
          quantity: stackAvailable,
          truckNo: inward.truckNo || '-',
          date: inward.createdAt || inward.date,
          referencePersons: inward.referencePersons && inward.referencePersons.length > 0 
            ? inward.referencePersons.map((rp: any) => rp.name).join(', ') 
            : '-',
          previousOwner: previousOwnerMap.get(inwardIdStr) || '-',
          largeBags: remLargeBags,
          smallBags: remSmallBags,
          mixedBags: remMixedBags,
          totalBags: remTotalBags,
        });
      }
    }
  });

  outwardsDocs.forEach((outward: any) => {
    const inwardIdStr = (outward.inwardId?._id || outward.inwardId)?.toString();
    const linkedInward = inwardIdStr ? allInwardsMap.get(inwardIdStr) : null;
    
    const clientNameDisplay = getResolvedClientName(outward, linkedInward);
    const commodityDisplay = getResolvedCommodityDisplay(outward, linkedInward);

    transactions.push({
      id: outward._id.toString(),
      createdAt: outward.createdAt || outward.date,
      date: outward.date || outward.createdAt,
      type: 'OUTWARD',
      receiptNo: outward.weighbridgeSlipNo || `OUT-${outward._id.toString().slice(-6).toUpperCase()}`,
      commodity: commodityDisplay,
      quantity: outward.quantityKg,
      client: clientNameDisplay
    });
  });

  transactions.sort((a, b) => new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime());

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
