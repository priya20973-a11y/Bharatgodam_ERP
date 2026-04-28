import React from 'react';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import TransactionsReport from './transactions-report';
import { getDb } from '@/lib/mongodb';
import { getTenantFilterForMongo } from '@/lib/ownership';
import { ObjectId } from 'mongodb';

export default async function TransactionsReportWrapper() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      throw new Error('Unauthorized');
    }

    const tenantFilter = getTenantFilterForMongo(session);
    const db = await getDb();

    const ownedWarehouses = await db.collection('warehouses')
      .find({ ...tenantFilter })
      .project({ _id: 1 })
      .toArray();

    const ownedWarehouseIds = ownedWarehouses.map((warehouse: any) => warehouse._id);
    const ownedWarehouseIdStrings = ownedWarehouseIds.map((id: any) => id.toString());
    const ownedWarehouseObjectIds = ownedWarehouseIds
      .map((id: any) => {
        if (typeof id === 'string' && ObjectId.isValid(id)) {
          return new ObjectId(id);
        }
        return id instanceof ObjectId ? id : null;
      })
      .filter((id): id is ObjectId => id !== null);

    const tenantWarehouseMatch = {
      $and: [
        tenantFilter,
        {
          $or: [
            { warehouseId: { $in: ownedWarehouseIds } },
            { warehouseId: { $in: ownedWarehouseIdStrings } },
            { warehouseId: { $in: ownedWarehouseObjectIds } },
          ],
        },
      ],
    };

    const [transactions, inwards, outwards, stockEntries] = await Promise.all([
      // Fetch transactions with warehouse lookup to get CURRENT warehouse name
      db.collection('transactions').aggregate([
        { $sort: { date: -1, createdAt: -1 } },
        { $match: tenantWarehouseMatch },
        {
          $lookup: {
            from: 'warehouses',
            localField: 'warehouseId',
            foreignField: '_id',
            as: 'warehouse',
          },
        },
        {
          $addFields: {
            warehouse: { $arrayElemAt: ['$warehouse', 0] },
          },
        },
      ]).toArray(),
      db.collection('inwards').aggregate([
        { $sort: { date: -1, createdAt: -1 } },
        { $match: tenantWarehouseMatch },
        {
          $lookup: {
            from: 'clients',
            localField: 'clientId',
            foreignField: '_id',
            as: 'client',
          },
        },
        {
          $lookup: {
            from: 'commodities',
            localField: 'commodityId',
            foreignField: '_id',
            as: 'commodity',
          },
        },
        {
          $lookup: {
            from: 'warehouses',
            localField: 'warehouseId',
            foreignField: '_id',
            as: 'warehouse',
          },
        },
        {
          $addFields: {
            client: { $arrayElemAt: ['$client', 0] },
            commodity: { $arrayElemAt: ['$commodity', 0] },
            warehouse: { $arrayElemAt: ['$warehouse', 0] },
          },
        },
      ]).toArray(),
      db.collection('outwards').aggregate([
        { $sort: { date: -1, createdAt: -1 } },
        { $match: tenantWarehouseMatch },
        {
          $lookup: {
            from: 'clients',
            localField: 'clientId',
            foreignField: '_id',
            as: 'client',
          },
        },
        {
          $lookup: {
            from: 'commodities',
            localField: 'commodityId',
            foreignField: '_id',
            as: 'commodity',
          },
        },
        {
          $lookup: {
            from: 'warehouses',
            localField: 'warehouseId',
            foreignField: '_id',
            as: 'warehouse',
          },
        },
        {
          $addFields: {
            client: { $arrayElemAt: ['$client', 0] },
            commodity: { $arrayElemAt: ['$commodity', 0] },
            warehouse: { $arrayElemAt: ['$warehouse', 0] },
          },
        },
      ]).toArray(),
      db.collection('stock_entries').aggregate([
        { $sort: { inwardDate: -1, createdAt: -1 } },
        {
          $addFields: {
            warehouseId: {
              $cond: {
                if: { $and: [{ $ne: ['$warehouseId', null] }, { $regexMatch: { input: { $toString: '$warehouseId' }, regex: /^[a-fA-F0-9]{24}$/ } }] },
                then: { $toObjectId: '$warehouseId' },
                else: '$warehouseId'
              }
            },
            clientId: {
              $cond: {
                if: { $and: [{ $ne: ['$clientId', null] }, { $regexMatch: { input: { $toString: '$clientId' }, regex: /^[a-fA-F0-9]{24}$/ } }] },
                then: { $toObjectId: '$clientId' },
                else: '$clientId'
              }
            },
            commodityId: {
              $cond: {
                if: { $and: [{ $ne: ['$commodityId', null] }, { $regexMatch: { input: { $toString: '$commodityId' }, regex: /^[a-fA-F0-9]{24}$/ } }] },
                then: { $toObjectId: '$commodityId' },
                else: '$commodityId'
              }
            }
          }
        },
        { $match: { warehouseId: { $in: ownedWarehouseObjectIds }, ...tenantFilter } }, // Only include owned warehouses and tenant-owned records
        {
          $lookup: {
            from: 'clients',
            localField: 'clientId',
            foreignField: '_id',
            as: 'client',
          },
        },
        {
          $lookup: {
            from: 'commodities',
            localField: 'commodityId',
            foreignField: '_id',
            as: 'commodity',
          },
        },
        {
          $lookup: {
            from: 'warehouses',
            localField: 'warehouseId',
            foreignField: '_id',
            as: 'warehouse',
          },
        },
        {
          $addFields: {
            client: { $arrayElemAt: ['$client', 0] },
            commodity: { $arrayElemAt: ['$commodity', 0] },
            warehouse: { $arrayElemAt: ['$warehouse', 0] },
          },
        },
      ]).toArray(),
    ]);

    const existingSourceKeys = new Set(
      transactions.map((t: any) => {
        const sourceType = t.sourceType || 'transactions';
        const sourceId = t.sourceId?.toString() || t._id?.toString() || '';
        return `${sourceType}/${sourceId}`;
      })
    );

    const stockEntryRecords = (stockEntries as any[]).map((t: any) => ({
      ...t,
      sourceType: 'stock_entries',
      sourceId: t._id?.toString(),
    }));

    const legacyRecords = [
      ...inwards.map((t: any) => ({
        ...t,
        sourceType: 'inward',
        sourceId: t._id?.toString(),
      })),
      ...outwards.map((t: any) => ({
        ...t,
        sourceType: 'outward',
        sourceId: t._id?.toString(),
      })),
    ].filter((t: any) => {
      const key = `${t.sourceType}/${t.sourceId}`;
      return !existingSourceKeys.has(key);
    });

    const combinedTransactions = [
      ...transactions,
      ...stockEntryRecords,
      ...legacyRecords,
    ].map((t: any) => ({
      _id: t._id?.toString(),
      direction: t.direction || t.type || 'INWARD',
      date: t.direction === 'OUTWARD' ? (t.actualOutwardDate || t.inwardDate || t.date || t.createdAt) : (t.inwardDate || t.date || t.createdAt),
      clientName: t.clientName || t.client?.name || '',
      clientId: t.clientId?.toString() || t.client?._id?.toString() || '',
      commodityName: t.commodityName || t.commodity?.name || '',
      commodityId: t.commodityId?.toString() || t.commodity?._id?.toString() || '',
      // Display CURRENT warehouse name from the lookup, fall back to stored name
      warehouseName: t.warehouse?.name || t.warehouseName || '',
      warehouseId: t.warehouseId?.toString() || t.warehouse?._id?.toString() || '',
      quantityMT: t.quantityMT || t.quantity || 0,
      bagsCount: t.bagsCount,
      gatePass: t.gatePass,
      stackNo: t.stackNo,
      lotNo: t.lotNo,
      status: t.status || 'COMPLETED',
      createdAt: t.createdAt || t.updatedAt || t.date,
    }));

    return <TransactionsReport transactions={Array.isArray(combinedTransactions) ? combinedTransactions : []} />;
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return (
      <div className="text-center py-12">
        <p className="text-red-500 font-semibold">Unable to load transactions</p>
        <p className="text-slate-500 text-sm">{String(error)}</p>
      </div>
    );
  }
}
