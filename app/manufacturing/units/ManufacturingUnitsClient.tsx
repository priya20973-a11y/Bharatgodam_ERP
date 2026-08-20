'use client';

import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';

type ManufacturingUnit = {
  _id?: string;
  name: string;
  code: string;
  unitType: 'PLANT' | 'UNIT' | 'LINE';
  address: string;
  state?: string;
  status?: 'ACTIVE' | 'INACTIVE';
};

const emptyForm = {
  name: '',
  code: '',
  unitType: 'UNIT' as const,
  address: '',
  state: '',
  status: 'ACTIVE' as const,
};

export default function ManufacturingUnitsClient() {
  const [units, setUnits] = useState<ManufacturingUnit[]>([]);
  const [form, setForm] = useState<ManufacturingUnit>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadUnits = async () => {
    const response = await fetch('/api/manufacturing/units');
    const data = await response.json();
    setUnits(data.units || []);
  };

  useEffect(() => {
    loadUnits();
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.code.trim() || !form.address.trim()) {
      return;
    }

    setLoading(true);
    const url = '/api/manufacturing/units';
    const method = editingId ? 'PUT' : 'POST';
    const payload = editingId ? { ...form, id: editingId } : form;

    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (response.ok) {
      setForm(emptyForm);
      setEditingId(null);
      await loadUnits();
    } else {
      alert(data.message || 'Unable to save manufacturing unit.');
    }

    setLoading(false);
  };

  const beginEdit = (unit: ManufacturingUnit) => {
    setEditingId(unit._id || null);
    setForm({
      name: unit.name,
      code: unit.code,
      unitType: unit.unitType || 'UNIT',
      address: unit.address,
      state: unit.state || '',
      status: unit.status || 'ACTIVE',
    });
  };

  const remove = async (id?: string) => {
    if (!id) return;
    const result = confirm('Delete this manufacturing unit?');
    if (!result) return;

    const response = await fetch(`/api/manufacturing/units?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });

    if (response.ok) {
      await loadUnits();
    } else {
      const data = await response.json();
      alert(data.message || 'Unable to delete manufacturing unit.');
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">{editingId ? 'Edit manufacturing unit' : 'Add manufacturing unit'}</h2>
        <p className="mt-1 text-sm text-slate-600">Create plant, unit, or line definitions used across production operations.</p>

        <form onSubmit={submit} className="mt-4 space-y-3">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Unit name"
          />
          <input
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Unit code"
          />
          <select
            value={form.unitType}
            onChange={(e) => setForm({ ...form, unitType: e.target.value as ManufacturingUnit['unitType'] })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          >
            <option value="PLANT">Plant</option>
            <option value="UNIT">Unit</option>
            <option value="LINE">Line</option>
          </select>
          <input
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Address"
          />
          <input
            value={form.state}
            onChange={(e) => setForm({ ...form, state: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="State"
          />
          <select
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as ManufacturingUnit['status'] })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          >
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
          <button type="submit" disabled={loading} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">
            <Plus className="h-4 w-4" /> {loading ? 'Saving...' : editingId ? 'Update unit' : 'Save unit'}
          </button>
        </form>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">Existing units</h2>

        <div className="mt-4 space-y-3">
          {units.length === 0 ? (
            <p className="text-sm text-slate-500">No manufacturing units yet.</p>
          ) : (
            units.map((unit) => (
              <div key={unit._id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-slate-800">{unit.name}</div>
                    <div className="text-xs text-slate-500">{unit.code} • {unit.unitType}</div>
                    <div className="mt-1 text-sm text-slate-600">{unit.address}</div>
                    {unit.state && <div className="text-xs text-slate-500">{unit.state}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => beginEdit(unit)} className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-blue-600">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => remove(unit._id)} className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-rose-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
