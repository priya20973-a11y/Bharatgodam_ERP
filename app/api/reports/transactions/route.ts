import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { getTenantFilterForMongo, requireSession } from '@/lib/ownership';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const direction = searchParams.get('direction');
    const clientId = searchParams.get('clientId');
    const commodityId = searchParams.get('commodityId');
    const warehouseId = searchParams.get('warehouseId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const db = await getDb();

    const filter: any = {};
    if (direction) filter.direction = { $in: direction.split(',') };
    if (clientId) filter.clientId = clientId;
    if (commodityId) filter.commodityId = commodityId;
    if (warehouseId) filter.warehouseId = warehouseId;

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    const session = await requireSession();
    const tenantFilter = getTenantFilterForMongo(session);

    const warehouseDocs = await db.collection('warehouses')
      .find({ ...tenantFilter })
      .project({ _id: 1 })
      .toArray();
    const ownedWarehouseIdStrings = warehouseDocs.map((warehouse: any) => warehouse._id.toString());
    const ownedWarehouseObjectIds = warehouseDocs
      .map((warehouse: any) => warehouse._id)
      .filter((id: any) => id instanceof ObjectId);
    const warehouseQueryIds = [...ownedWarehouseIdStrings, ...ownedWarehouseObjectIds];

    if (warehouseId) {
      const requestedWarehouseIds: Array<string | ObjectId> = [warehouseId];
      const warehouseIdString = String(warehouseId);
      if (ObjectId.isValid(warehouseIdString)) requestedWarehouseIds.push(new ObjectId(warehouseIdString));

      const ownsWarehouse = warehouseQueryIds.some((id: any) => id.toString() === warehouseIdString);
      filter.warehouseId = ownsWarehouse ? { $in: requestedWarehouseIds } : { $in: [] };
    } else if (warehouseQueryIds.length > 0) {
      filter.warehouseId = { $in: warehouseQueryIds };
    }

    const inwardsCollection = db.collection('inwards');
    const outwardsCollection = db.collection('outwards');

    const tenantAwareFilter = { ...filter, ...tenantFilter };
    const [inwardTransactions, outwardTransactions] = await Promise.all([
      inwardsCollection
        .find(direction !== 'OUTWARD' ? tenantAwareFilter : { $expr: { $literal: false } })
        .toArray(),
      outwardsCollection
        .find(direction !== 'INWARD' ? tenantAwareFilter : { $expr: { $literal: false } })
        .toArray(),
    ]);

    const transactions = [
      ...inwardTransactions.map((t: any) => ({
        ...t,
        direction: 'INWARD',
        date: t.date || t.createdAt,
      })),
      ...outwardTransactions.map((t: any) => ({
        ...t,
        direction: 'OUTWARD',
        date: t.date || t.createdAt,
      })),
    ].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return NextResponse.json({
      success: true,
      data: transactions,
      count: transactions.length,
    });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
