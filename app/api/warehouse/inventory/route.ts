import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getTenantFilterForMongo } from '@/lib/ownership';
import { ObjectId } from 'mongodb';

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const tenantFilter = getTenantFilterForMongo(session);
    const { searchParams } = new URL(request.url);
    const requestedWarehouseId = searchParams.get('warehouseId');
    const month = searchParams.get('month');
    
    let dateFilter = {};
    if (month && month !== 'ALL') {
      const [year, m] = month.split('-');
      const lastDay = new Date(Number(year), Number(m), 0).getDate();
      const monthEnd = new Date(`${year}-${m}-${String(lastDay).padStart(2, '0')}T23:59:59.999Z`);
      dateFilter = { date: { $lte: monthEnd } };
    }

    const db = await getDb();
    const warehouseCollection = db.collection('warehouses');

    const activeWarehouses = await warehouseCollection.find({
      ...tenantFilter,
      status: { $in: ['ACTIVE', 'FULL'] }
    }).toArray();
    let warehouse = null;

    if (requestedWarehouseId) {
      try {
        warehouse = await warehouseCollection.findOne({
          _id: new ObjectId(requestedWarehouseId),
          ...tenantFilter
        });
      } catch {
        warehouse = null;
      }
    }

    if (!warehouse) {
      warehouse = activeWarehouses[0] || null;
    }

    if (!warehouse) {
      return NextResponse.json({
        success: true,
        commodities: [],
        warehouse_stats: {
          total_capacity: 0,
          used_capacity: 0,
          available_capacity: 0,
          utilization_percentage: 0,
          warehouse_id: '',
          warehouse_name: 'No Active Warehouses'
        },
        warehouses: []
      });
    }

    const commodityBreakdown = await db.collection('transactions').aggregate([
      {
        $match: {
          warehouseId: warehouse._id.toString(),
          ...tenantFilter,
          ...dateFilter
        }
      },
      {
        $group: {
          _id: '$commodityName',
          totalWeight: {
            $sum: {
              $cond: [
                { $eq: ['$direction', 'OUTWARD'] },
                { $multiply: ['$quantityMT', -1] },
                '$quantityMT'
              ]
            }
          },
          bookingCount: { $sum: 1 }
        }
      },
      {
        $project: {
          commodityName: '$_id',
          totalWeight: { $round: [{ $max: ['$totalWeight', 0] }, 3] },
          bookingCount: 1,
          _id: 0
        }
      },
      {
        $match: {
          totalWeight: { $gt: 0 }
        }
      },
      {
        $sort: { totalWeight: -1 }
      }
    ]).toArray();

    const totalCapacity = warehouse.totalCapacity || 5000;
    const usedCapacity = commodityBreakdown.reduce((sum, item) => sum + item.totalWeight, 0);
    const availableCapacity = Math.max(0, totalCapacity - usedCapacity);

    const warehouseStats = {
      total_capacity: totalCapacity,
      used_capacity: Math.round(usedCapacity * 1000) / 1000,
      available_capacity: Math.round(availableCapacity * 1000) / 1000,
      utilization_percentage: Math.round((usedCapacity / totalCapacity) * 100),
      warehouse_id: warehouse._id.toString(),
      warehouse_name: warehouse.name || 'Unknown Warehouse'
    };

    const warehouses = activeWarehouses.map((wh) => ({
      warehouse_id: wh._id.toString(),
      warehouse_name: wh.name || 'Unnamed Warehouse',
      total_capacity: wh.totalCapacity || 5000
    }));

    return NextResponse.json({
      success: true,
      commodities: commodityBreakdown,
      warehouse_stats: warehouseStats,
      warehouses
    });
  } catch (error) {
    console.error('Error fetching warehouse inventory:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch warehouse inventory' },
      { status: 500 }
    );
  }
}
