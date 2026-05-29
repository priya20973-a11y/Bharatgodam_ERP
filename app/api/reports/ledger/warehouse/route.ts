import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { requireSession, getTenantFilterForMongo } from '@/lib/ownership';
import { calculateLedger } from '@/lib/ledger-engine';

function normalizeString(value: any) {
  return typeof value === 'string' ? value.trim() : String(value || '').trim();
}

function buildTransactionKey(tx: any) {
  return [
    normalizeString(tx.date),
    normalizeString(tx.direction),
    normalizeString(tx.mt),
    normalizeString(tx.clientName),
    normalizeString(tx.clientId),
    normalizeString(tx.commodityName),
    normalizeString(tx.warehouseId),
  ].join('|');
}

function normalizeCommodityName(value: any) {
  return typeof value === 'string' ? value.trim().toUpperCase() : String(value || '').trim().toUpperCase();
}

export async function GET(req: Request) {
  try {
    await requireSession();
    const url = new URL(req.url);
    const warehouseId = url.searchParams.get('warehouseId');

    if (!warehouseId || !warehouseId.trim()) {
      return NextResponse.json(
        { success: false, message: 'warehouseId is required' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const tenantFilter = getTenantFilterForMongo(await requireSession());

    const warehouseFilter: any = {};
    if (ObjectId.isValid(warehouseId)) {
      warehouseFilter.$in = [new ObjectId(warehouseId), warehouseId];
    } else {
      warehouseFilter.$in = [warehouseId];
    }

    const [warehouseDoc, bookings, transactions, commodities] = await Promise.all([
      db.collection('warehouses').findOne({ _id: ObjectId.isValid(warehouseId) ? new ObjectId(warehouseId) : warehouseId, ...tenantFilter }),
      db.collection('bookings')
        .find({ warehouseId: warehouseFilter, direction: { $in: ['INWARD', 'OUTWARD'] }, ...tenantFilter })
        .sort({ date: 1 })
        .toArray(),
      db.collection('transactions')
        .find({ warehouseId: warehouseFilter, ...tenantFilter })
        .sort({ date: 1 })
        .toArray(),
      db.collection('commodities')
        .find({ ...tenantFilter })
        .toArray(),
    ]);

    const warehouseName = warehouseDoc?.name || 'Unknown Warehouse';

    const commodityRates = new Map<string, number>();
    commodities.forEach((commodity: any) => {
      const key = normalizeCommodityName(commodity.name || commodity.commodityName);
      const rate = Number(commodity.ratePerMtPerDay ?? commodity.ratePerDayPerMT ?? commodity.ratePerMTPerDay ?? commodity.ratePerMTPerDay ?? 0);
      if (key && rate > 0) {
        commodityRates.set(key, rate);
      }
    });

    const uniqueTransactions = new Map<string, any>();
    const addRecord = (record: any) => {
      const normalized = {
        _id: record._id?.toString?.() || '',
        date: record.date,
        direction: record.direction,
        mt: Number(record.mt ?? record.quantityMT ?? 0),
        clientId: record.clientId?.toString?.() || record.accountId || '',
        clientName: record.clientName || record.clientName || 'Unknown Client',
        commodityName: record.commodityName || record.commodity || 'Unknown Commodity',
        warehouseId: record.warehouseId?.toString?.() || '',
        source: record.source || 'ledger',
      };
      const key = buildTransactionKey(normalized);
      if (!uniqueTransactions.has(key)) {
        uniqueTransactions.set(key, normalized);
      }
    };

    bookings.forEach((booking) => addRecord({ ...booking, source: 'booking' }));
    transactions.forEach((transaction) => addRecord({ ...transaction, source: 'transaction' }));

    const clientMap = new Map<string, any>();
    const commodityMap = new Map<string, any>();
    const clientTransactions = new Map<string, any[]>();

    let totalInwardMT = 0;
    let totalOutwardMT = 0;

    Array.from(uniqueTransactions.values()).forEach((tx) => {
      const commodityName = normalizeCommodityName(tx.commodityName) || 'UNKNOWN';
      const clientKey = normalizeString(tx.clientId || tx.clientName).toUpperCase() || 'UNKNOWN_CLIENT';
      const clientName = normalizeString(tx.clientName) || 'Unknown Client';
      const inwardMT = tx.direction === 'INWARD' ? tx.mt : 0;
      const outwardMT = tx.direction === 'OUTWARD' ? tx.mt : 0;
      const balanceMT = inwardMT - outwardMT;

      totalInwardMT += inwardMT;
      totalOutwardMT += outwardMT;

      const clientSummaryKey = `${clientKey}|${commodityName}`;
      if (!clientMap.has(clientSummaryKey)) {
        clientMap.set(clientSummaryKey, {
          clientId: tx.clientId || '',
          clientName,
          commodityName,
          inwardMT: 0,
          outwardMT: 0,
          balanceMT: 0,
          transactionCount: 0,
        });
      }

      const clientSummary = clientMap.get(clientSummaryKey);
      clientSummary.inwardMT += inwardMT;
      clientSummary.outwardMT += outwardMT;
      clientSummary.balanceMT += balanceMT;
      clientSummary.transactionCount += 1;

      const ledgerKey = `${clientKey}|${commodityName}`;
      if (!clientTransactions.has(ledgerKey)) {
        clientTransactions.set(ledgerKey, []);
      }
      clientTransactions.get(ledgerKey)!.push(tx);

      if (!commodityMap.has(commodityName)) {
        commodityMap.set(commodityName, {
          commodityName,
          inwardMT: 0,
          outwardMT: 0,
          balanceMT: 0,
          clientIds: new Set<string>(),
        });
      }

      const commoditySummary = commodityMap.get(commodityName);
      commoditySummary.inwardMT += inwardMT;
      commoditySummary.outwardMT += outwardMT;
      commoditySummary.balanceMT += balanceMT;
      commoditySummary.clientIds.add(clientKey);
    });

    const clientLedgerSummaries = Array.from(clientMap.entries()).map(([key, summary]) => {
      const txs = (clientTransactions.get(key) || []).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const ledger = calculateLedger(
        txs,
        [],
        summary.clientName,
        0,
        commodityRates
      );
      const inventoryBalances = ledger.ledgerSteps.length
        ? ledger.ledgerSteps[ledger.ledgerSteps.length - 1].inventoryBalances
        : {};
      const currentInventory = inventoryBalances[summary.commodityName] ?? 0;
      return {
        ...summary,
        totalRent: ledger.totalRent,
        currentInventory: Number(currentInventory.toFixed(2)),
        lastInventoryBalances: inventoryBalances,
        transactionRecords: txs,
      };
    });

    const clientSummaries = Array.from(clientMap.values())
      .sort((a, b) => a.clientName.localeCompare(b.clientName) || a.commodityName.localeCompare(b.commodityName));

    const commoditySummaries = Array.from(commodityMap.values())
      .map((summary) => ({
        commodityName: summary.commodityName,
        inwardMT: summary.inwardMT,
        outwardMT: summary.outwardMT,
        balanceMT: summary.balanceMT,
        clientCount: summary.clientIds.size,
      }))
      .sort((a, b) => b.balanceMT - a.balanceMT || a.commodityName.localeCompare(b.commodityName));

    return NextResponse.json({
      success: true,
      data: {
        warehouseId,
        warehouseName,
        totalClients: new Set(clientSummaries.map((item) => item.clientName)).size,
        totalCommodities: commoditySummaries.length,
        totalInwardMT: Number(totalInwardMT.toFixed(2)),
        totalOutwardMT: Number(totalOutwardMT.toFixed(2)),
        netMT: Number((totalInwardMT - totalOutwardMT).toFixed(2)),
        clientSummaries,
        commoditySummaries,
        transactionRecords: Array.from(uniqueTransactions.values()),
        clientLedgerSummaries,
      },
    });
  } catch (error: any) {
    console.error('GET /api/reports/ledger/warehouse error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Server error' },
      { status: 500 }
    );
  }
}
