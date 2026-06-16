'use client';

import { useState } from 'react';

interface WarehouseOption {
  id: string;
  name: string;
}

interface InvoiceDownloadFormProps {
  warehouses: WarehouseOption[];
}

export default function InvoiceDownloadForm({ warehouses }: InvoiceDownloadFormProps) {
  const [warehouseId, setWarehouseId] = useState('');
  const [month, setMonth] = useState('');
  const [error, setError] = useState('');

  const downloadUrl = warehouseId && month
    ? `/api/admin/invoices/download?warehouseId=${encodeURIComponent(warehouseId)}&month=${encodeURIComponent(month)}`
    : '';

  const handleDownload = () => {
    setError('');

    if (!warehouseId || !month) {
      setError('Please select a warehouse and month before downloading.');
      return;
    }

    window.location.href = downloadUrl;
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-slate-700">Warehouse *</label>
          <select
            required
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            value={warehouseId}
            onChange={(event) => setWarehouseId(event.target.value)}
          >
            <option value="">Select warehouse</option>
            {warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Invoice Month *</label>
          <input
            required
            type="month"
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
          />
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={handleDownload}
          className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!warehouseId || !month}
        >
          Download Invoices (HTML ZIP)
        </button>

        {downloadUrl ? (
          <p className="text-sm text-slate-500">
            The CSV file is generated from monthly invoice records for the selected warehouse and month.
          </p>
        ) : (
          <p className="text-sm text-slate-500">Choose a warehouse and month to enable download.</p>
        )}
      </div>
    </div>
  );
}
