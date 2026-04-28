'use client';

import React, { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, FileText, Loader2, Calendar, Building2, Package, BookOpen } from 'lucide-react';
import { getClientOptions, getClientInvoicesByClientId, getFilteredBookings, getWarehouseOptions, getCommodityOptions, recordPayment } from '@/app/actions/reports';
import { getClientMonthlyLedger } from '@/app/actions/ledger';
import { toast } from 'react-hot-toast';

interface MonthlyInvoice {
  bookingId: string;
  clientName: string;
  month: string;
  year: number;
  periods: Array<{
    startDate: string;
    endDate: string;
    quantityMT: number;
    daysTotal: number;
    rentTotal: number;
    status: string;
    commodityName: string;
  }>;
  warehouseId?: string;
  warehouseName?: string;
  totalRent: number;
  previousBalance?: number;
  paymentsReceived?: number;
  outstandingBalance?: number;
  invoiceDate: string;
  invoiceId?: string;
}

export default function ClientInvoicesPage() {
  const [clients, setClients] = useState<{ label: string; value: string }[]>([]);
  const [warehouses, setWarehouses] = useState<{ label: string; value: string }[]>([]);
  const [commodities, setCommodities] = useState<{ label: string; value: string }[]>([]);
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [invoices, setInvoices] = useState<MonthlyInvoice[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [transactionLoading, setTransactionLoading] = useState(false);
  const [transactionError, setTransactionError] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);
  const [accountBalance, setAccountBalance] = useState<any>(null);
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [recordingPayment, setRecordingPayment] = useState(false);

  // Load clients and warehouses on mount
  useEffect(() => {
    const loadMasterData = async () => {
      try {
        const [clientData, warehouseData, commodityData] = await Promise.all([
          getClientOptions(),
          getWarehouseOptions(),
          getCommodityOptions()
        ]);
        setClients(clientData);
        setWarehouses(warehouseData);
        setCommodities(commodityData);
      } catch (error) {
        console.error('Failed to load master data:', error);
        toast.error('Failed to load master data');
      }
    };
    loadMasterData();
  }, []);

  useEffect(() => {
    const loadTransactions = async () => {
      if ((!selectedClient || selectedClient === 'ALL') && (!selectedWarehouse || selectedWarehouse === 'ALL')) {
        setTransactions([]);
        return;
      }

      setTransactionLoading(true);
      setTransactionError('');

      try {
        const filters: any = {
          direction: 'ALL',
          page: 1,
          limit: 50,
        };

        if (selectedClient && selectedClient !== 'ALL') {
          filters.clientId = selectedClient;
        }

        if (selectedWarehouse && selectedWarehouse !== 'ALL') {
          filters.warehouseId = selectedWarehouse;
        }

        if (selectedMonth) {
          const [year, month] = selectedMonth.split('-');
          const monthStart = `${year}-${month}-01`;
          const lastDayOfMonth = new Date(Number(year), Number(month), 0).getDate();
          const monthEnd = `${year}-${month}-${String(lastDayOfMonth).padStart(2, '0')}`;
          filters.startDate = monthStart;
          filters.endDate = monthEnd;
        }

        const result = await getFilteredBookings(filters);
        if (result.success) {
          setTransactions(result.data || []);
        } else {
          setTransactionError(result.message || 'Failed to fetch transactions');
          setTransactions([]);
        }
      } catch (error) {
        console.error('Failed to load transactions:', error);
        setTransactionError('Failed to load transactions');
        setTransactions([]);
      } finally {
        setTransactionLoading(false);
      }
    };

    loadTransactions();
  }, [selectedClient, selectedWarehouse, selectedMonth, clients, warehouses]);

  const transactionCounts = transactions.reduce(
    (summary, record) => {
      if (record.direction === 'INWARD') summary.inward += 1;
      if (record.direction === 'OUTWARD') summary.outward += 1;
      return summary;
    },
    { inward: 0, outward: 0 }
  );

  // Handle client selection
  const handleClientChange = async (clientId: string) => {
    setSelectedClient(clientId);
    if (!clientId || clientId === 'ALL') {
      setInvoices([]);
      setAccountBalance(null);
      return;
    }

    // If month is also selected, load filtered invoices (warehouse is optional)
    if (selectedMonth) {
      await loadInvoices(clientId, selectedWarehouse, selectedMonth);
    }
  };

  // Handle warehouse selection
  const handleWarehouseChange = async (warehouseId: string) => {
    setSelectedWarehouse(warehouseId);
    if (selectedClient && selectedClient !== 'ALL' && selectedMonth) {
      await loadInvoices(selectedClient, warehouseId, selectedMonth);
    }
  };

  // Handle month selection
  const handleMonthChange = async (month: string) => {
    setSelectedMonth(month);
    if (selectedClient && selectedClient !== 'ALL') {
      await loadInvoices(selectedClient, selectedWarehouse, month);
    }
  };

  // Load invoices with client, warehouse and month filter
  const loadInvoices = async (clientId: string, warehouseId: string, month: string) => {
    setLoading(true);
    try {
      const result = await getClientMonthlyLedger(clientId, month, warehouseId || undefined);
      if (result.success && result.data) {
        const clientResult = await getClientOptions();
        const warehouseResult = await getWarehouseOptions();
        const client = clientResult.find((c: any) => c.value === clientId);
        const warehouse = warehouseResult.find((w: any) => w.value === warehouseId);

        const transformedInvoices: MonthlyInvoice[] = result.data.months.map((invoice: any) => {
          const invoiceWarehouseId = invoice.warehouseId || warehouseId || undefined;
          const invoiceWarehouseName = invoice.warehouseName || warehouse?.label || '';
          return {
            bookingId: clientId,
            clientName: client?.label || result.data.clientName || '',
            month: invoice.month.split('-')[1].padStart(2, '0'),
            year: parseInt(invoice.month.split('-')[0]),
            periods: invoice.rows.map((period: any) => ({
              startDate: period.fromDate,
              endDate: period.toDate,
              quantityMT: Number(period.qty ?? 0),
              daysTotal: Number(period.days ?? 0),
              rentTotal: Number(period.rent ?? 0),
              status: period.status || 'COMPLETED',
              commodityName: period.commodity || '',
            })),
            warehouseId: invoiceWarehouseId,
            warehouseName: invoiceWarehouseName,
            totalRent: Number(invoice.summary.totalRent ?? 0),
            previousBalance: Number(invoice.summary.previousBalance ?? 0),
            paymentsReceived: Number(invoice.summary.payments ?? 0),
            outstandingBalance: Number(invoice.summary.outstanding ?? 0),
            invoiceDate: new Date().toISOString().split('T')[0],
            invoiceId: invoiceWarehouseId ? `${clientId}-${invoice.month}-${invoiceWarehouseId}` : `${clientId}-${invoice.month}`,
          };
        });

        setInvoices(transformedInvoices);
      } else {
        toast.error(result.message || 'Failed to load invoices');
        setInvoices([]);
      }
    } catch (error) {
      console.error('Failed to load invoices:', error);
      toast.error('Failed to load invoices');
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  };

  // Download invoice as PDF (from backend API)
  const handleDownloadInvoice = async (invoice: MonthlyInvoice) => {
    const invoiceId = invoice.invoiceId || invoice.bookingId;
    const warehouseQuery = invoice.warehouseId ? `?warehouseId=${encodeURIComponent(invoice.warehouseId)}` : '';
    setDownloading(invoiceId);
    try {
      // Fetch PDF from backend API
      const res = await fetch(`/api/invoice/download/${invoiceId}${warehouseQuery}`);
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to fetch PDF: ${res.status} ${errorText}`);
      }
      const pdfBuffer = await res.arrayBuffer();
      const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Invoice_${invoice.clientName.replace(/\s+/g, '_')}_${invoice.month}_${invoice.year}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Invoice PDF downloaded successfully');
    } catch (error) {
      console.error('Failed to download invoice PDF:', error);
      toast.error('Failed to download invoice PDF');
    } finally {
      setDownloading(null);
    }
  };

  // Record payment for invoice
  const handleRecordPayment = async (invoice: MonthlyInvoice) => {
    if (!paymentAmount || !invoice.invoiceId) return;

    setRecordingPayment(true);
    try {
      const result = await recordPayment(
        invoice.bookingId,
        parseFloat(paymentAmount),
        new Date().toISOString().split('T')[0],
        invoice.invoiceId,
        `Payment for ${invoice.month} ${invoice.year} invoice`
      );

      if (result.success) {
        toast.success('Payment recorded successfully');
        setPaymentAmount('');
        setSelectedInvoiceId(null);
        // Refresh the invoices to show updated balances
        if (selectedClient && selectedClient !== 'ALL' && selectedMonth) {
          await loadInvoices(selectedClient, selectedWarehouse, selectedMonth);
        }
      } else {
        toast.error(result.message || 'Failed to record payment');
      }
    } catch (error) {
      console.error('Failed to record payment:', error);
      toast.error('Failed to record payment');
    } finally {
      setRecordingPayment(false);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Monthly Invoices
        </h1>
        <p className="text-slate-500 mt-2">
          View and download monthly invoices with storage rent details based on TIME-STATE system
        </p>
      </div>

      {/* Client Selection Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Select Client, Warehouse & Month
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Client *</label>
              <Select value={selectedClient} onValueChange={handleClientChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a client..." />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.value} value={client.value}>
                      {client.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Warehouse (Optional)</label>
              <Select value={selectedWarehouse} onValueChange={handleWarehouseChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a warehouse..." />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((warehouse) => (
                    <SelectItem key={warehouse.value} value={warehouse.value}>
                      {warehouse.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Invoice Month *</label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => handleMonthChange(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Master Data Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Master Data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Clients</span>
              <span className="text-lg font-semibold">{Math.max(0, clients.length - 1)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Warehouses</span>
              <span className="text-lg font-semibold">{warehouses.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Commodities</span>
              <span className="text-lg font-semibold">{Math.max(0, commodities.length - 1)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Transactions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Recent Records</span>
              <span className="text-lg font-semibold">{transactions.length}</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-500 uppercase">Inward</p>
                <p className="mt-2 text-2xl font-semibold text-emerald-700">{transactionCounts.inward}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-500 uppercase">Outward</p>
                <p className="mt-2 text-2xl font-semibold text-rose-700">{transactionCounts.outward}</p>
              </div>
            </div>
            <p className="text-sm text-slate-500">
              Showing up to 50 recent transactions for the selected filters.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Current Filters</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Client</span>
              <span className="font-medium">{clients.find((c) => c.value === selectedClient)?.label || 'All'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Warehouse</span>
              <span className="font-medium">{warehouses.find((w) => w.value === selectedWarehouse)?.label || 'Any'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Invoice Month</span>
              <span className="font-medium">{selectedMonth ? selectedMonth : 'Any'}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Transaction List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Inward / Outward Transactions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {transactionLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Loading transactions...
            </div>
          ) : transactionError ? (
            <div className="py-8 text-center text-red-600">{transactionError}</div>
          ) : transactions.length === 0 ? (
            <div className="py-8 text-center text-slate-500">
              Select a client and optionally a warehouse/month to view inward/outward transactions.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700">Date</th>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700">Direction</th>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700">Commodity</th>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700">Warehouse</th>
                    <th className="px-4 py-2 text-right font-semibold text-slate-700">Qty (MT)</th>
                    <th className="px-4 py-2 text-center font-semibold text-slate-700">Bags</th>
                    <th className="px-4 py-2 text-center font-semibold text-slate-700">Days</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {transactions.map((record) => (
                    <tr key={record._id} className="bg-white">
                      <td className="px-4 py-2">{typeof record.date === 'string' ? record.date : (record.date instanceof Date ? record.date.toISOString().split('T')[0] : '—')}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${record.direction === 'INWARD' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                          {record.direction}
                        </span>
                      </td>
                      <td className="px-4 py-2">{record.commodityName || ''}</td>
                      <td className="px-4 py-2">{record.warehouseName || ''}</td>
                      <td className="px-4 py-2 text-right font-medium">{Number(record.quantityMT || 0).toFixed(2)}</td>
                      <td className="px-4 py-2 text-center">{record.bags || 0}</td>
                      <td className="px-4 py-2 text-center">{record.storageDays || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Loading State */}
      {loading && (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Loading invoices...
          </CardContent>
        </Card>
      )}

      {/* Account Balance Summary */}

      {/* Monthly Invoices */}
      {!loading && selectedClient && (
        <div className="space-y-4">
          {!selectedMonth ? (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <p className="text-slate-600 text-center">
                  <span className="block mb-2">📅 Please select an invoice month to view invoices</span>
                  <span className="text-sm text-slate-500">Warehouse selection is optional</span>
                </p>
              </CardContent>
            </Card>
          ) : invoices.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <p className="text-slate-500">No invoices found for the selected criteria</p>
              </CardContent>
            </Card>
          ) : (
            invoices.map((invoice, index) => (
              <Card key={`${invoice.invoiceId || `invoice-${index}`}`} className="border-l-4 border-l-indigo-500 overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Calendar className="h-5 w-5 text-indigo-600" />
                        {invoice.month} {invoice.year}
                      </CardTitle>
                      <div className="flex items-center gap-6 mt-3 text-sm text-slate-600">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4" />
                          <span>{invoice.warehouseName || 'General'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4" />
                          <span>{invoice.periods.length} period(s)</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-bold text-slate-900">
                        ₹{(invoice.totalRent || 0).toLocaleString('en-IN')}
                      </div>
                      <p className="text-xs text-slate-500 mt-1">Monthly Rent</p>
                      <div className="flex gap-2 mt-3">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDownloadInvoice(invoice)}
                          disabled={downloading === invoice.bookingId}
                        >
                          {downloading === invoice.bookingId ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <Download className="h-4 w-4 mr-2" />
                          )}
                          Download
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Periods Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-100">
                        <tr>
                          <th className="px-4 py-2 text-left font-semibold text-slate-700">Commodity</th>
                          <th className="px-4 py-2 text-left font-semibold text-slate-700">From Date</th>
                          <th className="px-4 py-2 text-left font-semibold text-slate-700">To Date</th>
                          <th className="px-4 py-2 text-center font-semibold text-slate-700">Qty (MT)</th>
                          <th className="px-4 py-2 text-center font-semibold text-slate-700">Days</th>
                          <th className="px-4 py-2 text-right font-semibold text-slate-700">Rent (₹)</th>
                          <th className="px-4 py-2 text-center font-semibold text-slate-700">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {invoice.periods.map((period, idx) => (
                          <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                            <td className="px-4 py-2 font-medium text-slate-900">{period.commodityName}</td>
                            <td className="px-4 py-2">{period.startDate}</td>
                            <td className="px-4 py-2">{period.endDate}</td>
                            <td className="px-4 py-2 text-center font-medium">{Number(period.quantityMT || 0).toFixed(2)}</td>
                            <td className="px-4 py-2 text-center">{period.daysTotal ?? 0}</td>
                            <td className="px-4 py-2 text-right font-semibold">₹{Number(period.rentTotal || 0).toLocaleString('en-IN')}</td>
                            <td className="px-4 py-2 text-center">
                              <span
                                className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
                                  period.status === 'ACTIVE'
                                    ? 'bg-green-100 text-green-800'
                                    : period.status === 'PARTIAL_REMOVAL'
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-gray-100 text-gray-800'
                                }`}
                              >
                                {period.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Summary */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-lg border">
                    <div>
                      <p className="text-xs text-slate-600">Monthly Storage Rent</p>
                      <p className="text-lg font-bold text-slate-900">₹{(invoice.totalRent || 0).toLocaleString('en-IN')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-600">Previous Balance</p>
                      <p className="text-lg font-bold">₹{(invoice.previousBalance || 0).toLocaleString('en-IN')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-600">Payments Received</p>
                      <p className="text-lg font-bold text-green-600">-₹{(invoice.paymentsReceived || 0).toLocaleString('en-IN')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-600">Outstanding Balance</p>
                      <p className={`text-lg font-bold ${(invoice.outstandingBalance || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        ₹{(Math.abs(invoice.outstandingBalance || 0)).toLocaleString('en-IN')}
                      </p>
                    </div>
                  </div>

                  {/* Payment Input Section */}
                  <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 mr-4">
                        <label className="block text-sm font-medium text-slate-700 mb-1">Record Payment for this Invoice</label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            placeholder="Enter payment amount"
                            value={selectedInvoiceId === invoice.invoiceId ? paymentAmount : ''}
                            onChange={(e) => {
                              setPaymentAmount(e.target.value);
                              setSelectedInvoiceId(invoice.invoiceId || null);
                            }}
                            className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <Button
                            size="sm"
                            onClick={() => handleRecordPayment(invoice)}
                            disabled={recordingPayment || !paymentAmount || selectedInvoiceId !== invoice.invoiceId}
                            className="bg-blue-600 hover:bg-blue-700"
                          >
                            {recordingPayment ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                              <BookOpen className="h-4 w-4 mr-2" />
                            )}
                            Record Payment
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}