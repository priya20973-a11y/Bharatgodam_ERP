'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';

type ItemRecord = { _id?: string; name: string; type: string; unit: string };

type BOMRecord = { _id?: string; name: string; finishedGoodId?: string; outputQuantity?: number; ingredients?: Array<{ itemId?: string; quantity?: number; unit?: string }> };

export default function ProductionClient() {
  const [items, setItems] = useState<ItemRecord[]>([]);
  const [boms, setBoms] = useState<BOMRecord[]>([]);
  const [form, setForm] = useState({ itemId: '', bomId: '', quantity: '', lotNo: '', notes: '' });
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    const [itemsRes, bomsRes] = await Promise.all([
      fetch('/api/manufacturing/items'),
      fetch('/api/manufacturing/boms'),
    ]);
    const itemsData = await itemsRes.json();
    const bomsData = await bomsRes.json();
    setItems(itemsData.items || []);
    setBoms(bomsData.boms || []);
  };

  useEffect(() => {
    loadData();
  }, []);

  const saveTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.itemId || !form.quantity) return;
    setLoading(true);

    const response = await fetch('/api/manufacturing/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'PRODUCTION',
        itemId: form.itemId,
        quantity: Number(form.quantity),
        unit: items.find((item) => item._id === form.itemId)?.unit || 'KG',
        lotNo: form.lotNo,
        notes: form.notes,
        bomId: form.bomId || undefined,
      }),
    });

    if (response.ok) {
      setForm({ itemId: '', bomId: '', quantity: '', lotNo: '', notes: '' });
      await loadData();
    }

    setLoading(false);
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-slate-900">Production entry</h2>
      <p className="mt-1 text-sm text-slate-600">Record completed production runs with BOM reference and lot number.</p>

      <form onSubmit={saveTransaction} className="mt-4 space-y-3">
        <select value={form.itemId} onChange={(e) => setForm({ ...form, itemId: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2">
          <option value="">Select finished good</option>
          {items.filter((item) => item.type === 'FINISHED_GOOD').map((item) => (
            <option key={item._id} value={item._id}>{item.name}</option>
          ))}
        </select>
        <select value={form.bomId} onChange={(e) => setForm({ ...form, bomId: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2">
          <option value="">Select BOM (optional)</option>
          {boms.map((bom) => (
            <option key={bom._id} value={bom._id}>{bom.name}</option>
          ))}
        </select>
        <input value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Quantity" type="number" />
        <input value={form.lotNo} onChange={(e) => setForm({ ...form, lotNo: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Lot number" />
        <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Notes" />
        <button type="submit" disabled={loading} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">
          <Plus className="h-4 w-4" /> {loading ? 'Saving...' : 'Save production entry'}
        </button>
      </form>
    </div>
  );
}
