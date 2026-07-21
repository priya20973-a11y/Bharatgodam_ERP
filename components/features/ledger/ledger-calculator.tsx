'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { LedgerSummary, LedgerStep } from '@/lib/ledger-engine';
import { LedgerTable } from './ledger-table';
import { InvoiceSummary } from './invoice-summary';
import { CommodityTransactionTimeline } from './transaction-timeline';
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

interface WarehouseLedgerBreakdown {
  warehouseId: string;
  warehouseName: string;
  ledgerSummary: LedgerSummary;
}

interface AggregatedLedgerData extends LedgerSummary {
  matchedRecords?: any[];
  recordCount?: number;
  isAggregated?: boolean;
  transactions?: any[];
  warehouseBreakdowns?: WarehouseLedgerBreakdown[];
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

  const [ledgerData, setLedgerData] = useState<AggregatedLedgerData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [lineItems, setLineItems] = useState<any[]>([]);

  const warehouseBreakdowns = ledgerData?.warehouseBreakdowns ?? [];
  const showWarehouseBreakdowns = warehouseBreakdowns.length > 0;

  const formatDecimal = (value: number) =>
    value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const roundCurrency = (value: number) => Math.round(value * 100) / 100;

  const adjustmentInvoices = useMemo(
    () => ledgerData?.invoiceSummaries?.filter((invoice) => invoice.additionalCharges > 0) ?? [],
    [ledgerData?.invoiceSummaries]
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

    // Optionally filter ledger steps by selected month
    const stepsToExport = ledgerData.ledgerSteps;

    lines.push('Step No,Start Date,End Date,Days,Quantity (MT),Rate (₹/day/MT),Rent Amount (₹),Rent Days,Transaction Id,Transaction GatePass');
    stepsToExport.forEach((step) => {
      const txId = step.transaction?.id || '';
      const gatePass = step.transaction?.gatePass || '';
      lines.push(
        `${step.stepNo},${step.startDate},${step.endDate},${step.daysDifference},${formatDecimal(
          step.quantityMT
        )},${formatDecimal(step.ratePerDayPerMT)},${formatDecimal(step.rentAmount)},${step.daysDifference || ''},${txId},${gatePass}`
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
    if (showInvoiceAdjustments && adjustmentInvoices.length > 0) {
      lines.push(`Total Additional Charges,${formatDecimal(totalAdditionalCharges)}`);
    }
    lines.push(`Outstanding Balance,${formatDecimal(displayTotalBalance)}`);

    if (showInvoiceAdjustments && adjustmentInvoices.length > 0) {
      lines.push('');
      lines.push('INVOICE ADJUSTMENTS');
      lines.push('Invoice Id,Invoice Month,Status,Invoice Amount,Additional Charges,Total Invoice Amount');
      adjustmentInvoices.forEach((invoice) => {
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
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const datePart = new Date().toISOString().split('T')[0];
    a.download = `ledger-${clientId}-${datePart}.csv`;
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

      {ledgerData && showWarehouseBreakdowns && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-900">Warehouse Breakdown</h2>
            <p className="text-sm text-slate-600 mt-1">
              {warehouseBreakdowns.length === 1
                ? 'This client has ledger data for one warehouse. The warehouse details are shown below.'
                : 'This client has transactions in multiple warehouses. Each warehouse ledger is shown separately.'}
            </p>
          </div>
          <div className="space-y-6 p-6">
            {warehouseBreakdowns.map((warehouse) => (
              <div key={warehouse.warehouseId} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{warehouse.warehouseName}</div>
                    <div className="text-xs text-slate-500">Warehouse ID: {warehouse.warehouseId}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-500">Total Rent</div>
                    <div className="text-xl font-bold text-emerald-700">₹{formatDecimal(warehouse.ledgerSummary.totalRent)}</div>
                  </div>
                </div>
                <LedgerTable
                  steps={warehouse.ledgerSummary.ledgerSteps}
                  isLoading={isLoading}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {showInvoiceAdjustments && adjustmentInvoices.length > 0 ? (
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
      ) : null}

      {showInvoiceAdjustments && adjustmentInvoices.length > 0 ? (
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
                {adjustmentInvoices.map((invoice) => (
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

      {ledgerData && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <p className="text-sm text-slate-600">Ledger data is now presented cumulatively with historical balances retained.</p>
        </div>
      )}

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Transactions */}
        <div className="lg:col-span-1">
          {ledgerData && (
            <>
              <div className="mb-4 text-sm text-slate-600">Transactions</div>

              <CommodityTransactionTimeline
                transactions={
                  transactions.length > 0
                    ? transactions
                    : ledgerData.ledgerSteps
                        .filter((step) => step.transaction)
                        .map((step) => ({
                          _id: step.transaction?.id || '',
                          date: step.startDate,
                          direction: step.transaction?.direction || 'INWARD',
                          mt: step.quantityMT,
                          clientName: ledgerData.clientName,
                          commodityName: step.commodity || 'Various',
                          gatePass: step.transaction?.gatePass || '',
                          rentAmount: step.rentAmount,
                          rentDays: step.daysDifference,
                        }))
                }
                isLoading={isLoading}
              />

              <div className="mt-6 bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
                  <h3 className="text-md font-semibold text-slate-900">Invoice / Booking Items</h3>
                  <p className="text-sm text-slate-600 mt-1">All invoice and booking line items for this client.</p>
                </div>
                <div className="p-4">
                  {lineItems.length === 0 ? (
                    <div className="py-8 text-center text-slate-500">No invoice or booking items available.</div>
                  ) : (
                    <div className="space-y-4">
                      {lineItems.map((item) => (
                        <div key={item.id || `${item.type}-${item.date}-${item.amount}`} className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div>
                              <div className="text-sm font-semibold text-slate-900">{item.description || item.type || 'Item'}</div>
                              <div className="text-xs text-slate-500 mt-1">{item.date ? new Date(item.date).toLocaleDateString() : 'No date'}</div>
                            </div>
                            <div className="text-right text-sm text-slate-700">
                              <div className="font-semibold">₹{formatDecimal(Number(item.amount || 0))}</div>
                              <div className="text-xs text-slate-500">{item.type || 'invoice/booking'}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Right Column: Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {ledgerData && (
            <LedgerTable
              steps={ledgerData.ledgerSteps}
              isLoading={isLoading}
            />
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
