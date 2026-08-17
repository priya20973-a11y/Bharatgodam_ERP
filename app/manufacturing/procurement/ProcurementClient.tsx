'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';

type ItemRecord = { _id?: string; name: string; type: string; unit: string };

export default function ProcurementClient() {
  const [items, setItems] = useState<ItemRecord[]>([]);
  const [form, setForm] = useState({ itemId: '', supplierOrCustomer: '', quantity: '', notes: '' });
  const [loading, setLoading] = useState(false);

  const loadItems = async () => {
    const response = await fetch('/api/manufacturing/items');
    const data = await response.json();
    setItems(data.items || []);
  };

  useEffect(() => {
    loadItems();
  }, []);

  const saveTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.itemId || !form.quantity) return;
    setLoading(true);

    const response = await fetch('/api/manufacturing/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'PROCUREMENT',
        itemId: form.itemId,
        quantity: Number(form.quantity),
        unit: items.find((item) => item._id === form.itemId)?.unit || 'KG',
        supplierOrCustomer: form.supplierOrCustomer,
        notes: form.notes,
      }),
    });

    if (response.ok) {
      setForm({ itemId: '', supplierOrCustomer: '', quantity: '', notes: '' });
      await loadItems();
    }

    setLoading(false);
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-slate-900">Procurement entry</h2>
      <p className="mt-1 text-sm text-slate-600">Log purchase requests and raw material sourcing.</p>

      <form onSubmit={saveTransaction} className="mt-4 space-y-3">
        <select value={form.itemId} onChange={(e) => setForm({ ...form, itemId: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2">
          <option value="">Select raw material</option>
          {items.filter((item) => item.type === 'RAW_MATERIAL').map((item) => (
            <option key={item._id} value={item._id}>{item.name}</option>
          ))}
        </select>
        <input value={form.supplierOrCustomer} onChange={(e) => setForm({ ...form, supplierOrCustomer: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Supplier / vendor" />
        <input value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Quantity" type="number" />
        <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Notes" />
        <button type="submit" disabled={loading} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">
          <Plus className="h-4 w-4" /> {loading ? 'Saving...' : 'Save procurement entry'}
        </button>
      </form>
    </div>
  );
}
