'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';

type ItemRecord = { _id?: string; name: string; type: string; unit: string };

type Ingredient = { itemId: string; quantity: string; unit: string };

export default function BOMClient() {
  const [items, setItems] = useState<ItemRecord[]>([]);
  const [form, setForm] = useState({ name: '', description: '', finishedGoodId: '', outputQuantity: '', ingredients: [{ itemId: '', quantity: '', unit: '' }] });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadItems = async () => {
      const response = await fetch('/api/manufacturing/items');
      const data = await response.json();
      setItems(data.items || []);
    };

    loadItems();
  }, []);

  const addIngredient = () => {
    setForm({ ...form, ingredients: [...form.ingredients, { itemId: '', quantity: '', unit: '' }] });
  };

  const updateIngredient = (index: number, field: keyof Ingredient, value: string) => {
    const updated = [...form.ingredients];
    updated[index] = { ...updated[index], [field]: value };
    setForm({ ...form, ingredients: updated });
  };

  const saveBOM = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.finishedGoodId) return;
    setLoading(true);

    const response = await fetch('/api/manufacturing/boms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        description: form.description,
        finishedGoodId: form.finishedGoodId,
        outputQuantity: Number(form.outputQuantity || 1),
        ingredients: form.ingredients.filter((ingredient) => ingredient.itemId).map((ingredient) => ({ itemId: ingredient.itemId, quantity: Number(ingredient.quantity || 0), unit: ingredient.unit || 'KG' })),
      }),
    });

    if (response.ok) {
      setForm({ name: '', description: '', finishedGoodId: '', outputQuantity: '', ingredients: [{ itemId: '', quantity: '', unit: '' }] });
    }

    setLoading(false);
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-slate-900">BOM builder</h2>
      <p className="mt-1 text-sm text-slate-600">Create recipes with ingredient quantities and output targets.</p>

      <form onSubmit={saveBOM} className="mt-4 space-y-3">
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="BOM name" />
        <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Description" />
        <select value={form.finishedGoodId} onChange={(e) => setForm({ ...form, finishedGoodId: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2">
          <option value="">Select finished good</option>
          {items.filter((item) => item.type === 'FINISHED_GOOD').map((item) => (
            <option key={item._id} value={item._id}>{item.name}</option>
          ))}
        </select>
        <input value={form.outputQuantity} onChange={(e) => setForm({ ...form, outputQuantity: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Output quantity" type="number" />

        <div className="space-y-2">
          {form.ingredients.map((ingredient, index) => (
            <div key={index} className="grid gap-2 md:grid-cols-[1.4fr_0.7fr_0.7fr]">
              <select value={ingredient.itemId} onChange={(e) => updateIngredient(index, 'itemId', e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2">
                <option value="">Select ingredient</option>
                {items.filter((item) => item.type === 'RAW_MATERIAL').map((item) => (
                  <option key={item._id} value={item._id}>{item.name}</option>
                ))}
              </select>
              <input value={ingredient.quantity} onChange={(e) => updateIngredient(index, 'quantity', e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Qty" type="number" />
              <input value={ingredient.unit} onChange={(e) => updateIngredient(index, 'unit', e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Unit" />
            </div>
          ))}
          <button type="button" onClick={addIngredient} className="text-sm font-medium text-blue-600">+ Add ingredient</button>
        </div>

        <button type="submit" disabled={loading} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">
          <Plus className="h-4 w-4" /> {loading ? 'Saving...' : 'Save BOM'}
        </button>
      </form>
    </div>
  );
}
