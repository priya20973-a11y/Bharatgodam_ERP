'use server';

import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { getTenantFilterForMongo } from '@/lib/ownership';
import { calculateLedger, calculateRemainingStock, sanitizeClientName, isMongoObjectId, sanitizeTransactionId, resolveTransactionReference } from '@/lib/ledger-engine';
import type { Transaction, Payment, MatchedRecord } from '@/lib/ledger-engine';

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

export async function getInternalLedgerData(accountId: string, tenantFilter: any) {
  const db = await getDb();

  // Guard: require full 24-char hex before constructing ObjectId to avoid BSONTypeError
  // for legacy / non-ObjectId client ids.
  const isValidObjectId = ObjectId.isValid(accountId) && /^[a-fA-F0-9]{24}$/.test(accountId);
  const clientObjectId = isValidObjectId ? new ObjectId(accountId) : null;
  console.log(`[LEDGER ENGINE] getInternalLedgerData accountId=${accountId} isValidObjectId=${isValidObjectId}`);

  const activeRecordFilter = {
    deletedAt: { $exists: false },
    status: { $nin: ['DELETED', 'CANCELLED'] },
  };

  // 1. Resolve client name from Client collection (or legacy client_accounts)
  let resolvedClientName = '';
  if (clientObjectId) {
    const clientDoc = await db.collection('clients').findOne({ _id: clientObjectId });
    const name = clientDoc?.name || clientDoc?.clientName;
    if (name && !isMongoObjectId(name)) {
      resolvedClientName = String(name).trim();
    }
  }

  if (!resolvedClientName) {
    const clientDoc = await db.collection('clients').findOne({
      $or: [
        { _id: accountId as any },
        { customClientId: accountId },
      ]
    });
    const name = clientDoc?.name || clientDoc?.clientName;
    if (name && !isMongoObjectId(name)) {
      resolvedClientName = String(name).trim();
    }
  }

  if (!resolvedClientName) {
    const legacyDoc = await db.collection('client_accounts').findOne({
      $or: [
        ...(clientObjectId ? [{ _id: clientObjectId }] : []),
        { _id: accountId as any },
        { clientName: accountId },
      ]
    });
    const name = legacyDoc?.name || legacyDoc?.clientName;
    if (name && !isMongoObjectId(name)) {
      resolvedClientName = String(name).trim();
    }
  }

  // Build payment query safely.
  const paymentQuery: any = { ...tenantFilter };
  if (clientObjectId) {
    const clientExists = await db.collection('clients').findOne({ _id: clientObjectId, ...tenantFilter });
    if (clientExists) {
      paymentQuery.$or = [
        { accountId },
        { clientId: clientObjectId },
      ];
    } else {
      paymentQuery.accountId = accountId;
    }
  } else {
    paymentQuery.accountId = accountId;
  }

  const clientMatchConditions: any[] = [
    { accountId },
    { clientId: accountId },
  ];
  if (clientObjectId) {
    clientMatchConditions.push({ accountId: clientObjectId });
    clientMatchConditions.push({ clientId: clientObjectId });
  }

  const [bookings, transactionDocs, paymentsDocs, invoiceMasters, commoditiesResult, warehousesResult] = await Promise.all([
    db.collection('bookings')
      .find({ $or: clientMatchConditions, direction: { $in: ['INWARD', 'OUTWARD'] }, ...tenantFilter, ...activeRecordFilter })
      .sort({ date: 1 })
      .toArray(),
    db.collection('transactions')
      .find({ $or: clientMatchConditions, ...tenantFilter, ...activeRecordFilter })
      .sort({ date: 1 })
      .toArray(),
    db.collection('payments')
      .find(paymentQuery)
      .sort({ date: 1 })
      .toArray(),
    // Only query invoice_master with ObjectId when accountId is a valid 24-hex ObjectId
    isValidObjectId
      ? db.collection('invoice_master')
          .find({ clientId: new ObjectId(accountId), status: { $ne: 'PAID' }, ...tenantFilter })
          .toArray()
      : Promise.resolve([]),
    db.collection('commodities')
      .find({ ...tenantFilter })
      .toArray(),
    db.collection('warehouses')
      .find({ ...tenantFilter })
      .toArray(),
  ]);

  // Build a lookup map of client IDs to names for any referenced clients
  const referencedClientIds = new Set<string>();
  if (accountId) referencedClientIds.add(accountId);
  bookings.forEach((b: any) => {
    const cId = b.clientId?.toString?.() || b.accountId?.toString?.();
    if (cId) referencedClientIds.add(cId);
    if (b.clientName && isMongoObjectId(b.clientName)) referencedClientIds.add(String(b.clientName).trim());
  });
  transactionDocs.forEach((t: any) => {
    const cId = t.clientId?.toString?.() || t.accountId?.toString?.();
    if (cId) referencedClientIds.add(cId);
    if (t.clientName && isMongoObjectId(t.clientName)) referencedClientIds.add(String(t.clientName).trim());
  });

  const clientNameMap = new Map<string, string>();
  if (resolvedClientName) {
    clientNameMap.set(accountId, resolvedClientName);
    if (clientObjectId) clientNameMap.set(clientObjectId.toString(), resolvedClientName);
  }

  const idsToLookup = Array.from(referencedClientIds).filter((id) => !clientNameMap.has(id));
  if (idsToLookup.length > 0) {
    const validHexIds = idsToLookup
      .filter((id) => ObjectId.isValid(id) && isMongoObjectId(id))
      .map((id) => new ObjectId(id));

    const [extraClients, extraLegacy] = await Promise.all([
      db.collection('clients').find({
        $or: [
          { _id: { $in: [...validHexIds, ...idsToLookup as any] } },
          { customClientId: { $in: idsToLookup } },
        ]
      }).project({ name: 1, clientName: 1, customClientId: 1 }).toArray(),
      db.collection('client_accounts').find({
        _id: { $in: [...validHexIds, ...idsToLookup as any] }
      }).project({ name: 1, clientName: 1 }).toArray()
    ]);

    extraClients.forEach((c: any) => {
      const name = c.name || c.clientName;
      if (name && !isMongoObjectId(name)) {
        if (c._id) clientNameMap.set(c._id.toString(), String(name).trim());
        if (c.customClientId) clientNameMap.set(c.customClientId, String(name).trim());
      }
    });

    extraLegacy.forEach((c: any) => {
      const name = c.name || c.clientName;
      if (name && !isMongoObjectId(name)) {
        if (c._id) clientNameMap.set(c._id.toString(), String(name).trim());
      }
    });
  }

  const resolveRecordClientName = (rec: any): string => {
    const raw = (rec?.clientName || '').toString().trim();
    if (raw && !isMongoObjectId(raw) && raw.toLowerCase() !== 'null' && raw.toLowerCase() !== 'undefined') {
      return raw;
    }
    const cId = rec?.clientId?.toString?.() || rec?.accountId?.toString?.() || '';
    if (cId && clientNameMap.has(cId)) {
      return clientNameMap.get(cId)!;
    }
    if (resolvedClientName) {
      return resolvedClientName;
    }
    return 'Unknown Client';
  };

  const primaryClientName = resolvedClientName ||
    resolveRecordClientName(bookings[0]) ||
    resolveRecordClientName(transactionDocs[0]) ||
    'Unknown Client';

  const invoiceIds = invoiceMasters
    .map((invoice: any) => invoice.invoiceId)
    .filter((invoiceId: any) => typeof invoiceId === 'string' && invoiceId.trim().length > 0);
  const invoiceMasterIds = invoiceMasters
    .map((invoice: any) => invoice._id?.toString())
    .filter((id: any) => typeof id === 'string' && id.trim().length > 0);
  const generatedInvoiceKeys = invoiceMasters
    .map((invoice: any) => {
      const clientId = invoice.clientId?.toString?.() || invoice.clientId;
      const invoiceMonth = invoice.invoiceMonth;
      if (!clientId || !invoiceMonth) return null;
      const warehouseId = invoice.warehouseId?.toString?.() || invoice.warehouseId;
      return warehouseId ? `${clientId}-${invoiceMonth}-${warehouseId}` : `${clientId}-${invoiceMonth}`;
    })
    .filter((key: any) => typeof key === 'string' && key.trim().length > 0);

  const adjustmentInvoiceIds = Array.from(
    new Set([...invoiceIds, ...generatedInvoiceKeys])
  );

  const adjustmentQuery: any = { ...tenantFilter };
  if (adjustmentInvoiceIds.length > 0 || invoiceMasterIds.length > 0) {
    adjustmentQuery.$or = [];
    if (adjustmentInvoiceIds.length > 0) adjustmentQuery.$or.push({ invoiceId: { $in: adjustmentInvoiceIds } });
    if (invoiceMasterIds.length > 0) adjustmentQuery.$or.push({ masterId: { $in: invoiceMasterIds } });
  } else {
    adjustmentQuery._id = { $exists: false };
  }

  const invoiceAdjustments = await db.collection('invoice_adjustments').find(adjustmentQuery).toArray();

  const normalizeCommodityName = (value: string | undefined | null) =>
    typeof value === 'string' ? value.trim().toUpperCase() : '';

  const commodityRates = new Map<string, number>();
  const commodityNameById = new Map<string, string>();

  commoditiesResult.forEach((commodity: any) => {
    const nameKey = normalizeCommodityName(commodity.name);
    const rate = Number(
      commodity.ratePerMtPerDay ?? commodity.ratePerDayPerMT ?? commodity.ratePerMTPerDay ?? commodity.ratePerMTPerDay ?? 0
    );

    if (nameKey && rate > 0) {
      commodityRates.set(nameKey, rate);
    }

    if (commodity?._id) {
      commodityNameById.set(commodity._id.toString(), commodity.name || '');
    }
  });

  const warehouseNameById = new Map<string, string>();
  warehousesResult.forEach((warehouse: any) => {
    if (warehouse?._id) {
      warehouseNameById.set(warehouse._id.toString(), warehouse.name || 'Unknown Warehouse');
    }
  });

  const normalizeTransactionKey = (txn: Transaction & { clientId?: string; warehouseId?: string }) => {
    const clientKey = (txn.clientId || txn.clientName || '').toString().trim().toUpperCase();
    const commodityKey = (txn.commodityName || '').toString().trim().toUpperCase();
    const warehouseKey = (txn.warehouseId || '').toString().trim().toUpperCase();

    return [
      (txn.date || '').toString().trim(),
      txn.direction,
      Number(txn.mt || 0).toFixed(4),
      clientKey,
      commodityKey,
      warehouseKey,
    ].join('|');
  };

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
  transactionDocs.forEach(inspectLinkedIds);

  const [inwardDocs, outwardDocs, coldInwardDocs, coldOutwardDocs, clientOutwardDocs, clientInwardDocs] = await Promise.all([
    linkedInwardIdHexes.length > 0 || linkedInwardIdStrings.length > 0
      ? db.collection('inwards').find({
          _id: { $in: [...linkedInwardIdHexes, ...linkedInwardIdStrings as any] }
        }).project({ receiptNumber: 1, gatePass: 1, lotNo: 1, weighbridgeSlipNo: 1, bagsCount: 1, bags: 1, date: 1, quantityMT: 1, clientId: 1, commodityId: 1, warehouseId: 1 }).toArray()
      : Promise.resolve([]),
    linkedOutwardIdHexes.length > 0 || linkedOutwardIdStrings.length > 0
      ? db.collection('outwards').find({
          _id: { $in: [...linkedOutwardIdHexes, ...linkedOutwardIdStrings as any] }
        }).project({ receiptNumber: 1, gatePass: 1, lotNo: 1, weighbridgeSlipNo: 1, bagsCount: 1, bags: 1, date: 1, quantityMT: 1, clientId: 1, commodityId: 1, warehouseId: 1 }).toArray()
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
    // Also fetch outwards for this client account to ensure historical and direct outward transactions get actual bag quantity
    db.collection('outwards').find({
      ...(clientObjectId ? { clientId: { $in: [clientObjectId, accountId] } } : { clientId: accountId }),
      ...tenantFilter,
      ...activeRecordFilter,
    }).project({ _id: 1, receiptNumber: 1, gatePass: 1, lotNo: 1, weighbridgeSlipNo: 1, bagsCount: 1, bags: 1, date: 1, quantityMT: 1, clientId: 1, commodityId: 1, warehouseId: 1 }).toArray(),
    // Also fetch inwards for this client account to ensure historical and direct inward transactions get actual bag quantity
    db.collection('inwards').find({
      ...(clientObjectId ? { clientId: { $in: [clientObjectId, accountId] } } : { clientId: accountId }),
      ...tenantFilter,
      ...activeRecordFilter,
    }).project({ _id: 1, receiptNumber: 1, gatePass: 1, lotNo: 1, weighbridgeSlipNo: 1, bagsCount: 1, bags: 1, date: 1, quantityMT: 1, clientId: 1, commodityId: 1, warehouseId: 1 }).toArray()
  ]);

  const outwardDocMap = new Map<string, any>();
  const outwardDocList = [...(outwardDocs || []), ...(clientOutwardDocs || [])];
  outwardDocList.forEach((doc: any) => {
    if (doc?._id) {
      outwardDocMap.set(doc._id.toString(), doc);
    }
  });

  const inwardDocMap = new Map<string, any>();
  const inwardDocList = [...(inwardDocs || []), ...(clientInwardDocs || [])];
  inwardDocList.forEach((doc: any) => {
    if (doc?._id) {
      inwardDocMap.set(doc._id.toString(), doc);
    }
  });

  const resolveInwardBags = (txn: any): number | undefined => {
    const sId = txn.sourceId ? String(txn.sourceId).trim() : '';
    const inId = txn.inwardId ? String(txn.inwardId).trim() : '';
    const idStr = txn._id ? String(txn._id).trim() : '';

    let matchedDoc: any = null;
    if (sId && inwardDocMap.has(sId)) matchedDoc = inwardDocMap.get(sId);
    else if (inId && inwardDocMap.has(inId)) matchedDoc = inwardDocMap.get(inId);
    else if (idStr && inwardDocMap.has(idStr)) matchedDoc = inwardDocMap.get(idStr);

    if (!matchedDoc && txn.receiptNumber && String(txn.receiptNumber).trim()) {
      const rn = String(txn.receiptNumber).trim().toLowerCase();
      matchedDoc = inwardDocList.find((o: any) => String(o.receiptNumber || '').trim().toLowerCase() === rn);
    }

    if (!matchedDoc && txn.gatePass && String(txn.gatePass).trim()) {
      const gp = String(txn.gatePass).trim().toLowerCase();
      matchedDoc = inwardDocList.find((o: any) => String(o.gatePass || '').trim().toLowerCase() === gp);
    }

    if (!matchedDoc) {
      const txnDateStr = txn.date instanceof Date ? txn.date.toISOString().split('T')[0] : String(txn.date || '').split('T')[0];
      const txnQty = Number(txn.quantityMT ?? txn.mt ?? 0);
      matchedDoc = inwardDocList.find((o: any) => {
        const oDateStr = o.date instanceof Date ? o.date.toISOString().split('T')[0] : String(o.date || '').split('T')[0];
        const oQty = Number(o.quantityMT || 0);
        return oDateStr === txnDateStr && Math.abs(oQty - txnQty) < 0.001;
      });
    }

    if (matchedDoc && matchedDoc.bagsCount !== undefined && matchedDoc.bagsCount !== null && matchedDoc.bagsCount !== '') {
      return Number(matchedDoc.bagsCount);
    }
    if (matchedDoc && matchedDoc.bags !== undefined && matchedDoc.bags !== null && matchedDoc.bags !== '') {
      return Number(matchedDoc.bags);
    }
    if (txn.bagsCount !== undefined && txn.bagsCount !== null && txn.bagsCount !== '') {
      return Number(txn.bagsCount);
    }
    if (txn.bags !== undefined && txn.bags !== null && txn.bags !== '') {
      return Number(txn.bags);
    }
    return undefined;
  };

  const resolveOutwardBags = (txn: any): number | undefined => {
    const sId = txn.sourceId ? String(txn.sourceId).trim() : '';
    const outId = txn.outwardId ? String(txn.outwardId).trim() : '';
    const idStr = txn._id ? String(txn._id).trim() : '';

    let matchedDoc: any = null;
    if (sId && outwardDocMap.has(sId)) matchedDoc = outwardDocMap.get(sId);
    else if (outId && outwardDocMap.has(outId)) matchedDoc = outwardDocMap.get(outId);
    else if (idStr && outwardDocMap.has(idStr)) matchedDoc = outwardDocMap.get(idStr);

    if (!matchedDoc && txn.gatePass && String(txn.gatePass).trim()) {
      const gp = String(txn.gatePass).trim().toLowerCase();
      matchedDoc = outwardDocList.find((o: any) => String(o.gatePass || '').trim().toLowerCase() === gp);
    }

    if (!matchedDoc) {
      const txnDateStr = txn.date instanceof Date ? txn.date.toISOString().split('T')[0] : String(txn.date || '').split('T')[0];
      const txnQty = Number(txn.quantityMT ?? txn.mt ?? 0);
      matchedDoc = outwardDocList.find((o: any) => {
        const oDateStr = o.date instanceof Date ? o.date.toISOString().split('T')[0] : String(o.date || '').split('T')[0];
        const oQty = Number(o.quantityMT || 0);
        return oDateStr === txnDateStr && Math.abs(oQty - txnQty) < 0.001;
      });
    }

    if (matchedDoc && matchedDoc.bagsCount !== undefined && matchedDoc.bagsCount !== null && matchedDoc.bagsCount !== '') {
      return Number(matchedDoc.bagsCount);
    }
    if (txn.bagsCount !== undefined && txn.bagsCount !== null && txn.bagsCount !== '') {
      return Number(txn.bagsCount);
    }
    if (txn.bags !== undefined && txn.bags !== null && txn.bags !== '') {
      return Number(txn.bags);
    }
    return undefined;
  };

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
    // 1. Direct business reference fields on the transaction or booking record
    const direct = resolveTransactionReference(txn, '');
    if (direct) return direct;

    // 2. Check linked inward/outward records
    const inId = txn.inwardId ? String(txn.inwardId).trim() : '';
    if (inId && linkedReferenceMap.has(inId)) return linkedReferenceMap.get(inId)!;

    const outId = txn.outwardId ? String(txn.outwardId).trim() : '';
    if (outId && linkedReferenceMap.has(outId)) return linkedReferenceMap.get(outId)!;

    const sId = txn.sourceId ? String(txn.sourceId).trim() : '';
    if (sId && linkedReferenceMap.has(sId)) return linkedReferenceMap.get(sId)!;

    // 3. Fallback to '-' (never display a 24-character hexadecimal MongoDB ObjectId)
    return '-';
  };

  const transactionKeys = new Set<string>();
  const transactionData: Transaction[] = [];

  const addTransaction = (txn: Transaction & { clientId?: string; warehouseId?: string }) => {
    const key = normalizeTransactionKey(txn);
    if (transactionKeys.has(key)) return;
    transactionKeys.add(key);
    transactionData.push(txn);
  };

  bookings.forEach((txn) => {
    const isOutward = txn.direction === 'OUTWARD';
    const bagsCount = isOutward ? resolveOutwardBags(txn) : resolveInwardBags(txn);

    addTransaction({
      _id: txn._id?.toString() || '',
      transactionId: resolveRecordTransactionId(txn),
      receiptNumber: txn.receiptNumber || undefined,
      date: txn.date,
      direction: txn.direction,
      mt: txn.mt,
      clientId: txn.clientId?.toString?.() || undefined,
      clientName: resolveRecordClientName(txn),
      commodityName: txn.commodityName,
      warehouseId: txn.warehouseId?.toString?.() || undefined,
      warehouseName: txn.warehouseId?.toString?.()
        ? warehouseNameById.get(txn.warehouseId.toString()) || 'Unknown Warehouse'
        : 'Unknown Warehouse',
      gatePass: txn.gatePass,
      actualWeight: txn.actualWeight,
      netWeightLoss: txn.netWeightLoss,
      partyName: txn.partyName,
      bagsCount: bagsCount,
      bags: bagsCount,
    });
  });

  transactionDocs.forEach((txn) => {
    const isOutward = txn.direction === 'OUTWARD';
    const bagsCount = isOutward ? resolveOutwardBags(txn) : resolveInwardBags(txn);

    addTransaction({
      _id: txn._id?.toString() || '',
      transactionId: resolveRecordTransactionId(txn),
      receiptNumber: txn.receiptNumber || undefined,
      date: txn.date,
      direction: txn.direction,
      mt: txn.quantityMT,
      clientId: txn.clientId || undefined,
      clientName: resolveRecordClientName(txn),
      commodityName: txn.commodityName,
      warehouseId: txn.warehouseId || undefined,
      warehouseName: txn.warehouseId
        ? warehouseNameById.get(txn.warehouseId.toString()) || 'Unknown Warehouse'
        : 'Unknown Warehouse',
      gatePass: txn.gatePass || '',
      actualWeight: txn.actualWeight,
      netWeightLoss: txn.netWeightLoss,
      partyName: txn.partyName,
      bagsCount: bagsCount,
      bags: bagsCount,
    });
  });

  (clientInwardDocs || []).forEach((doc: any) => {
    const rawBags = doc.bagsCount !== undefined && doc.bagsCount !== null && doc.bagsCount !== ''
      ? Number(doc.bagsCount)
      : (doc.bags !== undefined && doc.bags !== null && doc.bags !== '' ? Number(doc.bags) : undefined);
    const dateStr = doc.date instanceof Date ? doc.date.toISOString().split('T')[0] : String(doc.date || '').split('T')[0];
    const warehouseIdStr = doc.warehouseId?.toString?.() || undefined;

    addTransaction({
      _id: doc._id?.toString() || '',
      transactionId: resolveRecordTransactionId(doc),
      receiptNumber: doc.receiptNumber || undefined,
      date: dateStr,
      direction: 'INWARD',
      mt: Number(doc.quantityMT || 0),
      clientId: doc.clientId?.toString?.() || accountId,
      clientName: primaryClientName,
      commodityName: doc.commodityId ? (commodityNameById.get(doc.commodityId.toString()) || 'Unknown Commodity') : 'Unknown Commodity',
      warehouseId: warehouseIdStr,
      warehouseName: warehouseIdStr ? (warehouseNameById.get(warehouseIdStr) || 'Unknown Warehouse') : 'Unknown Warehouse',
      gatePass: doc.gatePass || '',
      actualWeight: doc.actualWeight,
      netWeightLoss: doc.netWeightLoss,
      partyName: doc.partyName,
      bagsCount: rawBags,
      bags: rawBags,
    });
  });

  (clientOutwardDocs || []).forEach((doc: any) => {
    const rawBags = doc.bagsCount !== undefined && doc.bagsCount !== null && doc.bagsCount !== ''
      ? Number(doc.bagsCount)
      : (doc.bags !== undefined && doc.bags !== null && doc.bags !== '' ? Number(doc.bags) : undefined);
    const dateStr = doc.date instanceof Date ? doc.date.toISOString().split('T')[0] : String(doc.date || '').split('T')[0];
    const warehouseIdStr = doc.warehouseId?.toString?.() || undefined;

    addTransaction({
      _id: doc._id?.toString() || '',
      transactionId: resolveRecordTransactionId(doc),
      receiptNumber: doc.receiptNumber || undefined,
      date: dateStr,
      direction: 'OUTWARD',
      mt: Number(doc.quantityMT || 0),
      clientId: doc.clientId?.toString?.() || accountId,
      clientName: primaryClientName,
      commodityName: doc.commodityId ? (commodityNameById.get(doc.commodityId.toString()) || 'Unknown Commodity') : 'Unknown Commodity',
      warehouseId: warehouseIdStr,
      warehouseName: warehouseIdStr ? (warehouseNameById.get(warehouseIdStr) || 'Unknown Warehouse') : 'Unknown Warehouse',
      gatePass: doc.gatePass || '',
      actualWeight: doc.actualWeight,
      netWeightLoss: doc.netWeightLoss,
      partyName: doc.partyName,
      bagsCount: rawBags,
      bags: rawBags,
    });
  });

  transactionData.sort((a, b) => {
    const ta = a.date ? new Date(a.date).getTime() : 0;
    const tb = b.date ? new Date(b.date).getTime() : 0;
    return ta - tb;
  });

  const paymentData: Payment[] = paymentsDocs.map((pay) => ({
    _id: pay._id?.toString() || '',
    date: pay.paymentDate || pay.date || new Date().toISOString(),
    amount: Number(pay.amount || 0),
    clientName: resolveRecordClientName(pay),
  }));

  const warehouseGroups = new Map<string, {
    warehouseId: string;
    warehouseName: string;
    transactions: Transaction[];
  }>();

  transactionData.forEach((txn) => {
    const warehouseId = txn.warehouseId?.toString?.() || 'unknown';
    const warehouseName = warehouseId === 'unknown'
      ? 'Unknown Warehouse'
      : warehouseNameById.get(warehouseId) || 'Unknown Warehouse';

    const group = warehouseGroups.get(warehouseId) || {
      warehouseId,
      warehouseName,
      transactions: [],
    };

    group.transactions.push(txn);
    warehouseGroups.set(warehouseId, group);
  });

  const warehouseBreakdowns = Array.from(warehouseGroups.values()).map((group) => ({
    warehouseId: group.warehouseId,
    warehouseName: group.warehouseName,
    stockSummary: calculateRemainingStock(group.transactions),
    ledgerSummary: calculateLedger(
      group.transactions,
      [],
      primaryClientName,
      0,
      commodityRates
    ),
  }));

  const adjustmentsByInvoiceId = new Map<string, any[]>();
  const adjustmentsByMasterId = new Map<string, any[]>();

  invoiceAdjustments.forEach((adjustment: any) => {
    const invoiceId = adjustment.invoiceId?.toString?.();
    const masterId = adjustment.masterId?.toString?.();

    if (invoiceId) {
      adjustmentsByInvoiceId.set(
        invoiceId,
        (adjustmentsByInvoiceId.get(invoiceId) || []).concat(adjustment)
      );
    }

    if (masterId) {
      adjustmentsByMasterId.set(
        masterId,
        (adjustmentsByMasterId.get(masterId) || []).concat(adjustment)
      );
    }
  });

  const normalizeAdjustmentItems = (items: any[]) =>
    (items || [])
      .map((item) => ({
        id: item._id?.toString(),
        name: item.name || item.note || 'Additional Charge',
        amount: Number(item.amount ?? item.additionalCharges ?? 0),
        note: item.note || '',
      }))
      .filter((item) => item.amount > 0);

  const invoiceSummaries = invoiceMasters.map((invoice: any) => {
    const clientId = invoice.clientId?.toString?.() || invoice.clientId;
    const invoiceMonth = invoice.invoiceMonth;
    const warehouseId = invoice.warehouseId?.toString?.() || invoice.warehouseId;
    const generatedInvoiceId = clientId && invoiceMonth
      ? warehouseId
        ? `${clientId}-${invoiceMonth}-${warehouseId}`
        : `${clientId}-${invoiceMonth}`
      : null;

    const collectedAdjustments = [
      adjustmentsByInvoiceId.get(invoice.invoiceId),
      adjustmentsByMasterId.get(invoice._id?.toString?.()),
      generatedInvoiceId ? adjustmentsByInvoiceId.get(generatedInvoiceId) : undefined,
    ].filter(Boolean).flat();

    const uniqueAdjustments = Array.from(
      new Map(collectedAdjustments.map((item: any) => [item._id?.toString?.() || JSON.stringify(item), item])).values()
    );

    const adjustments = normalizeAdjustmentItems(uniqueAdjustments);
    const additionalCharges = adjustments.reduce((sum, item) => sum + item.amount, 0);
    const totalInvoiceAmount = Number(invoice.totalAmount || 0) + additionalCharges;

    return {
      invoiceId: invoice.invoiceId || invoice._id?.toString?.(),
      invoiceMonth: invoice.invoiceMonth || '',
      invoiceDate: invoice.generatedAt || invoice.date || '',
      dueDate: invoice.dueDate || '',
      status: invoice.status || '',
      totalAmount: Number(invoice.totalAmount || 0),
      additionalCharges,
      totalInvoiceAmount,
      additionalChargeItems: adjustments,
    };
  });

  const invoiceOutstandingTotal = invoiceSummaries.reduce((sum, invoice) => sum + invoice.additionalCharges, 0);

  const matchedRecords: MatchedRecord[] = bookings.map((booking) => ({
    _id: booking._id?.toString() || '',
    clientName: resolveRecordClientName(booking),
    date: booking.date,
    location: booking.location || '',
    commodity: booking.commodityName || '',
    totalMT: booking.direction === 'INWARD' ? booking.mt : -booking.mt,
  }));

  const ledgerSummary = calculateLedger(
    transactionData,
    paymentData,
    primaryClientName,
    0,
    commodityRates
  );

  const stockSummary = calculateRemainingStock(transactionData);

  return {
    ...ledgerSummary,
    clientName: primaryClientName,
    transactions: transactionData,
    stockSummary,
    warehouseBreakdowns,
    matchedRecords,
    recordCount: matchedRecords.length,
    isAggregated: matchedRecords.length > 1,
    invoiceSummaries,
    invoiceOutstandingTotal: roundCurrency(invoiceOutstandingTotal),
  };
}
