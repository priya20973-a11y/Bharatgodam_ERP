'use server';

import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { getTenantFilterForMongo } from '@/lib/ownership';
import { calculateLedger } from '@/lib/ledger-engine';
import type { Transaction, Payment, MatchedRecord } from '@/lib/ledger-engine';

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

export async function getInternalLedgerData(accountId: string, tenantFilter: any) {
  const db = await getDb();

  const clientObjectId = ObjectId.isValid(accountId) ? new ObjectId(accountId) : null;
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

  const [bookings, transactionDocs, paymentsDocs, invoiceMasters, commoditiesResult, warehousesResult] = await Promise.all([
    db.collection('bookings')
      .find({ accountId, direction: { $in: ['INWARD', 'OUTWARD'] }, ...tenantFilter })
      .sort({ date: 1 })
      .toArray(),
    db.collection('transactions')
      .find({ accountId, ...tenantFilter })
      .sort({ date: 1 })
      .toArray(),
    db.collection('payments')
      .find(paymentQuery)
      .sort({ date: 1 })
      .toArray(),
    db.collection('invoice_master')
      .find({ clientId: new ObjectId(accountId), status: { $ne: 'PAID' }, ...tenantFilter })
      .toArray(),
    db.collection('commodities')
      .find({ ...tenantFilter })
      .toArray(),
    db.collection('warehouses')
      .find({ ...tenantFilter })
      .toArray(),
  ]);

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

  const transactionKeys = new Set<string>();
  const transactionData: Transaction[] = [];

  const addTransaction = (txn: Transaction & { clientId?: string; warehouseId?: string }) => {
    const key = normalizeTransactionKey(txn);
    if (transactionKeys.has(key)) return;
    transactionKeys.add(key);
    transactionData.push(txn);
  };

  bookings.forEach((txn) =>
    addTransaction({
      _id: txn._id?.toString() || '',
      date: txn.date,
      direction: txn.direction,
      mt: txn.mt,
      clientId: txn.clientId?.toString?.() || undefined,
      clientName: txn.clientName,
      commodityName: txn.commodityName,
      warehouseId: txn.warehouseId?.toString?.() || undefined,
      warehouseName: txn.warehouseId?.toString?.()
        ? warehouseNameById.get(txn.warehouseId.toString()) || 'Unknown Warehouse'
        : 'Unknown Warehouse',
      gatePass: txn.gatePass,
    })
  );

  transactionDocs.forEach((txn) =>
    addTransaction({
      _id: txn._id?.toString() || '',
      date: txn.date,
      direction: txn.direction,
      mt: txn.quantityMT,
      clientId: txn.clientId || undefined,
      clientName: txn.clientName || bookings[0]?.clientName || accountId,
      commodityName: txn.commodityName,
      warehouseId: txn.warehouseId || undefined,
      warehouseName: txn.warehouseId
        ? warehouseNameById.get(txn.warehouseId.toString()) || 'Unknown Warehouse'
        : 'Unknown Warehouse',
      gatePass: txn.gatePass || '',
    })
  );

  transactionData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const paymentData: Payment[] = paymentsDocs.map((pay) => ({
    _id: pay._id?.toString() || '',
    date: pay.paymentDate || pay.date,
    amount: pay.amount,
    clientName: pay.clientName || bookings[0]?.clientName || accountId,
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
    ledgerSummary: calculateLedger(
      group.transactions,
      [],
      bookings[0]?.clientName || accountId,
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
    clientName: booking.clientName,
    date: booking.date,
    location: booking.location || '',
    commodity: booking.commodityName || '',
    totalMT: booking.direction === 'INWARD' ? booking.mt : -booking.mt,
  }));

  const ledgerSummary = calculateLedger(
    transactionData,
    paymentData,
    bookings[0]?.clientName || accountId,
    0,
    commodityRates
  );

  return {
    ...ledgerSummary,
    transactions: transactionData,
    warehouseBreakdowns,
    matchedRecords,
    recordCount: matchedRecords.length,
    isAggregated: matchedRecords.length > 1,
    invoiceSummaries,
    invoiceOutstandingTotal: roundCurrency(invoiceOutstandingTotal),
  };
}
