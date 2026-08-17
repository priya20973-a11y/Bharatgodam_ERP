'use client';

import React, { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSession } from 'next-auth/react';
import { getDropdownDisplayName } from '@/lib/utils';

interface Client {
  id: string;
  name: string;
  type: string;
  address: string;
  mobile: string;
}

interface InvoiceLineItem {
  commodityName: string;
  inwardDate: string;
  outwardDate?: string;
  quantityMT: number;
  bags: number;
  storageDays: number;
  ratePerMtMonth: number;
  amount: number;
}

interface MonthlyInvoice {
  _id: string;
  clientName: string;
  warehouseName: string;
  month: string;
  year: number;
  lineItems: InvoiceLineItem[];
  totalAmount: number;
  invoiceId?: string;
}

export default function InvoicesPage() {
  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.role === 'ADMIN';
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [invoices, setInvoices] = useState<MonthlyInvoice[]>([]);
  const [activeTab, setActiveTab] = useState<'monthly' | 'cold'>('monthly');
  const [coldInvoices, setColdInvoices] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [selectedColdInvoiceId, setSelectedColdInvoiceId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchClients = async () => {
      try {
        const response = await fetch('/api/clients');
        const data = await response.json();

        if (response.ok && data.success) {
          setClients(data.clients || []);
        }
      } catch (err) {
        console.error('Error fetching clients:', err);
      }
    };

    fetchClients();
    // fetch warehouses for selection
    (async () => {
      try {
        const res = await fetch('/api/warehouses');
        const data = await res.json();
        if (res.ok && data.success) setWarehouses(data.data || []);
      } catch (e) {
        console.error('Failed to fetch warehouses', e);
      }
    })();
  }, []);

  useEffect(() => {
    const fetchInvoices = async () => {
      if (!selectedClientId) {
        setInvoices([]);
        return;
      }

      setLoading(true);
      setError('');

      try {
        const selectedClient = clients.find((c) => c.id === selectedClientId);
        if (!selectedClient) {
          setInvoices([]);
          return;
        }

        const response = await fetch(`/api/invoices/monthly/${encodeURIComponent(selectedClient.name)}`);
        const result = await response.json();

        if (response.ok && result.success) {
          setInvoices(result.data || []);
        } else {
          setError(result.message || 'Failed to fetch invoices');
          setInvoices([]);
        }
      } catch (err) {
        console.error('Error fetching invoices:', err);
        setError('Failed to fetch invoices');
        setInvoices([]);
      } finally {
        setLoading(false);
      }
    };

    fetchInvoices();
  }, [selectedClientId, clients]);

  useEffect(() => {
    const fetchColdInvoices = async () => {
      if (!selectedClientId || activeTab !== 'cold') {
        setColdInvoices([]);
        return;
      }

      setLoading(true);
      try {
        const qs = selectedWarehouseId ? `?warehouseId=${encodeURIComponent(selectedWarehouseId)}` : '';
        const response = await fetch(`/api/invoices/cold/${encodeURIComponent(selectedClientId)}${qs}`);
        const result = await response.json();
        if (response.ok && result.success) {
          setColdInvoices(result.data || []);
        } else {
          setColdInvoices([]);
        }
      } catch (err) {
        console.error('Error fetching cold invoices:', err);
        setColdInvoices([]);
      } finally {
        setLoading(false);
      }
    };

    fetchColdInvoices();
  }, [selectedClientId, activeTab]);

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Client Invoices</h1>
              <p className="text-slate-600 mt-2">View ledger-based monthly invoices for selected clients.</p>
            </div>
          </div>
        </div>

        <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-6 mb-8">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Select Client</h3>
          <div className="max-w-md">
            <Select value={selectedClientId} onValueChange={setSelectedClientId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select client" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {getDropdownDisplayName(client, clients, isAdmin)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mb-6">
          <div className="flex items-center gap-4">
            <button
              className={`px-4 py-2 rounded ${activeTab === 'monthly' ? 'bg-slate-900 text-white' : 'bg-white border'}`}
              onClick={() => setActiveTab('monthly')}
            >
              Monthly Invoices
            </button>
            <button
              className={`px-4 py-2 rounded ${activeTab === 'cold' ? 'bg-slate-900 text-white' : 'bg-white border'}`}
              onClick={() => setActiveTab('cold')}
            >
              Cold Invoices
            </button>
          </div>
        </div>

        {activeTab === 'cold' && (
          <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-6 mb-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Warehouse</label>
                <Select value={selectedWarehouseId} onValueChange={setSelectedWarehouseId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="All warehouses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All warehouses</SelectItem>
                    {warehouses.map((w) => (
                      <SelectItem key={w._id} value={w._id}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Select Invoice</label>
                <Select value={selectedColdInvoiceId} onValueChange={setSelectedColdInvoiceId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="All invoices" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All invoices</SelectItem>
                    {coldInvoices.map((inv) => (
                      <SelectItem key={inv._id} value={inv._id}>{inv.invoiceId || inv._id} — {inv.warehouseId?.name || ''} — ₹{(inv.totalAmount||0).toFixed(2)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Client</label>
                <div className="p-2 border rounded">{clients.find(c=>c.id===selectedClientId)?.name || ''}</div>
              </div>
            </div>
          </div>
        )}

        {selectedClientId && (
          <div className="space-y-6">
            {loading && <p className="text-slate-500">Loading invoices...</p>}
            {!loading && error && <p className="text-red-500">{error}</p>}
            {activeTab === 'monthly' && (
              <>
                {!loading && !error && invoices.length === 0 && (
                  <p className="text-slate-500">No monthly invoices found for this client.</p>
                )}

                {!loading && !error && invoices.length > 0 && (
                  <div className="space-y-6">
                    {invoices.map((invoice, index) => (
                      <div key={index} className="bg-white shadow-sm border border-slate-200 rounded-xl p-6">
                        <div className="border-b border-slate-200 pb-4 mb-6">
                          <div className="flex justify-between items-start">
                            <div>
                              <h2 className="text-2xl font-bold text-slate-900">
                                Invoice #{invoice.invoiceId || invoice._id}
                              </h2>
                              <p className="text-slate-600">Client: {invoice.clientName}</p>
                              <p className="text-slate-600">Warehouse: {invoice.warehouseName}</p>
                              <p className="text-slate-600">Period: {invoice.month} {invoice.year}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-semibold text-slate-900">
                                Total: ₹{invoice.totalAmount.toFixed(2)}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="overflow-x-auto mb-6">
                          <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-slate-50">
                              <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Commodity</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Inward Date</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Outward Date</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Weight (Kg)</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Bags</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Days</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Rate</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Amount</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-slate-200">
                              {invoice.lineItems.map((item, itemIndex) => (
                                <tr key={itemIndex}>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">{item.commodityName}</td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{new Date(item.inwardDate).toLocaleDateString()}</td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{item.outwardDate ? new Date(item.outwardDate).toLocaleDateString() : 'Ongoing'}</td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{item.quantityMT}</td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{item.bags}</td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{item.storageDays}</td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">₹{item.ratePerMtMonth}</td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">₹{item.amount.toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <div className="border-t border-slate-200 pt-4">
                          <div className="flex justify-end">
                            <div className="text-right">
                              <p className="text-lg font-semibold text-slate-900">Total Amount: ₹{invoice.totalAmount.toFixed(2)}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {activeTab === 'cold' && (
              <>
                {!loading && coldInvoices.length === 0 && <p className="text-slate-500">No cold invoices found for this client.</p>}
                {!loading && coldInvoices.length > 0 && (
                  <div className="space-y-6">
                    {coldInvoices.filter((inv:any)=>!selectedColdInvoiceId || inv._id === selectedColdInvoiceId).map((invoice: any) => (
                      <div key={invoice._id} className="bg-white shadow-sm border border-slate-200 rounded-xl p-6">
                        <div className="border-b border-slate-200 pb-4 mb-6">
                          <div className="flex justify-between items-start">
                            <div>
                              <h2 className="text-2xl font-bold text-slate-900">Invoice #{invoice.invoiceId || invoice._id}</h2>
                              <p className="text-slate-600">Client: {invoice.clientId?.name || ''}</p>
                              <p className="text-slate-600">Warehouse: {invoice.warehouseId?.name || ''}</p>
                              <p className="text-slate-600">Period: {new Date(invoice.fromDate).toLocaleDateString()}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-semibold text-slate-900">Total: ₹{(invoice.totalAmount||0).toFixed(2)}</p>
                            </div>
                          </div>
                        </div>

                        <div className="overflow-x-auto mb-6">
                          <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-slate-50">
                              <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Commodity</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Inward Date</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Outward Date</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Weight (Kg)</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Bags</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Days</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Rate</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Amount</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-slate-200">
                              {invoice.items.map((item: any, idx: number) => (
                                <tr key={idx}>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">{item.commodityName}</td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{item.inwardDate ? new Date(item.inwardDate).toLocaleDateString() : ''}</td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{item.outwardDate ? new Date(item.outwardDate).toLocaleDateString() : '—'}</td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{item.quantityKg}</td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{item.totalBags || ''}</td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{item.days || 0}</td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">₹{item.rateApplied || 0}</td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">₹{(item.subtotal||0).toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {invoice.additionalCharges && invoice.additionalCharges.length > 0 && (
                          <div className="mb-4">
                            <h4 className="font-semibold">Additional Charges</h4>
                            <ul>
                              {invoice.additionalCharges.map((ac: any, i: number) => (
                                <li key={i} className="text-sm text-slate-600">{ac.name}: ₹{(ac.amount||0).toFixed(2)}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div className="border-t border-slate-200 pt-4">
                          <div className="flex justify-end">
                            <div className="text-right">
                              <p className="text-lg font-semibold text-slate-900">Total Amount: ₹{(invoice.totalAmount||0).toFixed(2)}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
