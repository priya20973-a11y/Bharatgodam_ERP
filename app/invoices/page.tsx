'use client';

import React, { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [invoices, setInvoices] = useState<MonthlyInvoice[]>([]);
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
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {selectedClientId && (
          <div className="space-y-6">
            {loading && <p className="text-slate-500">Loading invoices...</p>}
            {!loading && error && <p className="text-red-500">{error}</p>}
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
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                              Commodity
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                              Inward Date
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                              Outward Date
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                              Weight (MT)
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                              Bags
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                              Storage Days
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                              Monthly Rate
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                              Amount
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-200">
                          {invoice.lineItems.map((item, itemIndex) => (
                            <tr key={itemIndex}>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                                {item.commodityName}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                                {new Date(item.inwardDate).toLocaleDateString()}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                                {item.outwardDate ? new Date(item.outwardDate).toLocaleDateString() : 'Ongoing'}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                                {item.quantityMT}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                                {item.bags}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                                {item.storageDays}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                                ₹{item.ratePerMtMonth}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                                ₹{item.amount.toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="border-t border-slate-200 pt-4">
                      <div className="flex justify-end">
                        <div className="text-right">
                          <p className="text-lg font-semibold text-slate-900">
                            Total Amount: ₹{invoice.totalAmount.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
