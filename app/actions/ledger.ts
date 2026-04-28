'use server';

import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { getClientPayments } from '@/app/actions/reports';
import { differenceInCalendarDays, isLastDayOfMonth } from 'date-fns';
import type { IInvoiceMaster, IInvoiceLineItem } from '@/types/schemas';
import { generateStoragePeriods, type Transaction } from '@/lib/storage-engine';
import { getTenantFilterForMongo, requireSession } from '@/lib/ownership';

export interface ClientMonthlyLedgerRow {
  commodity: string;
  rate: number;
  fromDate: string;
  toDate: string;
  qty: number;
  days: number;
  rent: number;
  status: string;
  calculation: string;
  warehouseId?: string;
  warehouseName?: string;
}

export interface ClientMonthlyLedgerSummary {
  totalRent: number;
  previousBalance: number;
  payments: number;
  outstanding: number;
}

export interface ClientMonthLedger {
  month: string;
  rows: ClientMonthlyLedgerRow[];
  summary: ClientMonthlyLedgerSummary;
  warehouseId?: string;
  warehouseName?: string;
  invoiceId?: string;
}

export interface ClientMonthlyLedgerResult {
  clientId: string;
  clientName: string;
  months: ClientMonthLedger[];
  availableMonths: string[];
  outstanding: number;
}

function normalizeDate(dateValue: string | Date): Date {
  if (dateValue instanceof Date) {
    return new Date(Date.UTC(dateValue.getUTCFullYear(), dateValue.getUTCMonth(), dateValue.getUTCDate()));
  }

  return new Date(`${dateValue.toString().slice(0, 10)}T00:00:00.000Z`);
}

function formatMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function calculateDays(fromDate: string, toDate: string): number {
  const start = normalizeDate(fromDate);
  const end = normalizeDate(toDate);
  let days = differenceInCalendarDays(end, start);
  
  // If period ends on the last day of the month, add +1
  if (isLastDayOfMonth(end)) {
    days += 1;
  }
  
  return Math.max(1, days);
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function mapInvoiceLineItemToLedgerRow(item: IInvoiceLineItem | any, masterStatus: string): ClientMonthlyLedgerRow {
  const quantity = Number(item.averageQuantityMT ?? item.quantityMT ?? 0);
  const days = Number(item.daysOccupied ?? item.durationDays ?? 0);
  const monthlyRate = item.rateApplied !== undefined && item.rateApplied !== null
    ? roundCurrency(Number(item.rateApplied))
    : roundCurrency(Number(item.ratePerMTPerDay ?? 0) * 30);
  const rent = roundCurrency(Number(item.totalAmount ?? 0));
  const calculation = `${roundCurrency(quantity).toFixed(2)} MT × ₹${monthlyRate.toFixed(2)} / MT × ${days} / 30 days`;

  return {
    commodity: item.commodityName || item.commodity || 'Unknown Commodity',
    rate: monthlyRate,
    fromDate: item.periodStart || item.startDate || '',
    toDate: item.periodEnd || item.endDate || '',
    qty: roundCurrency(quantity),
    days,
    rent,
    status: masterStatus || 'DRAFT',
    calculation,
  };
}

function generateClientMonthlyLedgerFromInvoices(
  invoiceMasters: IInvoiceMaster[],
  lineItems: IInvoiceLineItem[],
  payments: any[] = []
): ClientMonthLedger[] {
  const rows: ClientMonthlyLedgerRow[] = [];
  const invoiceItemsByMaster = new Map<string, IInvoiceLineItem[]>();

  invoiceMasters.forEach((master) => {
    const masterId = master._id?.toString();
    if (!masterId) return;
    invoiceItemsByMaster.set(masterId, []);
  });

  lineItems.forEach((item) => {
    const masterId = item.invoiceMasterId?.toString?.();
    if (masterId && invoiceItemsByMaster.has(masterId)) {
      invoiceItemsByMaster.get(masterId)?.push(item);
    }
  });

  invoiceMasters.forEach((master) => {
    const masterId = master._id?.toString();
    if (!masterId) return;

    const masterRows = invoiceItemsByMaster.get(masterId) || [];
    const monthKey = master.invoiceMonth || '';
    const masterStatus = master.status || 'DRAFT';

    masterRows.forEach((item) => {
      rows.push({
        ...mapInvoiceLineItemToLedgerRow(item, masterStatus),
      });
    });
  });

  const paymentsByMonth = payments.reduce((acc: Record<string, number>, payment: any) => {
    const paymentDate = payment.paymentDate || payment.date;
    if (!paymentDate) return acc;
    const monthKey = formatMonthKey(normalizeDate(paymentDate));
    acc[monthKey] = (acc[monthKey] || 0) + Number(payment.amount || 0);
    return acc;
  }, {});

  const grouped = new Map<string, ClientMonthlyLedgerRow[]>();
  invoiceMasters.forEach((master) => {
    const monthKey = master.invoiceMonth || '';
    const masterId = master._id?.toString();
    if (!masterId) return;

    const masterRows = invoiceItemsByMaster.get(masterId) || [];
    if (masterRows.length === 0) {
      grouped.set(monthKey, grouped.get(monthKey) || []);
      return;
    }

    grouped.set(monthKey, [...(grouped.get(monthKey) || []), ...masterRows.map((item) => mapInvoiceLineItemToLedgerRow(item, master.status || 'DRAFT'))]);
  });

  const allMonthKeys = new Set<string>([
    ...Array.from(grouped.keys()),
    ...Object.keys(paymentsByMonth),
  ]);

  const sortedMonthKeys = Array.from(allMonthKeys).filter((key) => key).sort();
  const monthlyLedgers: ClientMonthLedger[] = [];
  let runningBalance = 0;

  sortedMonthKeys.forEach((monthKey) => {
    const monthRows = grouped.get(monthKey) || [];
    const totalRent = roundCurrency(monthRows.reduce((sum, row) => sum + row.rent, 0));
    const paymentsForMonth = roundCurrency(paymentsByMonth[monthKey] || 0);
    const previousBalance = roundCurrency(runningBalance);
    const outstanding = roundCurrency(previousBalance + totalRent - paymentsForMonth);

    monthlyLedgers.push({
      month: monthKey,
      rows: monthRows,
      summary: {
        totalRent,
        previousBalance,
        payments: paymentsForMonth,
        outstanding,
      },
    });

    runningBalance = outstanding;
  });

  return monthlyLedgers;
}

function splitLedgerEntryByMonth(entry: any): ClientMonthlyLedgerRow[] {
  const start = normalizeDate(entry.periodStartDate || entry.startDate);
  const end = normalizeDate(entry.periodEndDate || entry.endDate);
  const baseQty = Number(entry.quantityMT) || 0;
  const dailyRate = Number(entry.ratePerMTPerDay || entry.dailyRate || 0);
  const commodity = entry.commodity?.name || entry.commodityName || 'Unknown Commodity';
  const status = entry.status || 'COMPLETED';
  const monthlyRate = Math.round(dailyRate * 30 * 100) / 100;

  const rows: ClientMonthlyLedgerRow[] = [];
  let currentStart = new Date(start);

  while (currentStart <= end) {
    const monthEnd = new Date(Date.UTC(currentStart.getUTCFullYear(), currentStart.getUTCMonth() + 1, 0));
    const currentEnd = end < monthEnd ? end : monthEnd;
    const fromDate = formatDateKey(currentStart);
    const toDate = formatDateKey(currentEnd);
    const days = calculateDays(fromDate, toDate);
    const rent = roundCurrency(baseQty * dailyRate * days);

    const roundedQty = roundCurrency(baseQty);
    const calculation = `${roundedQty} MT × ₹${monthlyRate.toFixed(2)}/MT × ${days} / 30`;

    rows.push({
      commodity,
      rate: monthlyRate,
      fromDate,
      toDate,
      qty: roundedQty,
      days,
      rent,
      status,
      calculation,
    });

    currentStart = new Date(currentEnd);
    currentStart.setUTCDate(currentStart.getUTCDate() + 1);
  }

  return rows;
}

export async function generateClientMonthlyLedger(
  clientId: string,
  ledgerEntries: any[],
  payments: any[] = [],
  rates?: Record<string, number>
): Promise<ClientMonthLedger[]> {
  const rows: ClientMonthlyLedgerRow[] = ledgerEntries
    .flatMap((entry) => splitLedgerEntryByMonth(entry))
    .filter((row) => row.qty > 0 || row.rent > 0);

  const paymentsByMonth = payments.reduce((acc: Record<string, number>, payment: any) => {
    const paymentDate = payment.paymentDate || payment.date;
    if (!paymentDate) return acc;
    const monthKey = formatMonthKey(normalizeDate(paymentDate));
    acc[monthKey] = (acc[monthKey] || 0) + Number(payment.amount || 0);
    return acc;
  }, {});

  const grouped = new Map<string, ClientMonthlyLedgerRow[]>();
  rows.forEach((row) => {
    const monthKey = formatMonthKey(normalizeDate(row.fromDate));
    if (!grouped.has(monthKey)) {
      grouped.set(monthKey, []);
    }
    grouped.get(monthKey)?.push(row);
  });

  const allMonthKeys = new Set<string>([
    ...Array.from(grouped.keys()),
    ...Object.keys(paymentsByMonth),
  ]);

  const sortedMonthKeys = Array.from(allMonthKeys).sort();
  const monthlyLedgers: ClientMonthLedger[] = [];
  let runningBalance = 0;

  sortedMonthKeys.forEach((monthKey) => {
    const monthRows = grouped.get(monthKey) || [];
    const totalRent = roundCurrency(monthRows.reduce((sum, row) => sum + row.rent, 0));
    const paymentsForMonth = roundCurrency(paymentsByMonth[monthKey] || 0);
    const previousBalance = roundCurrency(runningBalance);
    const outstanding = roundCurrency(previousBalance + totalRent - paymentsForMonth);

    monthlyLedgers.push({
      month: monthKey,
      rows: monthRows,
      summary: {
        totalRent,
        previousBalance,
        payments: paymentsForMonth,
        outstanding,
      },
    });

    runningBalance = outstanding;
  });

  return monthlyLedgers;
}

export async function getClientMonthlyLedger(clientId: string, month?: string, warehouseId?: string, tenantFilter?: any) {
  console.log(`=== GETTING LEDGER FOR CLIENT: ${clientId}, MONTH: ${month || 'ALL'}, WAREHOUSE: ${warehouseId || 'ANY'} ===`);

  // Get tenant filter if not provided
  if (!tenantFilter) {
    try {
      const session = await requireSession();
      tenantFilter = getTenantFilterForMongo(session);
    } catch (error) {
      // If no session, use empty filter (for backward compatibility)
      tenantFilter = {};
    }
  }

  const db = await getDb();
  if (!db) throw new Error('Database connection not established');

  if (!ObjectId.isValid(clientId)) {
    console.log(`INVALID CLIENT ID: ${clientId}`);
    return { success: false, message: 'Invalid client ID provided' };
  }

  const clientObjectId = new ObjectId(clientId);
  const client = await db.collection('clients').findOne({ _id: clientObjectId, ...(tenantFilter || {}) });
  const clientName = client?.name || client?.clientName || 'Unknown Client';

  console.log(`CLIENT FOUND: ${clientName} (${clientId})`);

  // Build transaction query for the client
  const transactionQuery: any = { clientId: clientId, ...(tenantFilter || {}) };
  if (warehouseId && warehouseId !== 'ALL') {
    transactionQuery.warehouseId = warehouseId;
  }

  const transactions = await db.collection('transactions').find(transactionQuery, { sort: { date: 1 } }).toArray();

  console.log(`CLIENT ${clientId} (${clientName}): Found ${transactions.length} transactions`);
  console.log('TRANSACTIONS:', transactions.map(t => ({
    date: t.date,
    direction: t.direction,
    quantityMT: t.quantityMT,
    commodityId: t.commodityId,
    warehouseId: t.warehouseId
  })));

  // Get commodity rates
  const commodityIds = [...new Set(transactions.map(t => t.commodityId))];
  const commodities = await db.collection('commodities').find(
    { _id: { $in: commodityIds.map(id => new ObjectId(id)) }, ...(tenantFilter || {}) }
  ).toArray();
  const commodityMap = new Map(commodities.map(c => [c._id.toString(), c]));

  console.log(`CLIENT ${clientId}: Found ${commodities.length} commodities`);
  console.log('COMMODITIES:', commodities.map(c => ({ id: c._id, name: c.name, rate: c.ratePerMtPerDay })));

  // Convert to Transaction format and group by commodity/warehouse
  const txnGroups = new Map<string, { txns: Transaction[]; warehouseId: string }>();
  const warehouseIds = new Set<string>();

  transactions.forEach(txn => {
    const key = `${txn.commodityId}-${txn.warehouseId}`;
    if (!txnGroups.has(key)) txnGroups.set(key, { txns: [], warehouseId: txn.warehouseId });

    const commodity = commodityMap.get(txn.commodityId);
    const rate = commodity?.ratePerMtPerDay || 10;

    txnGroups.get(key)?.txns.push({
      date: txn.date instanceof Date ? txn.date.toISOString().split('T')[0] : 
            typeof txn.date === 'string' && txn.date.includes('T') ? txn.date.split('T')[0] : 
            txn.date,
      type: txn.direction === 'INWARD' ? 'INWARD' : 'OUTWARD',
      qty: txn.quantityMT || 0,
      clientId: txn.clientId,
      commodityId: txn.commodityId,
      warehouseId: txn.warehouseId
    });

    warehouseIds.add(txn.warehouseId);
  });

  console.log(`CLIENT ${clientId}: Created ${txnGroups.size} transaction groups`);
  txnGroups.forEach((group, key) => {
    console.log(`GROUP ${key}: ${group.txns.length} transactions`, group.txns);
  });

  // Resolve warehouse names for each transaction group
  const warehouseDocs = warehouseIds.size
    ? await db.collection('warehouses').find({
        _id: { $in: Array.from(warehouseIds).map((id) => new ObjectId(id)) },
        ...(tenantFilter || {}),
      }).toArray()
    : [];
  const warehouseMap = new Map(warehouseDocs.map((warehouse) => [warehouse._id?.toString() || '', warehouse]));

  // Generate periods for each group
  const allPeriods: ClientMonthlyLedgerRow[] = [];
  txnGroups.forEach((group, key) => {
    const [commodityId, warehouseId] = key.split('-');
    const commodity = commodityMap.get(commodityId);
    const warehouse = warehouseMap.get(warehouseId);
    const rate = commodity?.ratePerMtPerDay || 10;
    const monthlyRate = roundCurrency(rate * 30);

    console.log(`CLIENT ${clientId}: Generating periods for group ${key} with ${group.txns.length} transactions, rate: ${rate}`);

    const periods = generateStoragePeriods(group.txns, month, rate);

    console.log(`CLIENT ${clientId}: Generated ${periods.length} periods for group ${key}:`, periods);

    periods.forEach(period => {
      const dailyRate = rate;
      const calculation = `${roundCurrency(period.qty).toFixed(2)} MT × ₹${dailyRate.toFixed(2)}/MT/day × ${period.days} days`;
      
      allPeriods.push({
        commodity: commodity?.name || 'Unknown Commodity',
        rate: monthlyRate,
        fromDate: period.fromDate,
        toDate: period.toDate,
        qty: period.qty,
        days: period.days,
        rent: roundCurrency(period.rent),
        status: period.status,
        calculation,
        warehouseId,
        warehouseName: warehouse?.name || '',
      });
    });
  });

  console.log(`CLIENT ${clientId}: Total periods generated: ${allPeriods.length}`);

  console.log("ALL PERIODS GENERATED:", allPeriods);

  // Group by month + warehouse to keep one invoice per warehouse per client per month
  const grouped = new Map<string, { month: string; warehouseId?: string; warehouseName?: string; rows: ClientMonthlyLedgerRow[] }>();
  allPeriods.forEach(row => {
    const monthKey = formatMonthKey(normalizeDate(row.fromDate));
    const warehouseKey = row.warehouseId || 'ALL';
    const groupKey = `${monthKey}::${warehouseKey}`;
    console.log(`Grouping period ${row.fromDate} -> ${groupKey}`);

    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        month: monthKey,
        warehouseId: row.warehouseId,
        warehouseName: row.warehouseName,
        rows: [],
      });
    }

    grouped.get(groupKey)?.rows.push(row);
  });

  console.log(`CLIENT ${clientId}: Grouped into ${grouped.size} month-warehouse invoices:`, Array.from(grouped.keys()));

  const paymentsResult = await getClientPayments(clientId);
  const payments = paymentsResult.success ? paymentsResult.data : [];

  const paymentsByMonth = (payments || []).reduce((acc: Record<string, number>, payment: any) => {
    const paymentDate = payment.paymentDate || payment.date;
    if (!paymentDate) return acc;
    const monthKey = formatMonthKey(normalizeDate(paymentDate));
    acc[monthKey] = (acc[monthKey] || 0) + Number(payment.amount || 0);
    return acc;
  }, {});

  const paymentsByInvoice = (payments || []).reduce((acc: Record<string, number>, payment: any) => {
    if (!payment?.invoiceId) return acc;
    const invoiceKey = typeof payment.invoiceId === 'string'
      ? payment.invoiceId
      : typeof payment.invoiceId?.toString === 'function'
        ? payment.invoiceId.toString()
        : String(payment.invoiceId);
    acc[invoiceKey] = (acc[invoiceKey] || 0) + Number(payment.amount || 0);
    return acc;
  }, {});

  const allMonthKeys = new Set<string>([
    ...Array.from(grouped.keys()).map((groupKey) => grouped.get(groupKey)?.month || ''),
    ...Object.keys(paymentsByMonth),
  ]);

  const sortedMonthKeys = Array.from(allMonthKeys).filter(key => key).sort();
  const monthlyLedgers: ClientMonthLedger[] = [];
  let runningBalance = 0;

  // preserve each warehouse-specific invoice separately, but keep month ordering for balances
  Array.from(grouped.entries())
    .sort(([aKey, a], [bKey, b]) => {
      if (a.month !== b.month) return a.month.localeCompare(b.month);
      return (a.warehouseName || '').localeCompare(b.warehouseName || '');
    })
    .forEach(([groupKey, group]) => {
      const invoiceId = group.warehouseId ? `${clientId}-${group.month}-${group.warehouseId}` : `${clientId}-${group.month}`;
      const totalRent = roundCurrency(group.rows.reduce((sum, row) => sum + row.rent, 0));
      const invoiceSpecificPayments = roundCurrency(paymentsByInvoice[invoiceId] || 0);
      const paymentsForMonth = invoiceSpecificPayments || roundCurrency(paymentsByMonth[group.month] || 0);
      const previousBalance = roundCurrency(runningBalance);
      const outstanding = roundCurrency(previousBalance + totalRent - paymentsForMonth);

      monthlyLedgers.push({
        month: group.month,
        warehouseId: group.warehouseId,
        warehouseName: group.warehouseName,
        invoiceId,
        rows: group.rows,
        summary: {
          totalRent,
          previousBalance,
          payments: paymentsForMonth,
          outstanding,
        },
      });

      runningBalance = outstanding;
    });

  const availableMonths = Array.from(new Set(monthlyLedgers.map(m => m.month)));
  const filteredMonths = month ? monthlyLedgers.filter(m => m.month === month) : monthlyLedgers;
  const outstanding = filteredMonths.length > 0 ? filteredMonths[filteredMonths.length - 1].summary.outstanding : 0;

  console.log("FINAL LEDGER DATA:", {
    clientId,
    clientName,
    months: filteredMonths,
    availableMonths,
    outstanding,
  });

  return {
    success: true,
    data: {
      clientId,
      clientName,
      months: filteredMonths,
      availableMonths,
      outstanding,
    } as ClientMonthlyLedgerResult,
  };
}
