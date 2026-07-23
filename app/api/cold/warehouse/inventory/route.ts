import { NextRequest, NextResponse } from 'next/server';
import { requireSession, getTenantFilter } from '@/lib/ownership';
import connectToDatabase from '@/lib/mongoose';
import ColdWarehouse from '@/lib/models/ColdWarehouse';
import ColdInward from '@/lib/models/ColdInward';
import ColdOutward from '@/lib/models/ColdOutward';
import ColdCommodity from '@/lib/models/ColdCommodity';
import mongoose from 'mongoose';

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    await connectToDatabase();

    const searchParams = request.nextUrl.searchParams;
    const requestedWarehouseId = searchParams.get('warehouseId');
    const requestedChamberNo = searchParams.get('chamberNo') ? parseInt(searchParams.get('chamberNo') as string) : null;
    const requestedFloorNo = searchParams.get('floorNo') ? parseInt(searchParams.get('floorNo') as string) : null;

    const tenantFilter = getTenantFilter(session);

    // 1. Fetch all warehouses for the dropdown
    const warehouses = await ColdWarehouse.find(tenantFilter).sort({ createdAt: -1 });

    if (!warehouses || warehouses.length === 0) {
      return NextResponse.json({
        success: true,
        commodities: [],
        warehouse_stats: {
          total_capacity: 0,
          used_capacity: 0,
          available_capacity: 0,
          utilization_percentage: 0,
          warehouse_id: '',
          warehouse_name: 'No Warehouses Found',
        },
        warehouses: [],
        chambers: [],
        floors: [],
      });
    }

    // 2. Determine selected warehouse
    let selectedWarehouse = warehouses.find((w) => w._id.toString() === requestedWarehouseId) || warehouses[0];
    const warehouseIdStr = selectedWarehouse._id.toString();

    // 3. Compute capacity and build hierarchical dropdown lists
    let totalCapacity = 0;
    let chambers = selectedWarehouse.chambers.map((c: any) => ({ chamberNo: c.chamberNo, name: c.name }));
    let floors: any[] = [];
    
    let activeChamber = requestedChamberNo ? selectedWarehouse.chambers.find((c: any) => c.chamberNo === requestedChamberNo) : null;
    let activeFloor = requestedFloorNo && activeChamber ? activeChamber.floors.find((f: any) => f.floorNo === requestedFloorNo) : null;

    if (activeFloor) {
      totalCapacity = activeFloor.stacks.reduce((acc: number, stack: any) => acc + (stack.capacity || 0), 0);
      floors = activeChamber?.floors.map((f: any) => ({ floorNo: f.floorNo, name: f.name })) || [];
    } else if (activeChamber) {
      totalCapacity = activeChamber.floors.reduce((fAcc: number, f: any) => 
        fAcc + f.stacks.reduce((sAcc: number, stack: any) => sAcc + (stack.capacity || 0), 0)
      , 0);
      floors = activeChamber.floors.map((f: any) => ({ floorNo: f.floorNo, name: f.name }));
    } else {
      totalCapacity = selectedWarehouse.totalCapacity || 0;
    }

    // 4. Query Inwards & Outwards based on filters
    const filterQuery: any = { warehouseId: selectedWarehouse._id };
    if (activeChamber) filterQuery['stackAllocations.chamberNo'] = activeChamber.chamberNo;
    if (activeFloor) filterQuery['stackAllocations.floorNo'] = activeFloor.floorNo;

    const outwardFilterQuery: any = { warehouseId: selectedWarehouse._id };
    if (activeChamber) outwardFilterQuery.chamberNo = activeChamber.chamberNo;
    if (activeFloor) outwardFilterQuery.floorNo = activeFloor.floorNo;

    const [inwards, outwards] = await Promise.all([
      ColdInward.aggregate([
        { $unwind: '$stackAllocations' },
        { $match: filterQuery },
        { $group: { 
            _id: '$commodityId', 
            totalKg: { $sum: '$stackAllocations.allocatedWeight' }, 
            uniqueInwards: { $addToSet: '$_id' } 
        }},
        { $addFields: { count: { $size: '$uniqueInwards' } } }
      ]),
      ColdOutward.aggregate([
        { $match: outwardFilterQuery },
        { $group: { _id: '$commodityId', totalKg: { $sum: '$quantityKg' } } }
      ])
    ]);

    // 5. Merge Inwards and Outwards per commodity
    const commodityMap = new Map();
    const commodityIds = new Set<mongoose.Types.ObjectId>();

    inwards.forEach((inward) => {
      commodityMap.set(inward._id.toString(), {
        commodityId: inward._id,
        totalWeight: inward.totalKg,
        bookingCount: inward.count
      });
      commodityIds.add(inward._id);
    });

    outwards.forEach((outward) => {
      const idStr = outward._id.toString();
      if (commodityMap.has(idStr)) {
        const existing = commodityMap.get(idStr);
        existing.totalWeight -= outward.totalKg;
      }
    });

    // Clean up <= 0
    for (const [key, value] of commodityMap.entries()) {
      if (value.totalWeight <= 0) {
        commodityMap.delete(key);
      }
    }

    // 6. Fetch Commodity Names
    const validCommodityIds = Array.from(commodityMap.values()).map(c => c.commodityId);
    const commoditiesData = await ColdCommodity.find({ _id: { $in: validCommodityIds } }).lean();
    const commodityNameMap = new Map(commoditiesData.map((c: any) => [c._id.toString(), c.name]));

    const finalCommodities = Array.from(commodityMap.values()).map((c) => ({
      commodityName: commodityNameMap.get(c.commodityId.toString()) || 'Unknown Commodity',
      totalWeight: c.totalWeight,
      bookingCount: c.bookingCount
    }));

    // 7. Compute Totals
    const usedCapacity = finalCommodities.reduce((acc, curr) => acc + curr.totalWeight, 0);
    const availableCapacity = Math.max(0, totalCapacity - usedCapacity);
    const utilizationPercentage = totalCapacity > 0 ? (usedCapacity / totalCapacity) * 100 : 0;

    const warehouseOptions = warehouses.map((w) => ({
      warehouse_id: w._id.toString(),
      warehouse_name: w.name,
      total_capacity: w.totalCapacity || 0,
    }));

    return NextResponse.json({
      success: true,
      commodities: finalCommodities,
      warehouse_stats: {
        total_capacity: totalCapacity,
        used_capacity: usedCapacity,
        available_capacity: availableCapacity,
        utilization_percentage: Number(utilizationPercentage.toFixed(1)),
        warehouse_id: warehouseIdStr,
        warehouse_name: selectedWarehouse.name,
      },
      warehouses: warehouseOptions,
      chambers: chambers,
      floors: floors,
    });
  } catch (error: any) {
    console.error('Inventory Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
