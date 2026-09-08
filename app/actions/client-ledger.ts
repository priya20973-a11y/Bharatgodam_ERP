'use server';

import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { getClientPayments } from '@/app/actions/reports';
import { differenceInCalendarDays, isLastDayOfMonth } from 'date-fns';
import type { IInvoiceMaster, IInvoiceLineItem } from '@/types/schemas';
import { generateStoragePeriods, type Transaction } from '@/lib/storage-engine';
import { getTenantFilterForMongo, requireSession } from '@/lib/ownership';
import { logActivity } from '@/lib/cold-logger';

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
  additionalCharges?: number;
  outstanding: number;
  billingState?: string;
  taxGroup?: string;
  taxType?: string;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  totalTaxAmount?: number;
  adjustmentAmount?: number;
}

export interface ClientMonthLedger {
  month: string;
  rows: ClientMonthlyLedgerRow[];
  summary: ClientMonthlyLedgerSummary;
  warehouseId?: string;
  warehouseName?: string;
  invoiceId?: string;
}

type MonthGroupEntry = [
  string,
  {
    month: string;
    warehouseId?: string;
    warehouseName?: string;
    rows: ClientMonthlyLedgerRow[];
  }
];

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

  const str = dateValue.toString().trim();
  // Check if it's already YYYY-MM-DD
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  }

  // If not YYYY-MM-DD, try standard Date parsing
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
  }

  return new Date(`${str.slice(0, 10)}T00:00:00.000Z`);
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
  console.log(`=== GETTING CLIENT LEDGER FOR CLIENT: ${clientId}, MONTH: ${month || 'ALL'}, WAREHOUSE: ${warehouseId || 'ANY'} ===`);

  if (!tenantFilter) {
    try {
      const session = await requireSession();
      tenantFilter = getTenantFilterForMongo(session);
    } catch (error) {
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

  const clientIdFilters: Array<string | ObjectId> = [clientId];
  if (ObjectId.isValid(clientId)) {
    clientIdFilters.push(new ObjectId(clientId));
  }

  const transactionQuery: any = {
    clientId: { $in: clientIdFilters },
    ...(tenantFilter || {}),
  };

  let warehouseIdsArray: string[] = [];
  if (warehouseId && warehouseId !== 'ALL') {
    warehouseIdsArray = warehouseId.split(',').map(id => id.trim()).filter(Boolean);
    const warehouseIdFilters: Array<string | ObjectId> = [];
    warehouseIdsArray.forEach((id) => {
      warehouseIdFilters.push(id);
      if (ObjectId.isValid(id)) {
        warehouseIdFilters.push(new ObjectId(id));
      }
    });

    if (warehouseIdFilters.length === 1) {
      transactionQuery.warehouseId = warehouseIdFilters[0];
    } else if (warehouseIdFilters.length > 1) {
      transactionQuery.warehouseId = { $in: warehouseIdFilters };
    }
  }

  const transactions = await db.collection('transactions').find(transactionQuery, { sort: { date: 1 } }).toArray();

  const monthKeysSet = new Set<string>();
  transactions.forEach(txn => {
    const d = txn.date || txn.inwardDate || txn.outwardDate;
    if (d) {
      let dObj: Date;
      if (d instanceof Date) dObj = d;
      else dObj = new Date(d);
      if (!Number.isNaN(dObj.getTime())) {
        monthKeysSet.add(`${dObj.getUTCFullYear()}-${String(dObj.getUTCMonth() + 1).padStart(2, '0')}`);
      }
    }
  });

  const monthKeysToProcess = month ? [month] : Array.from(monthKeysSet).sort();

  const { getTransactionsForInvoiceMonth, transformTransactionsToBillingRows } = await import('@/app/api/invoice/utils');

  const grouped = new Map<string, { month: string; warehouseId?: string; warehouseName?: string; rows: ClientMonthlyLedgerRow[] }>();

  for (const monthKey of monthKeysToProcess) {
    const monthTxns = await getTransactionsForInvoiceMonth(
      db,
      clientId,
      warehouseId === 'ALL' ? undefined : warehouseId,
      monthKey,
      tenantFilter
    );

    const billingRows = transformTransactionsToBillingRows(monthTxns, monthKey);

    billingRows.forEach((row: any) => {
      const warehouseKey = warehouseIdsArray.length > 1 ? warehouseId : (row.warehouseId || 'ALL');
      const groupKey = `${monthKey}::${warehouseKey}`;

      if (!grouped.has(groupKey)) {
        grouped.set(groupKey, {
          month: monthKey,
          warehouseId: warehouseIdsArray.length > 1 ? warehouseId : row.warehouseId,
          warehouseName: warehouseIdsArray.length > 1 ? 'Multiple Warehouses' : row.warehouseName,
          rows: [],
        });
      }

      const dailyRate = row.rate || 0;
      const monthlyRate = roundCurrency(dailyRate * 30);
      const roundedQty = roundCurrency(row.quantityMT || 0);
      const calculation = `${roundedQty.toFixed(2)} MT × ₹${dailyRate.toFixed(2)}/MT/day × ${row.daysTotal || 0} days`;

      grouped.get(groupKey)?.rows.push({
        commodity: row.commodityName || 'Unknown Commodity',
        rate: monthlyRate,
        fromDate: row.startDate,
        toDate: row.endDate,
        qty: roundedQty,
        days: row.daysTotal,
        rent: roundCurrency(row.rentTotal || 0),
        status: row.status,
        calculation,
        warehouseId: row.warehouseId,
        warehouseName: row.warehouseName,
      });
    });
  }

  const paymentsResult = await getClientPayments(clientId);
  const payments = paymentsResult.success ? paymentsResult.data : [];

  const paymentsByMonth = (payments || []).reduce((acc: Record<string, number>, payment: any) => {
    const paymentDate = payment.paymentDate || payment.date;
    if (!paymentDate) return acc;
    const monthKey = formatMonthKey(normalizeDate(paymentDate));
    acc[monthKey] = (acc[monthKey] || 0) + Number(payment.amount || 0);
    return acc;
  }, {});

  const allMonthKeys = new Set<string>([
    ...Array.from(grouped.keys()).map((groupKey) => grouped.get(groupKey)?.month || ''),
    ...Object.keys(paymentsByMonth),
  ]);

  const sortedMonthKeys = Array.from(allMonthKeys).filter(key => key).sort();
  const monthlyLedgers: ClientMonthLedger[] = [];
  let runningBalance = 0;

  const monthPaymentBalances: Record<string, number> = {};
  sortedMonthKeys.forEach((monthKey) => {
    monthPaymentBalances[monthKey] = roundCurrency(paymentsByMonth[monthKey] || 0);
  });

  const groupedEntries = Array.from(grouped.entries())
    .sort(([aKey, a], [bKey, b]) => {
      if (a.month !== b.month) return a.month.localeCompare(b.month);
      return (a.warehouseName || '').localeCompare(b.warehouseName || '');
    });

  const invoiceIds = Array.from(new Set(groupedEntries.map(([, group]) =>
    group.warehouseId ? `${clientId}-${group.month}-${group.warehouseId}` : `${clientId}-${group.month}`
  )));

  const invoiceMonths = Array.from(new Set(groupedEntries.map(([, group]) => group.month)));
  const invoiceMasterQuery: any = Object.keys(tenantFilter || {}).length
    ? { $and: [{ clientId: clientObjectId, invoiceMonth: { $in: invoiceMonths } }, tenantFilter] }
    : { clientId: clientObjectId, invoiceMonth: { $in: invoiceMonths } };

  const invoiceMasters = await db.collection('invoice_master')
    .find(invoiceMasterQuery)
    .toArray();

  const invoiceMasterById = new Map<string, any>();
  const invoiceMasterByInvoiceId = new Map<string, any>();
  const generatedKeyByMasterId = new Map<string, string>();
  const generatedKeyByInvoiceId = new Map<string, string>();

  invoiceMasters.forEach((invoice: any) => {
    const masterId = invoice._id?.toString?.();
    const invoiceId = invoice.invoiceId;
    const warehouseId = invoice.warehouseId?.toString?.();
    const generatedInvoiceId = invoice.clientId && invoice.invoiceMonth
      ? warehouseId
        ? `${invoice.clientId.toString()}-${invoice.invoiceMonth}-${warehouseId}`
        : `${invoice.clientId.toString()}-${invoice.invoiceMonth}`
      : null;

    if (masterId) {
      invoiceMasterById.set(masterId, invoice);
      if (generatedInvoiceId) generatedKeyByMasterId.set(masterId, generatedInvoiceId);
    }
    if (invoiceId) {
      invoiceMasterByInvoiceId.set(invoiceId, invoice);
      if (generatedInvoiceId) generatedKeyByInvoiceId.set(invoiceId, generatedInvoiceId);
    }
  });

  const paymentsByInvoice = (payments || []).reduce((acc: Record<string, number>, payment: any) => {
    if (!payment?.invoiceId) return acc;
    const invoiceKey = typeof payment.invoiceId === 'string'
      ? payment.invoiceId
      : typeof payment.invoiceId?.toString === 'function'
        ? payment.invoiceId.toString()
        : String(payment.invoiceId);

    const amount = Number(payment.amount || 0);
    acc[invoiceKey] = roundCurrency((acc[invoiceKey] || 0) + amount);

    if (invoiceMasterByInvoiceId.has(invoiceKey)) {
      const generatedInvoiceId = generatedKeyByInvoiceId.get(invoiceKey);
      if (generatedInvoiceId) {
        acc[generatedInvoiceId] = roundCurrency((acc[generatedInvoiceId] || 0) + amount);
      }
    }

    if (generatedKeyByMasterId.has(invoiceKey)) {
      const generatedInvoiceId = generatedKeyByMasterId.get(invoiceKey);
      if (generatedInvoiceId) {
        acc[generatedInvoiceId] = roundCurrency((acc[generatedInvoiceId] || 0) + amount);
      }
    }

    return acc;
  }, {});

  const adjustmentQuery: any = { ...tenantFilter, $or: [] };
  if (invoiceIds.length > 0) adjustmentQuery.$or.push({ invoiceId: { $in: invoiceIds } });
  if (invoiceMasters.length > 0) adjustmentQuery.$or.push({ masterId: { $in: invoiceMasters.map((inv) => inv._id?.toString()).filter(Boolean) } });
  if (adjustmentQuery.$or.length === 0) delete adjustmentQuery.$or;

  const invoiceAdjustments = await db.collection('invoice_adjustments')
    .find(adjustmentQuery)
    .toArray();

  const adjustmentAmountsByInvoice = invoiceAdjustments.reduce((acc: Record<string, number>, adjustment: any) => {
    const amount = Number((adjustment.amount ?? adjustment.additionalCharges) || 0);
    const invoiceId = adjustment.invoiceId;
    const masterId = adjustment.masterId?.toString?.();

    if (invoiceId && invoiceIds.includes(invoiceId)) {
      acc[invoiceId] = roundCurrency((acc[invoiceId] || 0) + amount);
      return acc;
    }

    if (masterId && generatedKeyByMasterId.has(masterId)) {
      const targetId = generatedKeyByMasterId.get(masterId)!;
      acc[targetId] = roundCurrency((acc[targetId] || 0) + amount);
      return acc;
    }

    if (invoiceId && generatedKeyByInvoiceId.has(invoiceId)) {
      const targetId = generatedKeyByInvoiceId.get(invoiceId)!;
      acc[targetId] = roundCurrency((acc[targetId] || 0) + amount);
      return acc;
    }

    if (invoiceId) {
      acc[invoiceId] = roundCurrency((acc[invoiceId] || 0) + amount);
    }

    return acc;
  }, {} as Record<string, number>);

  const groupedByMonth = groupedEntries.reduce((map, [groupKey, group]) => {
    const month = group.month;
    if (!map.has(month)) {
      map.set(month, [] as MonthGroupEntry[]);
    }
    map.get(month)?.push([groupKey, group] as MonthGroupEntry);
    return map;
  }, new Map<string, MonthGroupEntry[]>());

  for (const monthKey of sortedMonthKeys) {
    const monthGroups = groupedByMonth.get(monthKey);
    if (!monthGroups || monthGroups.length === 0) continue;

    const previousBalance = roundCurrency(runningBalance);
    let totalPaymentsThisMonth = 0;
    let totalRentThisMonth = 0;
    let totalAdjustmentsThisMonth = 0;

    monthGroups.forEach(([, group]) => {
      const invoiceId = group.warehouseId ? `${clientId}-${group.month}-${group.warehouseId}` : `${clientId}-${group.month}`;
      const totalRent = roundCurrency(group.rows.reduce((sum, row) => sum + row.rent, 0));
      const invoiceAdditionalCharges = roundCurrency(adjustmentAmountsByInvoice[invoiceId] || 0);

      const matchingMaster = invoiceMasters.find((inv: any) => {
        const invWarehouseId = inv.warehouseId?.toString?.();
        const groupWarehouseId = group.warehouseId?.toString?.();
        return inv.clientId?.toString() === clientId &&
               inv.invoiceMonth === group.month &&
               invWarehouseId === groupWarehouseId;
      });

      const taxAmount = Number(matchingMaster?.totalTaxAmount || 0);
      const adjustmentAmount = Number(matchingMaster?.adjustmentAmount || 0);
      const totalInvoiceCharges = roundCurrency(totalRent + invoiceAdditionalCharges + taxAmount + adjustmentAmount);

      totalRentThisMonth = roundCurrency(totalRentThisMonth + totalRent);
      totalAdjustmentsThisMonth = roundCurrency(totalAdjustmentsThisMonth + invoiceAdditionalCharges + taxAmount + adjustmentAmount);

      const invoiceSpecificPayments = roundCurrency(paymentsByInvoice[invoiceId] || 0);
      let paymentsForMonth = 0;
      if (invoiceSpecificPayments !== 0) {
        paymentsForMonth = invoiceSpecificPayments;
      } else {
        const remainingMonthPayments = roundCurrency(monthPaymentBalances[monthKey] || 0);
        const maxPayable = roundCurrency(Math.max(0, previousBalance + totalInvoiceCharges));
        const allocated = Math.min(remainingMonthPayments, maxPayable);
        paymentsForMonth = allocated;
        monthPaymentBalances[monthKey] = roundCurrency(remainingMonthPayments - allocated);
      }

      const invoicePreviousBalance = previousBalance;
      totalPaymentsThisMonth = roundCurrency(totalPaymentsThisMonth + paymentsForMonth);

      const outstanding = roundCurrency(invoicePreviousBalance + totalInvoiceCharges - paymentsForMonth);

      monthlyLedgers.push({
        month: group.month,
        warehouseId: group.warehouseId,
        warehouseName: group.warehouseName,
        invoiceId,
        rows: group.rows,
        summary: {
          totalRent,
          previousBalance: invoicePreviousBalance,
          payments: paymentsForMonth,
          additionalCharges: invoiceAdditionalCharges,
          outstanding,
          billingState: matchingMaster?.billingState || '',
          taxGroup: matchingMaster?.taxGroup || 'No Tax',
          taxType: matchingMaster?.taxType || '',
          cgstAmount: Number(matchingMaster?.cgstAmount || 0),
          sgstAmount: Number(matchingMaster?.sgstAmount || 0),
          igstAmount: Number(matchingMaster?.igstAmount || 0),
          totalTaxAmount: Number(matchingMaster?.totalTaxAmount || 0),
          adjustmentAmount: Number(matchingMaster?.adjustmentAmount || 0),
        },
      });
    });

    const monthTotalPayments = roundCurrency(totalPaymentsThisMonth);
    const monthOutstanding = roundCurrency(previousBalance + totalRentThisMonth + totalAdjustmentsThisMonth - monthTotalPayments);
    runningBalance = monthOutstanding;
  }

  const availableMonths = Array.from(new Set(monthlyLedgers.map(m => m.month)));
  const filteredMonths = month ? monthlyLedgers.filter(m => m.month === month) : monthlyLedgers;
  const outstanding = filteredMonths.length > 0 ? filteredMonths[filteredMonths.length - 1].summary.outstanding : 0;

  console.log('FINAL CLIENT LEDGER DATA:', {
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

export async function logClientLedgerExportAction() {
  const session = await requireSession();
  if (!session?.user) return;

  await logActivity({
    actionType: 'OTHER',
    module: 'Client ledger',
    description: 'Export CSV',
    storageType: 'Dry Storage',
    sessionFallback: session,
  });
}

