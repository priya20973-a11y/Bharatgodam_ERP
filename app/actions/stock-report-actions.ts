'use server';

import { getDb } from '@/lib/mongodb';
import { getTenantFilterForMongo, requireSession } from '@/lib/ownership';
import { requireWspActionPermission } from '@/lib/server-wsp-permissions';

export interface StockReportFilter {
  clientId?: string;
  warehouseId?: string;
}

export async function getStockReport(filters: StockReportFilter = {}) {
  const session = await requireSession();
  const db = await getDb();
  const tenantFilter = getTenantFilterForMongo(session);

  const matchStage: any = {
    status: 'COMPLETED',
    ...tenantFilter,
  };

  if (filters.clientId && filters.clientId !== 'ALL') {
    matchStage.clientId = filters.clientId;
  }
  
  if (filters.warehouseId && filters.warehouseId !== 'ALL') {
    matchStage.warehouseId = filters.warehouseId;
  }

  try {
    const rawData = await db.collection('transactions').aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            clientId: '$clientId',
            warehouseId: '$warehouseId',
            commodityName: '$commodityName',
          },
          clientName: { $first: '$clientName' },
          warehouseName: { $first: '$warehouseName' },
          inwardQuantity: { $sum: { $cond: [{ $eq: ['$direction', 'INWARD'] }, '$quantityMT', 0] } },
          outwardQuantity: { $sum: { $cond: [{ $eq: ['$direction', 'OUTWARD'] }, '$quantityMT', 0] } },
          inwardBags: { $sum: { $cond: [{ $eq: ['$direction', 'INWARD'] }, '$bagsCount', 0] } },
          outwardBags: { $sum: { $cond: [{ $eq: ['$direction', 'OUTWARD'] }, '$bagsCount', 0] } },
        }
      },
      {
        $project: {
          _id: 0,
          clientId: '$_id.clientId',
          warehouseId: '$_id.warehouseId',
          commodityName: '$_id.commodityName',
          clientName: 1,
          warehouseName: 1,
          totalQuantity: { $subtract: ['$inwardQuantity', '$outwardQuantity'] },
          totalBags: { $subtract: ['$inwardBags', '$outwardBags'] }
        }
      },
      {
        $match: {
          totalQuantity: { $gt: 0.001 } // to avoid floating point tiny remainders
        }
      },
      {
        $sort: { clientName: 1, warehouseName: 1, commodityName: 1 }
      }
    ]).toArray();

    // Fetch clients and warehouses for filters
    const clients = await db.collection('clients').find({ ...tenantFilter }).project({ _id: 1, name: 1 }).toArray();
    const warehouses = await db.collection('warehouses').find({ ...tenantFilter, status: { $ne: 'INACTIVE' } }).project({ _id: 1, name: 1 }).toArray();

    return {
      success: true,
      data: rawData,
      clients: clients.map(c => ({ label: c.name, value: c._id.toString() })),
      warehouses: warehouses.map(w => ({ label: w.name, value: w._id.toString() }))
    };
  } catch (error: any) {
    console.error('Error fetching stock report:', error);
    return { success: false, error: error.message };
  }
}
