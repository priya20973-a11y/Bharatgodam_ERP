'use server';

import { getDb } from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { calculateDistribution } from '@/lib/distribution-engine';
import { ObjectId } from 'mongodb';
import { WAREHOUSE_CONFIG, WarehouseRevenue, RevenueDistributionData } from '@/lib/revenue-types';
import { logActivity } from '@/lib/cold-logger';

const aggregateRevenueData = async (userId: string, month: number, year: number): Promise<RevenueDistributionData> => {
    const db = await getDb();

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1);

    const revenueData = await db.collection('invoices').aggregate([
      {
        $match: {
          status: 'PAID',
          generatedAt: {
            $gte: startDate,
            $lt: endDate,
          },
        },
      },
      {
        $lookup: {
          from: 'warehouses',
          localField: 'warehouseId',
          foreignField: '_id',
          as: 'warehouseById',
        },
      },
      {
        $unwind: {
          path: '$warehouseById',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $set: {
          warehouseNameResolved: {
            $ifNull: ['$warehouseName', '$warehouseById.name'],
          },
          ownerNameResolved: {
            $ifNull: ['$warehouseById.ownerName', 'Unknown Owner'],
          },
          ownerEquityResolved: {
            $ifNull: ['$warehouseById.ownerEquity', 60],
          },
        },
      },
      {
        $group: {
          _id: '$warehouseNameResolved',
          totalRevenuePaise: { $sum: '$paidAmount' },
          ownerName: { $first: '$ownerNameResolved' },
          ownerEquity: { $first: '$ownerEquityResolved' },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]).toArray();

    const revenueMap = new Map<string, { totalRevenuePaise: number; ownerName: string; ownerEquity: number }>();

    revenueData.forEach((row: any) => {
      if (!row._id) return;
      revenueMap.set(row._id, {
        totalRevenuePaise: Number(row.totalRevenuePaise || 0),
        ownerName: row.ownerName || 'Unknown Owner',
        ownerEquity: Number(row.ownerEquity || 60),
      });
    });

    const warehouses = WAREHOUSE_CONFIG.map((warehouse) => {
      const revenueRow = revenueMap.get(warehouse.name);
      const totalRevenuePaise = revenueRow?.totalRevenuePaise ?? 0;
      const distribution = calculateDistribution({
        totalRevenuePaise,
        ownerEquityPercent: warehouse.ownerEquity,
      });

      return {
        warehouseName: warehouse.name,
        ownerName: warehouse.ownerName,
        ownerEquity: warehouse.ownerEquity,
        totalRevenue: distribution.totalRevenue,
        ownerShare: distribution.ownerShare,
        operatorShare: distribution.operatorShare,
        status: (distribution.totalRevenue > 0 ? 'Settled' : 'Pending') as 'Settled' | 'Pending',
      };
    });

    const totalCombinedRevenue = warehouses.reduce((sum, wh) => sum + wh.totalRevenue, 0);
    const totalOwnerPayout = warehouses.reduce((sum, wh) => sum + wh.ownerShare, 0);
    const totalPlatformCommission = warehouses.reduce((sum, wh) => sum + wh.operatorShare, 0);

    return {
      warehouses,
      totalCombinedRevenue,
      totalOwnerPayout,
      totalPlatformCommission,
      month: new Date(year, month - 1).toLocaleString('default', { month: 'long' }),
      year,
    };
};

export const getRevenueDistribution = async (month: number, year: number): Promise<RevenueDistributionData> => {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error('Unauthorized');

  return aggregateRevenueData((session.user as any).id, month, year);
};

export async function ensureWarehousesExist() {
  const db = await getDb();

  for (const warehouse of WAREHOUSE_CONFIG) {
    await db.collection('warehouses').updateOne(
      { name: warehouse.name },
      {
        $set: {
          ...warehouse,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );
  }
}

export async function logRevenueExportAction() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return;

  await logActivity({
    actionType: 'OTHER',
    module: 'Revenue Split',
    description: 'Export CSV',
    storageType: 'Dry Storage',
    sessionFallback: session,
  });
}
