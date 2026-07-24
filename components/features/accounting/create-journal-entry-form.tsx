'use client';

import { useEffect, useState } from 'react';
import { createManualJournalEntry } from '@/app/actions/accounting-actions';
import { toast } from 'react-hot-toast';

interface CreateJournalEntryFormProps {
  accounts: any[];
}

export default function CreateJournalEntryForm({ accounts }: CreateJournalEntryFormProps) {
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [form, setForm] = useState({
    entryDate: new Date().toISOString().slice(0, 10),
    voucherNumber: '',
    debitAccountName: '',
    creditAccountName: '',
    amount: '',
    narration: '',
    warehouseId: '',
    referenceType: 'MANUAL',
    referenceId: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const loadWarehouses = async () => {
      try {
        const response = await fetch('/api/warehouses');
        const data = await response.json();
        setWarehouses(Array.isArray(data) ? data : data?.warehouses || []);
      } catch {
        setWarehouses([]);
      }
    };

    loadWarehouses();
  }, []);

  const handleChange = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const result = await createManualJournalEntry({
        ...form,
        amount: Number(form.amount || 0),
      });

      if (result.success && 'entryId' in result) {
        toast.success('Journal entry created successfully');
        setForm({
          entryDate: new Date().toISOString().slice(0, 10),
          voucherNumber: '',
          debitAccountName: '',
          creditAccountName: '',
          amount: '',
          narration: '',
          warehouseId: '',
          referenceType: 'MANUAL',
          referenceId: '',
        });
      } else {
        toast.error(result.message || 'Unable to create journal entry');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to create journal entry');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-4 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Create Journal Entry</h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2 text-sm">
          <span className="font-medium text-slate-700">Entry Date</span>
          <input
            type="date"
            value={form.entryDate}
            onChange={(event) => handleChange('entryDate', event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
            required
          />
        </label>

        <label className="space-y-2 text-sm">
          <span className="font-medium text-slate-700">Voucher Number</span>
          <input
            type="text"
            value={form.voucherNumber}
            onChange={(event) => handleChange('voucherNumber', event.target.value)}
            placeholder="JV-001"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
            required
          />
        </label>

        <label className="space-y-2 text-sm">
          <span className="font-medium text-slate-700">Debit Account</span>
          <select
            value={form.debitAccountName}
            onChange={(event) => handleChange('debitAccountName', event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
            required
          >
            <option value="">Select debit account</option>
            {accounts.map((account, index) => (
              <option key={`${account.id || account.code || account.name}-${index}`} value={account.name}>{account.name}</option>
            ))}
          </select>
        </label>

        <label className="space-y-2 text-sm">
          <span className="font-medium text-slate-700">Credit Account</span>
          <select
            value={form.creditAccountName}
            onChange={(event) => handleChange('creditAccountName', event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
            required
          >
            <option value="">Select credit account</option>
            {accounts.map((account, index) => (
              <option key={`${account.id || account.code || account.name}-${index}`} value={account.name}>{account.name}</option>
            ))}
          </select>
        </label>

        <label className="space-y-2 text-sm">
          <span className="font-medium text-slate-700">Amount</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.amount}
            onChange={(event) => handleChange('amount', event.target.value)}
            placeholder="0.00"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
            required
          />
        </label>

        <label className="space-y-2 text-sm">
          <span className="font-medium text-slate-700">Warehouse</span>
          <select
            value={form.warehouseId}
            onChange={(event) => handleChange('warehouseId', event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
          >
            <option value="">Select warehouse (optional)</option>
            {warehouses.map((warehouse) => (
              <option key={warehouse._id || warehouse.id} value={warehouse._id || warehouse.id}>{warehouse.name}</option>
            ))}
          </select>
        </label>

        <label className="space-y-2 text-sm">
          <span className="font-medium text-slate-700">Reference Type</span>
          <select
            value={form.referenceType}
            onChange={(event) => handleChange('referenceType', event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
          >
            <option value="MANUAL">Manual</option>
            <option value="INWARD">Inward</option>
            <option value="OUTWARD">Outward</option>
            <option value="PAYMENT">Payment</option>
            <option value="RECEIPT">Receipt</option>
          </select>
        </label>

        <label className="space-y-2 text-sm">
          <span className="font-medium text-slate-700">Reference ID</span>
          <input
            type="text"
            value={form.referenceId}
            onChange={(event) => handleChange('referenceId', event.target.value)}
            placeholder="Optional reference"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
          />
        </label>

        <label className="space-y-2 text-sm md:col-span-2">
          <span className="font-medium text-slate-700">Narration</span>
          <textarea
            value={form.narration}
            onChange={(event) => handleChange('narration', event.target.value)}
            rows={3}
            placeholder="Describe the accounting entry"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
            required
          />
        </label>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Saving...' : 'Save Journal Entry'}
        </button>
      </div>
    </form>
  );
}
