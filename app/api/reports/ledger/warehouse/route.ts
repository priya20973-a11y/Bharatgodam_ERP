import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { requireSession, getTenantFilterForMongo } from '@/lib/ownership';
import { calculateLedger, sanitizeClientName, isMongoObjectId, sanitizeTransactionId, resolveTransactionReference } from '@/lib/ledger-engine';

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
    const session = await requireSession();
    const url = new URL(req.url);
    const warehouseId = url.searchParams.get('warehouseId');

    if (!warehouseId || !warehouseId.trim()) {
      return NextResponse.json(
        { success: false, message: 'warehouseId is required' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const tenantFilter = getTenantFilterForMongo(session);
    const activeRecordFilter = {
      deletedAt: { $exists: false },
      status: { $nin: ['DELETED', 'CANCELLED'] },
    };

    const warehouseFilter: any = {};
    if (ObjectId.isValid(warehouseId)) {
      warehouseFilter.$in = [new ObjectId(warehouseId), warehouseId];
    } else {
      warehouseFilter.$in = [warehouseId];
    }

    const [warehouseDoc, bookings, transactions, commodities] = await Promise.all([
      db.collection('warehouses').findOne({ _id: ObjectId.isValid(warehouseId) ? new ObjectId(warehouseId) : warehouseId, ...tenantFilter }),
      db.collection('bookings')
        .find({ warehouseId: warehouseFilter, direction: { $in: ['INWARD', 'OUTWARD'] }, ...tenantFilter, ...activeRecordFilter })
        .sort({ date: 1 })
        .toArray(),
      db.collection('transactions')
        .find({ warehouseId: warehouseFilter, ...tenantFilter, ...activeRecordFilter })
        .sort({ date: 1 })
        .toArray(),
      db.collection('commodities')
        .find({ ...tenantFilter })
        .toArray(),
    ]);

    const warehouseName = warehouseDoc?.name || 'Unknown Warehouse';

    // Collect all referenced client IDs from bookings & transactions
    const clientIdsSet = new Set<string>();
    bookings.forEach((b: any) => {
      const cId = b.clientId?.toString?.() || b.accountId?.toString?.();
      if (cId) clientIdsSet.add(cId);
      if (b.clientName && isMongoObjectId(String(b.clientName).trim())) {
        clientIdsSet.add(String(b.clientName).trim());
      }
    });
    transactions.forEach((t: any) => {
      const cId = t.clientId?.toString?.() || t.accountId?.toString?.();
      if (cId) clientIdsSet.add(cId);
      if (t.clientName && isMongoObjectId(String(t.clientName).trim())) {
        clientIdsSet.add(String(t.clientName).trim());
      }
    });

    const clientObjectIds = Array.from(clientIdsSet)
      .filter((id) => ObjectId.isValid(id) && isMongoObjectId(id))
      .map((id) => new ObjectId(id));
    const clientIdStrings = Array.from(clientIdsSet);

    const [clientDocs, legacyClientDocs] = await Promise.all([
      db.collection('clients').find({
        $or: [
          { _id: { $in: [...clientObjectIds, ...clientIdStrings as any] } },
          { customClientId: { $in: clientIdStrings } },
        ]
      }).project({ name: 1, clientName: 1, customClientId: 1 }).toArray(),
      db.collection('client_accounts').find({
        _id: { $in: [...clientObjectIds, ...clientIdStrings as any] }
      }).project({ name: 1, clientName: 1 }).toArray()
    ]);

    const clientNameMap = new Map<string, string>();
    legacyClientDocs.forEach((c: any) => {
      const name = c.name || c.clientName;
      if (name && !isMongoObjectId(name)) {
        if (c._id) clientNameMap.set(c._id.toString(), String(name).trim());
      }
    });
    clientDocs.forEach((c: any) => {
      const name = c.name || c.clientName;
      if (name && !isMongoObjectId(name)) {
        if (c._id) clientNameMap.set(c._id.toString(), String(name).trim());
        if (c.customClientId) clientNameMap.set(c.customClientId, String(name).trim());
      }
    });

    const resolveClientName = (record: any): string => {
      const raw = (record.clientName || '').toString().trim();
      if (raw && !isMongoObjectId(raw) && raw.toLowerCase() !== 'null' && raw.toLowerCase() !== 'undefined') {
        return raw;
      }
      const cId = record.clientId?.toString?.() || record.accountId?.toString?.() || '';
      if (cId && clientNameMap.has(cId)) {
        return clientNameMap.get(cId)!;
      }
      return 'Unknown Client';
    };

    const commodityRates = new Map<string, number>();
    commodities.forEach((commodity: any) => {
      const key = normalizeCommodityName(commodity.name || commodity.commodityName);
      const rate = Number(commodity.ratePerMtPerDay ?? commodity.ratePerDayPerMT ?? commodity.ratePerMTPerDay ?? commodity.ratePerMTPerDay ?? 0);
      if (key && rate > 0) {
        commodityRates.set(key, rate);
      }
    });

    // Collect linked inward / outward IDs from transactions & bookings to resolve business receipt numbers
    const linkedInwardIdHexes: ObjectId[] = [];
    const linkedOutwardIdHexes: ObjectId[] = [];
    const linkedInwardIdStrings: string[] = [];
    const linkedOutwardIdStrings: string[] = [];

    const inspectLinkedIds = (rec: any) => {
      const sId = rec.sourceId ? String(rec.sourceId).trim() : '';
      const inId = rec.inwardId ? String(rec.inwardId).trim() : '';
      const outId = rec.outwardId ? String(rec.outwardId).trim() : '';
      const dir = String(rec.direction || '').toUpperCase();
      const srcType = String(rec.sourceType || '').toLowerCase();

      if (inId) {
        if (isMongoObjectId(inId)) linkedInwardIdHexes.push(new ObjectId(inId));
        linkedInwardIdStrings.push(inId);
      }
      if (outId) {
        if (isMongoObjectId(outId)) linkedOutwardIdHexes.push(new ObjectId(outId));
        linkedOutwardIdStrings.push(outId);
      }
      if (sId) {
        if (srcType === 'inward' || dir === 'INWARD') {
          if (isMongoObjectId(sId)) linkedInwardIdHexes.push(new ObjectId(sId));
          linkedInwardIdStrings.push(sId);
        } else if (srcType === 'outward' || dir === 'OUTWARD') {
          if (isMongoObjectId(sId)) linkedOutwardIdHexes.push(new ObjectId(sId));
          linkedOutwardIdStrings.push(sId);
        }
      }
    };

    bookings.forEach(inspectLinkedIds);
    transactions.forEach(inspectLinkedIds);

    const [inwardDocs, outwardDocs, coldInwardDocs, coldOutwardDocs] = await Promise.all([
      linkedInwardIdHexes.length > 0 || linkedInwardIdStrings.length > 0
        ? db.collection('inwards').find({
            _id: { $in: [...linkedInwardIdHexes, ...linkedInwardIdStrings as any] }
          }).project({ receiptNumber: 1, gatePass: 1, lotNo: 1, weighbridgeSlipNo: 1 }).toArray()
        : Promise.resolve([]),
      linkedOutwardIdHexes.length > 0 || linkedOutwardIdStrings.length > 0
        ? db.collection('outwards').find({
            _id: { $in: [...linkedOutwardIdHexes, ...linkedOutwardIdStrings as any] }
          }).project({ receiptNumber: 1, gatePass: 1, lotNo: 1, weighbridgeSlipNo: 1 }).toArray()
        : Promise.resolve([]),
      linkedInwardIdHexes.length > 0 || linkedInwardIdStrings.length > 0
        ? db.collection('coldinwards').find({
            _id: { $in: [...linkedInwardIdHexes, ...linkedInwardIdStrings as any] }
          }).project({ receiptNumber: 1, gatePass: 1, lotNo: 1, weighbridgeSlipNo: 1 }).toArray()
        : Promise.resolve([]),
      linkedOutwardIdHexes.length > 0 || linkedOutwardIdStrings.length > 0
        ? db.collection('coldoutwards').find({
            _id: { $in: [...linkedOutwardIdHexes, ...linkedOutwardIdStrings as any] }
          }).project({ receiptNumber: 1, gatePass: 1, lotNo: 1, weighbridgeSlipNo: 1 }).toArray()
        : Promise.resolve([]),
    ]);

    const linkedReferenceMap = new Map<string, string>();
    const recordDocReference = (doc: any) => {
      if (!doc?._id) return;
      const ref = resolveTransactionReference(doc, '');
      if (ref) {
        linkedReferenceMap.set(doc._id.toString(), ref);
      }
    };
    inwardDocs.forEach(recordDocReference);
    outwardDocs.forEach(recordDocReference);
    coldInwardDocs.forEach(recordDocReference);
    coldOutwardDocs.forEach(recordDocReference);

    const resolveRecordTransactionId = (txn: any): string => {
      const direct = resolveTransactionReference(txn, '');
      if (direct) return direct;

      const inId = txn.inwardId ? String(txn.inwardId).trim() : '';
      if (inId && linkedReferenceMap.has(inId)) return linkedReferenceMap.get(inId)!;

      const outId = txn.outwardId ? String(txn.outwardId).trim() : '';
      if (outId && linkedReferenceMap.has(outId)) return linkedReferenceMap.get(outId)!;

      const sId = txn.sourceId ? String(txn.sourceId).trim() : '';
      if (sId && linkedReferenceMap.has(sId)) return linkedReferenceMap.get(sId)!;

      return '-';
    };

    const uniqueTransactions = new Map<string, any>();
    const addRecord = (record: any) => {
      const resolvedCId = record.clientId?.toString?.() || record.accountId || '';
      const resolvedCName = resolveClientName(record);

      const normalized = {
        _id: record._id?.toString?.() || '',
        transactionId: resolveRecordTransactionId(record),
        receiptNumber: record.receiptNumber || undefined,
        gatePass: record.gatePass || '',
        date: record.date,
        direction: record.direction,
        mt: Number(record.mt ?? record.quantityMT ?? 0),
        clientId: resolvedCId,
        clientName: resolvedCName,
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
      const clientName = sanitizeClientName(tx.clientName, 'Unknown Client');
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
      const txs = (clientTransactions.get(key) || []).sort((a, b) => {
        const ta = a.date ? new Date(a.date).getTime() : 0;
        const tb = b.date ? new Date(b.date).getTime() : 0;
        return ta - tb;
      });
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
