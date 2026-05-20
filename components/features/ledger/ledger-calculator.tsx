'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { LedgerSummary, LedgerStep } from '@/lib/ledger-engine';
import { LedgerTable } from './ledger-table';
import { InvoiceSummary } from './invoice-summary';
import { TransactionTimeline, CommodityTransactionTimeline } from './transaction-timeline';
import { PaymentHistory } from './payment-history';
import { MatchedRecordsHeader } from './matched-records-header';
import { Download, RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface InvoiceAdjustmentItem {
  id?: string;
  name: string;
  amount: number;
  note?: string;
}

interface InvoiceAdjustmentSummary {
  invoiceId: string;
  invoiceMonth?: string;
  invoiceDate?: string;
  dueDate?: string;
  status?: string;
  totalAmount: number;
  additionalCharges: number;
  totalInvoiceAmount: number;
  additionalChargeItems: InvoiceAdjustmentItem[];
}

interface AggregatedLedgerData extends LedgerSummary {
  matchedRecords?: any[];
  recordCount?: number;
  isAggregated?: boolean;
  transactions?: any[];
}

interface LedgerCalculatorProps {
  clientId: string;
  clientName?: string;
  showInvoiceAdjustments?: boolean;
}

export const LedgerCalculator: React.FC<LedgerCalculatorProps> = ({
  clientId,
  clientName = clientId,
  showInvoiceAdjustments = false,
}) => {
  // Prevent rendering if clientId is empty
  if (!clientId || !clientId.trim()) {
    return null;
  }

  type LedgerViewMode = 'detail' | 'month' | 'inventory';

  interface MonthChargeSummary {
    monthKey: string;
    monthLabel: string;
    totalDays: number;
    totalQuantityDays: number;
    totalRent: number;
    endingBalances: { [commodity: string]: number };
  }

  interface MonthInventoryRecord {
    monthKey: string;
    monthLabel: string;
    startingBalances: { [commodity: string]: number };
    inwardMovements: { [commodity: string]: number };
    outwardMovements: { [commodity: string]: number };
    endingBalances: { [commodity: string]: number };
  }

  const [ledgerData, setLedgerData] = useState<AggregatedLedgerData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [lineItems, setLineItems] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<LedgerViewMode>('detail');

  const formatDecimal = (value: number) =>
    value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const roundCurrency = (value: number) => Math.round(value * 100) / 100;

  const getMonthWiseCharges = (steps: LedgerStep[]): MonthChargeSummary[] => {
    const monthMap = new Map<string, MonthChargeSummary>();
    const msPerDay = 24 * 60 * 60 * 1000;

    const daysBetween = (start: Date, end: Date) =>
      Math.ceil((end.getTime() - start.getTime()) / msPerDay);

    steps.forEach((step) => {
      const stepStart = new Date(step.startDate);
      const stepEnd = new Date(step.endDate);
      let cursor = new Date(stepStart);
      cursor.setHours(0, 0, 0, 0);
      const normalizedEnd = new Date(stepEnd);
      normalizedEnd.setHours(0, 0, 0, 0);

      while (cursor < normalizedEnd) {
        const nextMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
        const bucketEnd = nextMonth < normalizedEnd ? nextMonth : normalizedEnd;
        const bucketDays = daysBetween(cursor, bucketEnd);
        const quantityDays = step.quantityMT * bucketDays;
        const rent = roundCurrency(step.quantityMT * step.ratePerDayPerMT * bucketDays);
        const monthKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
        const monthLabel = cursor.toLocaleString('default', {
          month: 'short',
          year: 'numeric',
        });

        if (monthMap.has(monthKey)) {
          const existing = monthMap.get(monthKey)!;
          existing.totalDays += bucketDays;
          existing.totalQuantityDays += quantityDays;
          existing.totalRent = roundCurrency(existing.totalRent + rent);
          existing.endingBalances = step.inventoryBalances;
        } else {
          monthMap.set(monthKey, {
            monthKey,
            monthLabel,
            totalDays: bucketDays,
            totalQuantityDays: quantityDays,
            totalRent: rent,
            endingBalances: step.inventoryBalances,
          });
        }

        cursor = bucketEnd;
      }
    });

    return Array.from(monthMap.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  };

  const getMonthWiseInventoryRecords = (steps: LedgerStep[], transactions: any[]): MonthInventoryRecord[] => {
    const monthMap = new Map<string, MonthInventoryRecord>();
    const normalizeCommodityName = (name: string) => name?.trim().toUpperCase();

    // Get all transactions with full data
    const allTransactions = transactions
      .filter(tx => tx)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Track running inventory balances
    const runningBalances: { [commodity: string]: number } = {};

    // Process transactions chronologically
    allTransactions.forEach(tx => {
      const txDate = new Date(tx.date);
      const monthKey = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = txDate.toLocaleString('default', {
        month: 'short',
        year: 'numeric',
      });

      if (!monthMap.has(monthKey)) {
        // Initialize month record with current running balances as starting balances
        monthMap.set(monthKey, {
          monthKey,
          monthLabel,
          startingBalances: { ...runningBalances },
          inwardMovements: {},
          outwardMovements: {},
          endingBalances: { ...runningBalances },
        });
      }

      const record = monthMap.get(monthKey)!;
      const commodity = normalizeCommodityName(tx.commodityName);

      // Update movements and ending balances
      if (tx.direction === 'INWARD') {
        record.inwardMovements[commodity] = (record.inwardMovements[commodity] || 0) + tx.mt;
        record.endingBalances[commodity] = (record.endingBalances[commodity] || 0) + tx.mt;
        runningBalances[commodity] = (runningBalances[commodity] || 0) + tx.mt;
      } else {
        record.outwardMovements[commodity] = (record.outwardMovements[commodity] || 0) + tx.mt;
        record.endingBalances[commodity] = Math.max(0, (record.endingBalances[commodity] || 0) - tx.mt);
        runningBalances[commodity] = Math.max(0, (runningBalances[commodity] || 0) - tx.mt);
      }
    });

    return Array.from(monthMap.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  };

  const monthWiseCharges = useMemo(
    () => (ledgerData ? getMonthWiseCharges(ledgerData.ledgerSteps) : []),
    [ledgerData]
  );

  const monthWiseInventoryRecords = useMemo(
    () => (ledgerData ? getMonthWiseInventoryRecords(ledgerData.ledgerSteps, transactions) : []),
    [ledgerData, transactions]
  );

  const currentBalances = useMemo(() => {
    if (!ledgerData || ledgerData.ledgerSteps.length === 0) return {};
    const lastStep = ledgerData.ledgerSteps[ledgerData.ledgerSteps.length - 1];
    return lastStep.inventoryBalances || {};
  }, [ledgerData]);

  const totalAdditionalCharges = useMemo(() => {
    if (!ledgerData?.invoiceSummaries?.length) return 0;
    return ledgerData.invoiceSummaries.reduce((sum, invoice) => sum + invoice.additionalCharges, 0);
  }, [ledgerData]);

  const summaryTotalPaid = useMemo(() => {
    if (!ledgerData) return 0;
    return showInvoiceAdjustments ? ledgerData.totalPaid : ledgerData.rentPaid ?? ledgerData.totalPaid;
  }, [ledgerData, showInvoiceAdjustments]);

  const summaryTotalBalance = useMemo(() => {
    if (!ledgerData) return 0;
    if (showInvoiceAdjustments) {
      return roundCurrency(ledgerData.totalRent + totalAdditionalCharges - (ledgerData.totalPaid ?? 0));
    }
    return ledgerData.rentPaid !== undefined
      ? Math.max(ledgerData.totalRent - ledgerData.rentPaid, 0)
      : ledgerData.balance;
  }, [ledgerData, showInvoiceAdjustments, totalAdditionalCharges]);

  const fetchLedger = async () => {
    const trimmedClientId = clientId.trim();
    if (!trimmedClientId) {
      setError('Client ID is required');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const encodedClientId = encodeURIComponent(trimmedClientId);
      
      // Fetch both ledger and line items in parallel
      const [ledgerResponse, lineItemsResponse] = await Promise.all([
        fetch(`/api/reports/ledger/${encodedClientId}`),
        fetch(`/api/reports/ledger/line-items?clientId=${encodedClientId}`),
      ]);

      if (!ledgerResponse.ok) {
        const errorText = await ledgerResponse.text();
        throw new Error(
          `Failed to fetch ledger data (${ledgerResponse.status}): ${errorText || ledgerResponse.statusText}`
        );
      }

      const result = await ledgerResponse.json();
      if (result.success) {
        setLedgerData(result.data);
        setTransactions(result.data.transactions || []);
      } else {
        throw new Error(result.message || 'Unknown error');
      }

      // Load line items if available
      if (lineItemsResponse.ok) {
        const lineItemsResult = await lineItemsResponse.json();
        if (lineItemsResult.success && lineItemsResult.data) {
          setLineItems(lineItemsResult.data);
        }
      }
    } catch (err: any) {
      console.error('Error fetching ledger:', err);
      setError(err.message || 'Failed to load ledger');
      toast.error('Failed to load ledger data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLedger();
  }, [clientId]);

  const handleExportCSV = () => {
    if (!ledgerData) {
      toast.error('No data to export');
      return;
    }

    // Generate CSV
    const lines: string[] = [];
    lines.push(`Client Name,${ledgerData.clientName}`);
    lines.push(`Calculation Date,${ledgerData.calculationDate}`);
    if (ledgerData.isAggregated && ledgerData.matchedRecords) {
      lines.push(`Aggregated Records,${ledgerData.recordCount || 1}`);
      ledgerData.matchedRecords.forEach((record) => {
        lines.push(`  - ${record.clientName} (${record.date})`);
      });
    }
    lines.push('');
    lines.push('LEDGER STEPS');
    lines.push(
      'Step No,Start Date,End Date,Days,Quantity (MT),Rate (₹/day/MT),Rent Amount (₹)'
    );

    ledgerData.ledgerSteps.forEach((step) => {
      lines.push(
        `${step.stepNo},${step.startDate},${step.endDate},${step.daysDifference},${formatDecimal(
          step.quantityMT
        )},${formatDecimal(step.ratePerDayPerMT)},${formatDecimal(step.rentAmount)}`
      );
    });

    lines.push('');
    const displayTotalPaid = showInvoiceAdjustments ? ledgerData.totalPaid : ledgerData.rentPaid ?? ledgerData.totalPaid;
    const displayTotalBalance = showInvoiceAdjustments
      ? roundCurrency(ledgerData.totalRent + (ledgerData.invoiceSummaries?.reduce((sum, invoice) => sum + invoice.additionalCharges, 0) || 0) - (ledgerData.totalPaid ?? 0))
      : ledgerData.rentPaid !== undefined
        ? Math.max(ledgerData.totalRent - ledgerData.rentPaid, 0)
        : ledgerData.balance;
    lines.push('SUMMARY');
    lines.push(`Total Rent,${formatDecimal(ledgerData.totalRent)}`);
    lines.push(`Total Paid,${formatDecimal(displayTotalPaid)}`);
    if (showInvoiceAdjustments && ledgerData.invoiceSummaries?.length) {
      lines.push(`Total Additional Charges,${formatDecimal(totalAdditionalCharges)}`);
    }
    lines.push(`Outstanding Balance,${formatDecimal(displayTotalBalance)}`);

    if (showInvoiceAdjustments && ledgerData.invoiceSummaries?.length) {
      lines.push('');
      lines.push('INVOICE ADJUSTMENTS');
      lines.push('Invoice Id,Invoice Month,Status,Invoice Amount,Additional Charges,Total Invoice Amount');
      ledgerData.invoiceSummaries.forEach((invoice) => {
        lines.push(
          `${invoice.invoiceId},${invoice.invoiceMonth || ''},${invoice.status || ''},${formatDecimal(
            invoice.totalAmount
          )},${formatDecimal(invoice.additionalCharges)},${formatDecimal(invoice.totalInvoiceAmount)}`
        );
      });
      if (ledgerData.invoiceOutstandingTotal !== undefined) {
        lines.push(`Total Invoice Outstanding,${formatDecimal(ledgerData.invoiceOutstandingTotal)}`);
      }
    }

    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ledger-${clientId}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Ledger exported successfully');
  };

  if (error && !ledgerData) {
    return (
      <div className="bg-white rounded-lg border border-red-200 p-8 text-center">
        <div className="inline-block h-12 w-12 rounded-lg bg-red-100 flex items-center justify-center mb-4">
          <span className="text-2xl">⚠️</span>
        </div>
        <p className="text-red-700 font-semibold mb-2">{error}</p>
        <button
          onClick={fetchLedger}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-900">Ledger Report</h1>
          <p className="text-slate-600 mt-1">
            {clientName} - {ledgerData?.calculationDate || 'Loading...'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchLedger}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={handleExportCSV}
            disabled={isLoading || !ledgerData}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Matched Records Header (if aggregated) */}
      {ledgerData && ledgerData.isAggregated && ledgerData.matchedRecords && (
        <MatchedRecordsHeader
          matchedRecords={ledgerData.matchedRecords}
          isAggregated={ledgerData.isAggregated}
        />
      )}

      {/* Invoice Summary */}
      {ledgerData && (
        <InvoiceSummary
          totalRent={ledgerData.totalRent}
          totalPaid={summaryTotalPaid}
          totalBalance={summaryTotalBalance}
          additionalCharges={totalAdditionalCharges}
          showInvoiceAdjustments={showInvoiceAdjustments}
          isLoading={isLoading}
        />
      )}

      {showInvoiceAdjustments && ledgerData?.invoiceSummaries?.length ? (
        (() => {
          const adjustmentInvoices = ledgerData.invoiceSummaries.filter((invoice) => invoice.additionalCharges > 0);
          if (adjustmentInvoices.length === 0) return null;

          return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                <h2 className="text-sm font-semibold text-slate-700">Internal Invoice Charges</h2>
                <p className="text-xs text-slate-500 mt-1">Total additional invoice charges reflected only in the internal ledger report.</p>
                <div className="mt-4 text-3xl font-bold text-emerald-700">₹{formatDecimal(
                  adjustmentInvoices.reduce((sum, invoice) => sum + invoice.additionalCharges, 0)
                )}</div>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                <h2 className="text-sm font-semibold text-slate-700">Invoices with Additional Charges</h2>
                <p className="text-xs text-slate-500 mt-1">Each invoice shown here has an actual additional charge entry.</p>
                <div className="mt-4 text-sm text-slate-700">
                  {adjustmentInvoices.slice(0, 3).map((invoice) => (
                    <div key={invoice.invoiceId} className="mb-3 border-b border-slate-100 pb-3 last:border-b-0">
                      <div className="font-semibold text-slate-900">{invoice.invoiceId}</div>
                      <div className="text-slate-600">₹{formatDecimal(invoice.additionalCharges)} additional</div>
                    </div>
                  ))}
                  {adjustmentInvoices.length > 3 && (
                    <div className="text-xs text-slate-500">And {adjustmentInvoices.length - 3} more invoice(s)...</div>
                  )}
                </div>
              </div>
            </div>
          );
        })()
      ) : null}

      {showInvoiceAdjustments && ledgerData?.invoiceSummaries?.length ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-900">Invoice Adjustment Summary</h2>
            <p className="text-sm text-slate-600 mt-1">
              Invoice-wise additional charge details and outstanding totals for this client's internal ledger.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Invoice</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Month</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Status</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-700">Rent Amount</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-700">Additional Charges</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-700">Total Invoice Amount</th>
                </tr>
              </thead>
              <tbody>
                {ledgerData.invoiceSummaries.map((invoice) => (
                  <tr key={invoice.invoiceId} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-900 font-medium">{invoice.invoiceId}</td>
                    <td className="px-4 py-3 text-slate-700">{invoice.invoiceMonth || 'N/A'}</td>
                    <td className="px-4 py-3 text-slate-700">{invoice.status || 'Unknown'}</td>
                    <td className="px-4 py-3 text-right text-slate-900">₹{formatDecimal(invoice.totalAmount)}</td>
                    <td className="px-4 py-3 text-right text-amber-700">₹{formatDecimal(invoice.additionalCharges)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-700">₹{formatDecimal(invoice.totalInvoiceAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* View Mode Toggle */}
      {ledgerData && (
        <div className="flex flex-wrap items-center justify-between gap-4 bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <p className="text-sm text-slate-600">Choose how you want to view the ledger data.</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setViewMode('detail')}
              className={`px-4 py-2 rounded-lg font-semibold transition ${
                viewMode === 'detail'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Detailed Ledger
            </button>
            <button
              type="button"
              onClick={() => setViewMode('month')}
              className={`px-4 py-2 rounded-lg font-semibold transition ${
                viewMode === 'month'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Month-wise Charges
            </button>
            <button
              type="button"
              onClick={() => setViewMode('inventory')}
              className={`px-4 py-2 rounded-lg font-semibold transition ${
                viewMode === 'inventory'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Month-wise Inventory
            </button>
          </div>
        </div>
      )}

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Transactions */}
        <div className="lg:col-span-1">
          {ledgerData && (
            <CommodityTransactionTimeline
              transactions={ledgerData.transactions || ledgerData.ledgerSteps
                .filter((step) => step.transaction)
                .map((step) => ({
                  _id: step.transaction?.id || '',
                  date: step.startDate,
                  direction: step.transaction?.direction || 'INWARD',
                  mt: step.quantityMT,
                  clientName: ledgerData.clientName,
                  commodityName: step.commodity || 'Various',
                  gatePass: step.transaction?.gatePass || '',
                }))}
              isLoading={isLoading}
            />
          )}
        </div>

        {/* Right Column: Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {ledgerData && viewMode === 'detail' && (
            <LedgerTable
              steps={ledgerData.ledgerSteps}
              isLoading={isLoading}
            />
          )}

          {ledgerData && viewMode === 'month' && (
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
              <div className="border-b border-slate-200 bg-slate-50 px-6 py-4">
                <h2 className="text-lg font-semibold text-slate-900">Month-wise Charges</h2>
                <p className="text-sm text-slate-600 mt-1">
                  Aggregated rent charges by calendar month for the selected client.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Month</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-700">Days</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-700">Quantity Days</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-700">Avg Qty (MT)</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-700">Rent (₹)</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Ending Inventory (MT)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthWiseCharges.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                          No month-wise charges available.
                        </td>
                      </tr>
                    ) : (
                      monthWiseCharges.map((month) => (
                        <tr key={month.monthKey} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 text-slate-900">{month.monthLabel}</td>
                          <td className="px-4 py-3 text-right text-slate-700">{month.totalDays}</td>
                          <td className="px-4 py-3 text-right text-slate-700">{formatDecimal(month.totalQuantityDays)}</td>
                          <td className="px-4 py-3 text-right text-slate-900">
                            {month.totalDays > 0 ? formatDecimal(month.totalQuantityDays / month.totalDays) : '0.00'}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-emerald-700">₹{formatDecimal(month.totalRent)}</td>
                          <td className="px-4 py-3 text-slate-700">
                            {Object.entries(month.endingBalances).length === 0
                              ? 'No inventory'
                              : Object.entries(month.endingBalances)
                                  .map(([commodity, qty]) => `${commodity}: ${formatDecimal(qty)}`)
                                  .join(', ')}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Current Inventory Balances */}
              {Object.keys(currentBalances).length > 0 && (
                <div className="mt-6 bg-slate-50 rounded-lg border border-slate-200 p-4">
                  <h3 className="text-lg font-semibold text-slate-900 mb-3">Current Inventory Balances</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Object.entries(currentBalances).map(([commodity, qty]) => (
                      <div key={commodity} className="bg-white rounded-lg border border-slate-200 p-3">
                        <div className="text-sm text-slate-600">{commodity}</div>
                        <div className="text-lg font-semibold text-slate-900">{formatDecimal(qty)} MT</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {ledgerData && viewMode === 'inventory' && (
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
              <div className="border-b border-slate-200 bg-slate-50 px-6 py-4">
                <h2 className="text-lg font-semibold text-slate-900">Month-wise Inventory Records</h2>
                <p className="text-sm text-slate-600 mt-1">
                  Inventory movements and balances by calendar month for the selected client.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Month</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Starting Balance (MT)</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Inward (MT)</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Outward (MT)</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Ending Balance (MT)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthWiseInventoryRecords.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                          No inventory records available.
                        </td>
                      </tr>
                    ) : (
                      monthWiseInventoryRecords.map((record) => (
                        <tr key={record.monthKey} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 text-slate-900 font-medium">{record.monthLabel}</td>
                          <td className="px-4 py-3 text-slate-700">
                            {Object.entries(record.startingBalances).length === 0
                              ? 'No inventory'
                              : Object.entries(record.startingBalances)
                                  .map(([commodity, qty]) => `${commodity}: ${formatDecimal(qty)}`)
                                  .join(', ')}
                          </td>
                          <td className="px-4 py-3 text-green-700">
                            {Object.entries(record.inwardMovements).length === 0
                              ? 'None'
                              : Object.entries(record.inwardMovements)
                                  .map(([commodity, qty]) => `${commodity}: ${formatDecimal(qty)}`)
                                  .join(', ')}
                          </td>
                          <td className="px-4 py-3 text-red-700">
                            {Object.entries(record.outwardMovements).length === 0
                              ? 'None'
                              : Object.entries(record.outwardMovements)
                                  .map(([commodity, qty]) => `${commodity}: ${formatDecimal(qty)}`)
                                  .join(', ')}
                          </td>
                          <td className="px-4 py-3 text-slate-900 font-medium">
                            {Object.entries(record.endingBalances).length === 0
                              ? 'No inventory'
                              : Object.entries(record.endingBalances)
                                  .map(([commodity, qty]) => `${commodity}: ${formatDecimal(qty)}`)
                                  .join(', ')}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Payment History */}
          {ledgerData && (
            <PaymentHistory
              payments={ledgerData.paymentHistory}
              clientName={ledgerData.clientName}
              accountId={clientId}
              isLoading={isLoading}
              onPaymentAdded={fetchLedger}
              lineItems={lineItems}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default LedgerCalculator;
