'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import toast from 'react-hot-toast';
import { getMasterData } from '@/app/actions/stock-ledger-actions';
import { Download, Loader2 } from 'lucide-react';
import type { IClient, IWarehouse, IInvoiceMaster, IInvoiceLineItem } from '@/types/schemas';

export default function InvoiceReportPage() {
  const router = useRouter();
  const { data: session, status } = useSession();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/');
    }
  }, [status, router]);

  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [masterData, setMasterData] = useState<{
    clients: IClient[];
    warehouses: IWarehouse[];
  }>({
    clients: [],
    warehouses: [],
  });

  const [filters, setFilters] = useState({
    clientId: '',
    warehouseId: '',
    invoiceMonth: '',
  });

  const [invoiceData, setInvoiceData] = useState<{
    master: IInvoiceMaster | null;
    lineItems: IInvoiceLineItem[];
  }>({
    master: null,
    lineItems: [],
  });

  // Fetch master data on component mount
  useEffect(() => {
    const fetchMasterData = async () => {
      try {
        const data = await getMasterData();
        setMasterData({
          clients: data.clients,
          warehouses: data.warehouses,
        });
      } catch (error) {
        console.error('Error fetching master data:', error);
        toast.error('Failed to load master data');
      } finally {
        setIsLoading(false);
      }
    };

    if (session) {
      fetchMasterData();
    }
  }, [session]);

  const handleFilterChange = (name: string, value: string) => {
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const generateReport = async () => {
    if (!filters.clientId || !filters.warehouseId || !filters.invoiceMonth) {
      toast.error('Please select Client, Warehouse, and Invoice Month');
      return;
    }

    setIsGenerating(true);
    try {
      const query = new URLSearchParams({
        clientId: filters.clientId,
        warehouseId: filters.warehouseId,
        invoiceMonth: filters.invoiceMonth,
      }).toString();

      const response = await fetch(`/api/invoices/report?${query}`);
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to load invoice data');
      }

      setInvoiceData({
        master: result.data.master as IInvoiceMaster | null,
        lineItems: result.data.lineItems as IInvoiceLineItem[],
      });
    } catch (error: any) {
      console.error('Error generating invoice report:', error);
      toast.error(error.message || 'Failed to generate invoice report');
    } finally {
      setIsGenerating(false);
    }
  };

  const generateMonthlyInvoiceBatch = async () => {
    if (!filters.invoiceMonth) {
      toast.error('Please select an invoice month to generate');
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch('/api/invoices/generate-monthly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceMonth: filters.invoiceMonth }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Invoice generation failed');
      }

      toast.success(`Invoices generated for ${filters.invoiceMonth}`);
      if (filters.clientId && filters.warehouseId) {
        await generateReport();
      }
    } catch (error: any) {
      console.error('Error generating monthly invoices:', error);
      toast.error(error.message || 'Failed to generate monthly invoices');
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadInvoicePDF = () => {
    if (!invoiceData.master) {
      toast.error('No invoice data to download');
      return;
    }

    const invoiceId = String(invoiceData.master._id || '');
    if (!invoiceId) {
      toast.error('Invoice ID not found');
      return;
    }

    const url = `/api/invoice/html/${encodeURIComponent(invoiceId)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return <Badge variant="outline">Draft</Badge>;
      case 'FINAL':
        return <Badge variant="default">Final</Badge>;
      case 'PAID':
        return <Badge variant="default" className="bg-green-600">Paid</Badge>;
      case 'OVERDUE':
        return <Badge variant="destructive">Overdue</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Monthly Invoice Report</h1>
          <p className="text-slate-600 mt-2">View generated invoices with detailed billing breakdown</p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Report Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Client *</label>
                <select
                  value={filters.clientId}
                  onChange={(e) => handleFilterChange('clientId', e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select client</option>
                  {masterData.clients.map(client => (
                    <option key={client._id?.toString()} value={client._id?.toString() || ''}>
                      {client.name} {client.location ? `(${client.location})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Warehouse *</label>
                <select
                  value={filters.warehouseId}
                  onChange={(e) => handleFilterChange('warehouseId', e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select warehouse</option>
                  {masterData.warehouses.map(warehouse => (
                    <option key={warehouse._id?.toString()} value={warehouse._id?.toString() || ''}>
                      {warehouse.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Invoice Month *</label>
                <input
                  type="month"
                  value={filters.invoiceMonth}
                  onChange={(e) => handleFilterChange('invoiceMonth', e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex flex-col gap-3 items-end">
                <Button
                  onClick={generateReport}
                  disabled={isGenerating}
                  className="w-full"
                >
                  {isGenerating ? 'Generating...' : 'Generate Report'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={generateMonthlyInvoiceBatch}
                  disabled={isGenerating || !filters.invoiceMonth}
                  className="w-full"
                >
                  {isGenerating ? 'Generating month...' : 'Generate Monthly Invoices'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {invoiceData.master && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Invoice Summary</span>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(invoiceData.master.status)}
                    <Button
                      onClick={downloadInvoicePDF}
                      disabled={isDownloading}
                      size="sm"
                      variant="outline"
                      className="ml-2"
                    >
                      {isDownloading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Downloading...
                        </>
                      ) : (
                        <>
                          <Download className="h-4 w-4 mr-2" />
                          Download PDF
                        </>
                      )}
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-slate-600">Invoice Month</p>
                    <p className="font-semibold">{invoiceData.master.invoiceMonth}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Total Amount</p>
                    <p className="font-semibold text-lg">₹{invoiceData.master.totalAmount.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Paid Amount</p>
                    <p className="font-semibold">₹{(invoiceData.master.paidAmount || 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Due Date</p>
                    <p className="font-semibold">{invoiceData.master.dueDate}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Billing Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Commodity</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Days Occupied</TableHead>
                      <TableHead>Avg Quantity (MT)</TableHead>
                      <TableHead>Rate (₹/MT/Day)</TableHead>
                      <TableHead>Total Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoiceData.lineItems.map((item, index) => (
                      <TableRow key={item._id?.toString() || index}>
                        <TableCell>{item.commodityId.toString()}</TableCell>
                        <TableCell>{item.periodStart} to {item.periodEnd}</TableCell>
                        <TableCell>{item.daysOccupied}</TableCell>
                        <TableCell>{item.averageQuantityMT}</TableCell>
                        <TableCell>₹{item.ratePerMTPerDay}</TableCell>
                        <TableCell>₹{item.totalAmount.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        )}

        {!invoiceData.master && !isGenerating && (
          <Card>
            <CardContent className="text-center py-8">
              <p className="text-slate-600">Select filters and generate a report to view invoice data</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}