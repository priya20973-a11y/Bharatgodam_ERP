'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import toast from 'react-hot-toast';

interface Client {
  _id: string;
  name: string;
}

interface Warehouse {
  _id: string;
  name: string;
}

export default function TransactionWiseInvoicePage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [invoiceMonth, setInvoiceMonth] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [clientsRes, warehousesRes] = await Promise.all([
          fetch('/api/clients'),
          fetch('/api/warehouses'),
        ]);

        const clientsJson = await clientsRes.json();
        const warehousesJson = await warehousesRes.json();

        if (clientsRes.ok && clientsJson.success) {
          setClients(clientsJson.clients || []);
        }
        if (warehousesRes.ok && warehousesJson.success) {
          setWarehouses(warehousesJson.warehouses || []);
        }
      } catch (error) {
        console.error('Error loading master data:', error);
        toast.error('Failed to load clients or warehouses');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handlePreview = () => {
    if (!selectedClientId || !selectedWarehouseId || !invoiceMonth) {
      toast.error('Select client, warehouse, and invoice month first');
      return;
    }

    const [year, month] = invoiceMonth.split('-');
    if (!year || !month) {
      toast.error('Select a valid invoice month');
      return;
    }

    const previewId = `${selectedClientId}-${year}-${month}-${selectedWarehouseId}`;
    const url = `/api/invoice/html?id=${encodeURIComponent(previewId)}&mode=transactions`;
    window.open(url, '_blank', 'noopener');
  };

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8 space-y-2">
          <h1 className="text-3xl font-bold text-slate-900">Transaction-wise Invoice Generator</h1>
          <p className="text-slate-600">Preview invoices built from transaction rows, including quantity, storage days and rate-based billing.</p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Invoice Selection</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Client *</label>
                <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map(client => (
                      <SelectItem key={client._id} value={client._id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Warehouse *</label>
                <Select value={selectedWarehouseId} onValueChange={setSelectedWarehouseId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select warehouse" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.map(warehouse => (
                      <SelectItem key={warehouse._id} value={warehouse._id}>
                        {warehouse.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Invoice Month *</label>
                <input
                  type="month"
                  value={invoiceMonth}
                  onChange={(e) => setInvoiceMonth(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-slate-600">
                This preview uses transaction-based billing rows. Quantity, days and rate are calculated per transaction within the selected month.
              </div>
              <Button
                onClick={handlePreview}
                disabled={loading}
                className="w-full sm:w-auto"
              >
                Preview Transaction Invoice
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>How it works</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside space-y-2 text-sm text-slate-700">
              <li>Select the client, warehouse, and month for which you want a transaction-style invoice.</li>
              <li>The invoice preview opens as HTML using the generated transaction invoice identifier.</li>
              <li>Billing rows are based on transaction quantity × rate × days for the chosen month.</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
