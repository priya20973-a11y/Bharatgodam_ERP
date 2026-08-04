import React from 'react';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import ColdTransactionsReport from './cold-transactions-report';
import { getDb } from '@/lib/mongodb';
import { getTenantFilterForMongo, isAdmin } from '@/lib/ownership';

export default async function ColdTransactionsReportWrapper() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      throw new Error('Unauthorized');
    }

    const tenantFilter = getTenantFilterForMongo(session);
    const db = await getDb();

    // The tenantFilter already handles the user boundaries.
    const [inwards, outwards] = await Promise.all([
      db.collection('coldinwards').aggregate([
        { $match: tenantFilter },
        { $sort: { inwardDate: -1, date: -1, createdAt: -1 } },
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
            from: 'coldcommodities',
            localField: 'commodityId',
            foreignField: '_id',
            as: 'commodity',
          },
        },
        {
          $lookup: {
            from: 'coldwarehouses',
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
      db.collection('coldoutwards').aggregate([
        { $match: tenantFilter },
        { $sort: { date: -1, actualOutwardDate: -1, createdAt: -1 } },
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
            from: 'coldcommodities',
            localField: 'commodityId',
            foreignField: '_id',
            as: 'commodity',
          },
        },
        {
          $lookup: {
            from: 'coldwarehouses',
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
      ]).toArray()
    ]);

    const normalizeDateValue = (dateValue: any) => {
      if (dateValue === undefined || dateValue === null) return '';
      const asString = dateValue.toString();
      const parsed = new Date(asString);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString().split('T')[0];
      }
      return asString.trim();
    };

    const combinedRecords = [
      ...inwards.map((t: any) => ({
        ...t,
        sourceType: 'inward',
        direction: 'INWARD',
        date: normalizeDateValue(t.inwardDate || t.date || t.createdAt || ''),
      })),
      ...outwards.map((t: any) => ({
        ...t,
        sourceType: 'outward',
        direction: 'OUTWARD',
        date: normalizeDateValue(t.actualOutwardDate || t.date || t.createdAt || ''),
      })),
    ];

    const isAdminUser = isAdmin(session);

    const formattedTransactions = combinedRecords.map((t: any) => ({
      _id: t._id?.toString(),
      direction: t.direction,
      date: t.date,
      clientName: t.client?.name || '',
      clientId: t.clientId?.toString() || t.client?._id?.toString() || '',
      commodityName: t.commodity?.name || '',
      commodityId: t.commodityId?.toString() || t.commodity?._id?.toString() || '',
      warehouseName: t.warehouse?.name || '',
      warehouseId: t.warehouseId?.toString() || t.warehouse?._id?.toString() || '',
      quantityKg: t.quantityKg || 0,
      unit: t.unit || t.commodity?.unit || 'KG',
      bagsCount: t.bagsCount || 0,
      chamberNo: (() => {
        if (!t.chamberNo && !t.chamberName) return '';
        if (t.isBatch && t.items) {
          return t.items.map((item: any) => item.chamberName || item.chamberNo).join(', ');
        }
        return t.chamberName || t.chamberNo || '';
      })(),
      floorNo: (() => {
        if (!t.floorNo) {
          if (t.isBatch && t.items) {
            return t.items.map((item: any) => item.floorName || item.floorNo).join(', ');
          }
          return '';
        }
        if (!t.warehouse?.chambers) return t.floorNo;
        const chamber = t.warehouse.chambers.find((c: any) => c.chamberNo === parseInt(t.chamberNo || '1') || c.name === t.chamberName);
        const floor = chamber?.floors?.find((f: any) => f.floorNo === parseInt(t.floorNo));
        return floor?.name || t.floorNo;
      })(),
      stackNo: t.stackNo || '',
      lotNo: t.lotNo || '',
      gatePass: t.gatePass || '',
      status: t.status || 'COMPLETED',
      farmerName: t.farmerName || '',
      farmerId: t.farmerId || '',
      createdAt: t.createdAt || t.updatedAt || t.date,
    }));

    // Sort by date descending
    formattedTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return <ColdTransactionsReport transactions={formattedTransactions} isAdmin={isAdminUser} />;
  } catch (error) {
    console.error('Error fetching cold transactions:', error);
    return (
      <div className="text-center py-12">
        <p className="text-red-500 font-semibold">Unable to load transactions</p>
        <p className="text-slate-500 text-sm">{String(error)}</p>
      </div>
    );
  }
}
