'use server';

import { getDb } from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { calculateDistribution } from '@/lib/distribution-engine';

export interface WarehouseRevenue {
  warehouseId: string;
  warehouseName: string;
  ownerName: string;
  ownerEquity: number;
  totalRevenue: number;
  ownerShare: number;
  operatorShare: number;
}

export interface RevenueDistributionData {
  warehouses: WarehouseRevenue[];
  totalGlobalRevenue: number;
  totalOperatorCommission: number;
  month: string;
  year: number;
}

/**
 * Internal function for revenue distribution data
 */
const getRevenueDistributionData = async (userId: string, month: number, year: number): Promise<RevenueDistributionData> => {
    const db = await getDb();

    // Get start and end of the month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1);

    // Aggregate paid invoices by warehouse
    const revenueData = await db.collection('invoices').aggregate([
      {
        $match: {
          status: 'PAID',
          generatedAt: {
            $gte: startDate,
            $lt: endDate
          }
        }
      },
      {
        $group: {
          _id: '$warehouseName',
          totalRevenue: { $sum: '$paidAmount' },
          invoiceCount: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'warehouses',
          localField: '_id',
          foreignField: 'name',
          as: 'warehouse'
        }
      },
      {
        $unwind: {
          path: '$warehouse',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          warehouseName: '$_id',
          totalRevenue: 1,
          invoiceCount: 1,
          ownerName: { $ifNull: ['$warehouse.ownerName', 'Unknown Owner'] },
          ownerEquity: {
            $cond: [
              { $eq: [{ $ifNull: ['$warehouse.warehouseType', 'Owner'] }, 'Rented'] },
              0,
              { $ifNull: ['$warehouse.ownerEarnings', { $ifNull: ['$warehouse.ownerEquity', 60] }] }
            ]
          },
          warehouseId: '$warehouse._id'
        }
      },
      {
        $sort: { totalRevenue: -1 }
      }
    ]).toArray();

    // Calculate distribution for each warehouse
    const warehouses: WarehouseRevenue[] = revenueData.map(item => {
      const distribution = calculateDistribution({
        totalRevenuePaise: Math.round(item.totalRevenue * 100), // Convert to paise
        ownerEquityPercent: item.ownerEquity
      });

      return {
        warehouseId: item.warehouseId?.toString() || '',
        warehouseName: item.warehouseName || 'Unknown Warehouse',
        ownerName: item.ownerName,
        ownerEquity: item.ownerEquity,
        totalRevenue: distribution.totalRevenue,
        ownerShare: distribution.ownerShare,
        operatorShare: distribution.operatorShare,
      };
    });

    // Calculate global totals
    const totalGlobalRevenue = warehouses.reduce((sum, w) => sum + w.totalRevenue, 0);
    const totalOperatorCommission = warehouses.reduce((sum, w) => sum + w.operatorShare, 0);

    return {
      warehouses,
      totalGlobalRevenue,
      totalOperatorCommission,
      month: new Date(year, month - 1).toLocaleString('default', { month: 'long' }),
      year,
    };
};

/**
 * Fetches revenue distribution data for a specific month and year
 * Uses MongoDB aggregation pipeline to calculate totals by warehouse
 */
export const getRevenueDistribution = async (month: number, year: number): Promise<RevenueDistributionData> => {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error('Unauthorized');

  return getRevenueDistributionData((session.user as any).id, month, year);
};

/**
 * Ensures the 5 default warehouses exist in the database
 */
export async function ensureWarehousesExist() {
  const db = await getDb();

  const defaultWarehouses = [
    { name: 'Warehouse 1', ownerName: 'Rajesh Kumar', ownerEquity: 60, location: 'Mumbai', capacity: 50000, type: 'DRY_STORAGE' as const },
    { name: 'Warehouse 2', ownerName: 'Priya Sharma', ownerEquity: 60, location: 'Delhi', capacity: 45000, type: 'DRY_STORAGE' as const },
    { name: 'Warehouse 3', ownerName: 'Amit Singh', ownerEquity: 60, location: 'Bangalore', capacity: 40000, type: 'COLD_STORAGE' as const },
    { name: 'Warehouse 4', ownerName: 'Sneha Patel', ownerEquity: 60, location: 'Chennai', capacity: 35000, type: 'HAZARDOUS' as const },
    { name: 'Warehouse 5', ownerName: 'Vikram Rao', ownerEquity: 60, location: 'Pune', capacity: 30000, type: 'DRY_STORAGE' as const },
  ];

  for (const warehouse of defaultWarehouses) {
    await db.collection('warehouses').updateOne(
      { name: warehouse.name },
      {
        $set: {
          ...warehouse,
          updatedAt: new Date()
        },
        $setOnInsert: {
          createdAt: new Date()
        }
      },
      { upsert: true }
    );
  }
}