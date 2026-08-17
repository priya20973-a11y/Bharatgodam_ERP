'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

type ItemType = 'RAW_MATERIAL' | 'FINISHED_GOOD' | 'WASTE';

type ItemRecord = {
  _id?: string;
  name: string;
  type: ItemType;
  unit: string;
  description: string;
  isActive?: boolean;
};

export default function ManufacturingSettingsClient() {
  const [items, setItems] = useState<ItemRecord[]>([]);
  const [form, setForm] = useState<ItemRecord>({ name: '', type: 'RAW_MATERIAL', unit: 'KG', description: '', isActive: true });
  const [loading, setLoading] = useState(false);

  const loadItems = async () => {
    const response = await fetch('/api/manufacturing/items');
    const data = await response.json();
    setItems(data.items || []);
  };

  useEffect(() => {
    loadItems();
  }, []);

  const saveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;

    setLoading(true);
    const response = await fetch('/api/manufacturing/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });

    if (response.ok) {
      setForm({ name: '', type: 'RAW_MATERIAL', unit: 'KG', description: '', isActive: true });
      await loadItems();
    }

    setLoading(false);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">Master items</h2>
        <p className="mt-1 text-sm text-slate-600">Create raw materials, finished goods, and waste categories.</p>

        <form onSubmit={saveItem} className="mt-4 space-y-3">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Item name" />
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as ItemType })} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="RAW_MATERIAL">Raw Material</option>
            <option value="FINISHED_GOOD">Finished Good</option>
            <option value="WASTE">Waste</option>
          </select>
          <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Unit (KG, L, PCS)" />
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Description" />
          <button type="submit" disabled={loading} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">
            <Plus className="h-4 w-4" /> {loading ? 'Saving...' : 'Save item'}
          </button>
        </form>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">Existing items</h2>
        <div className="mt-4 space-y-2">
          {items.length === 0 ? (
            <p className="text-sm text-slate-500">No items yet.</p>
          ) : items.map((item) => (
            <div key={item._id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
              <div>
                <div className="font-medium text-slate-800">{item.name}</div>
                <div className="text-xs text-slate-500">{item.type} • {item.unit}</div>
              </div>
              <button className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-rose-600">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
