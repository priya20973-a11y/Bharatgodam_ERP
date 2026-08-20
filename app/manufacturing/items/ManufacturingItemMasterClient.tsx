'use client';

import { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Search, ToggleLeft, ToggleRight } from 'lucide-react';
import type { ManufacturingItemType } from '@/lib/models/ManufacturingItem';

type ItemStatus = 'ACTIVE' | 'INACTIVE';

type ManufacturingItemForm = {
  _id?: string;
  code: string;
  name: string;
  category: string;
  subCategory: string;
  grade: string;
  variety: string;
  primaryUom: string;
  secondaryUom: string;
  conversionFactor: number;
  hsnCode: string;
  gstRate: number;
  purchaseRate: number;
  openingRate: number;
  openingStock: number;
  openingStockValue: number;
  minimumStock: number;
  reorderLevel: number;
  maximumStock: number;
  storageLocation: string;
  batchTrackingRequired: boolean;
  lotTrackingRequired: boolean;
  expiryTrackingRequired: boolean;
  qualityTrackingRequired: boolean;
  wasteType: string;
  saleApplicable: boolean;
  saleRate: number;
  reusable: boolean;
  recoverable: boolean;
  description: string;
  remarks: string;
  status: ItemStatus;
};

type ManufacturingItemRecord = ManufacturingItemForm & {
  _id?: string;
};

const defaultUomByType: Record<ManufacturingItemType, string> = {
  RAW_MATERIAL: 'KG',
  FINISHED_GOOD: 'KG',
  WASTE: 'KG',
};

function getEmptyForm(itemType: ManufacturingItemType): ManufacturingItemForm {
  const sharedBase = {
    code: '',
    name: '',
    category: '',
    subCategory: '',
    grade: '',
    variety: '',
    primaryUom: defaultUomByType[itemType],
    secondaryUom: '',
    conversionFactor: 1,
    hsnCode: '',
    gstRate: 0,
    purchaseRate: 0,
    openingRate: 0,
    openingStock: 0,
    openingStockValue: 0,
    minimumStock: 0,
    reorderLevel: 0,
    maximumStock: 0,
    storageLocation: '',
    batchTrackingRequired: itemType !== 'WASTE',
    lotTrackingRequired: itemType !== 'WASTE',
    expiryTrackingRequired: itemType === 'RAW_MATERIAL',
    qualityTrackingRequired: true,
    wasteType: '',
    saleApplicable: false,
    saleRate: 0,
    reusable: false,
    recoverable: false,
    description: '',
    remarks: '',
    status: 'ACTIVE' as ItemStatus,
  };

  return sharedBase;
}

function formatMoney(value: number) {
  return Number.isFinite(value) ? new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(value) : '0';
}

export default function ManufacturingItemMasterClient({
  itemType,
  title,
  subtitle,
}: {
  itemType: ManufacturingItemType;
  title: string;
  subtitle: string;
}) {
  const [items, setItems] = useState<ManufacturingItemRecord[]>([]);
  const [form, setForm] = useState<ManufacturingItemForm>(getEmptyForm(itemType));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | ItemStatus>('ALL');

  const loadItems = async () => {
    const response = await fetch(`/api/manufacturing/items?type=${encodeURIComponent(itemType)}`);
    const data = await response.json();
    setItems(data.items || []);
  };

  useEffect(() => {
    loadItems();
  }, [itemType]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();

    return items.filter((item) => {
      const matchesSearch =
        !query ||
        item.code?.toLowerCase().includes(query) ||
        item.name.toLowerCase().includes(query) ||
        item.category?.toLowerCase().includes(query) ||
        item.grade?.toLowerCase().includes(query) ||
        item.variety?.toLowerCase().includes(query) ||
        item.storageLocation?.toLowerCase().includes(query);

      const matchesStatus = statusFilter === 'ALL' || (item.status || 'ACTIVE') === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [items, search, statusFilter]);

  const resetForm = () => {
    setForm(getEmptyForm(itemType));
    setEditingId(null);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.name.trim()) {
      alert('Item name is required.');
      return;
    }

    setLoading(true);
    const payload = {
      ...form,
      type: itemType,
      itemType,
      id: editingId,
      status: form.status || 'ACTIVE',
    };

    const response = await fetch('/api/manufacturing/items', {
      method: editingId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (response.ok) {
      resetForm();
      await loadItems();
    } else {
      alert(data.message || 'Unable to save item.');
    }

    setLoading(false);
  };

  const beginEdit = (item: ManufacturingItemRecord) => {
    setEditingId(item._id || null);
    setForm({
      _id: item._id,
      code: item.code || '',
      name: item.name || '',
      category: item.category || '',
      subCategory: item.subCategory || '',
      grade: item.grade || '',
      variety: item.variety || '',
      primaryUom: item.primaryUom || item.primaryUom || defaultUomByType[itemType],
      secondaryUom: item.secondaryUom || '',
      conversionFactor: Number(item.conversionFactor || 1),
      hsnCode: item.hsnCode || '',
      gstRate: Number(item.gstRate || 0),
      purchaseRate: Number(item.purchaseRate || 0),
      openingRate: Number(item.openingRate || 0),
      openingStock: Number(item.openingStock || 0),
      openingStockValue: Number(item.openingStockValue || 0),
      minimumStock: Number(item.minimumStock || 0),
      reorderLevel: Number(item.reorderLevel || 0),
      maximumStock: Number(item.maximumStock || 0),
      storageLocation: item.storageLocation || '',
      batchTrackingRequired: Boolean(item.batchTrackingRequired ?? (itemType !== 'WASTE')),
      lotTrackingRequired: Boolean(item.lotTrackingRequired ?? (itemType !== 'WASTE')),
      expiryTrackingRequired: Boolean(item.expiryTrackingRequired ?? (itemType === 'RAW_MATERIAL')),
      qualityTrackingRequired: Boolean(item.qualityTrackingRequired ?? true),
      wasteType: item.wasteType || '',
      saleApplicable: Boolean(item.saleApplicable ?? false),
      saleRate: Number(item.saleRate || 0),
      reusable: Boolean(item.reusable ?? false),
      recoverable: Boolean(item.recoverable ?? false),
      description: item.description || '',
      remarks: item.remarks || '',
      status: (item.status || 'ACTIVE') as ItemStatus,
    });
  };

  const toggleStatus = async (item: ManufacturingItemRecord) => {
    const nextStatus = (item.status || 'ACTIVE') === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const response = await fetch('/api/manufacturing/items', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item._id, status: nextStatus, type: itemType, itemType }),
    });

    if (response.ok) {
      await loadItems();
    } else {
      const data = await response.json();
      alert(data.message || 'Unable to update status.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-slate-900">{editingId ? 'Edit item' : 'Add item'}</h2>
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
            >
              <Plus className="h-4 w-4" /> New
            </button>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Code" />
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ItemStatus })} className="rounded-lg border border-slate-300 px-3 py-2">
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>

              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="md:col-span-2 rounded-lg border border-slate-300 px-3 py-2" placeholder="Name" />
              <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Category" />
              <input value={form.subCategory} onChange={(e) => setForm({ ...form, subCategory: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Sub-category" />
              <input value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Grade" />
              <input value={form.variety} onChange={(e) => setForm({ ...form, variety: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Variety / Variant" />

              <input value={form.primaryUom} onChange={(e) => setForm({ ...form, primaryUom: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Primary UOM" />
              <input value={form.secondaryUom} onChange={(e) => setForm({ ...form, secondaryUom: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Secondary UOM" />
              <input type="number" value={form.conversionFactor} onChange={(e) => setForm({ ...form, conversionFactor: Number(e.target.value || 1) })} className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Conversion factor" />

              <input value={form.hsnCode} onChange={(e) => setForm({ ...form, hsnCode: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2" placeholder="HSN code" />
              <input type="number" value={form.gstRate} onChange={(e) => setForm({ ...form, gstRate: Number(e.target.value || 0) })} className="rounded-lg border border-slate-300 px-3 py-2" placeholder="GST rate" />

              {itemType !== 'WASTE' && (
                <>
                  <input type="number" value={form.purchaseRate} onChange={(e) => setForm({ ...form, purchaseRate: Number(e.target.value || 0) })} className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Purchase rate" />
                  <input type="number" value={form.openingRate} onChange={(e) => setForm({ ...form, openingRate: Number(e.target.value || 0) })} className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Opening rate" />
                </>
              )}

              {itemType === 'FINISHED_GOOD' && (
                <>
                  <input type="number" value={form.saleRate} onChange={(e) => setForm({ ...form, saleRate: Number(e.target.value || 0) })} className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Selling price" />
                  <div className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2">
                    <input id={`${itemType}-sale-applicable`} type="checkbox" checked={form.saleApplicable} onChange={(e) => setForm({ ...form, saleApplicable: e.target.checked })} className="h-4 w-4" />
                    <label htmlFor={`${itemType}-sale-applicable`} className="text-sm text-slate-700">Sale applicable</label>
                  </div>
                </>
              )}

              {itemType === 'WASTE' && (
                <>
                  <input value={form.wasteType} onChange={(e) => setForm({ ...form, wasteType: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Waste type" />
                  <input type="number" value={form.saleRate} onChange={(e) => setForm({ ...form, saleRate: Number(e.target.value || 0) })} className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Sale rate" />
                  <div className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2">
                    <input id={`${itemType}-reusable`} type="checkbox" checked={form.reusable} onChange={(e) => setForm({ ...form, reusable: e.target.checked })} className="h-4 w-4" />
                    <label htmlFor={`${itemType}-reusable`} className="text-sm text-slate-700">Reusable</label>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2">
                    <input id={`${itemType}-recoverable`} type="checkbox" checked={form.recoverable} onChange={(e) => setForm({ ...form, recoverable: e.target.checked })} className="h-4 w-4" />
                    <label htmlFor={`${itemType}-recoverable`} className="text-sm text-slate-700">Recoverable</label>
                  </div>
                </>
              )}

              <input type="number" value={form.openingStock} onChange={(e) => setForm({ ...form, openingStock: Number(e.target.value || 0) })} className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Opening stock" />
              <input type="number" value={form.openingStockValue} onChange={(e) => setForm({ ...form, openingStockValue: Number(e.target.value || 0) })} className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Opening stock value" />
              <input type="number" value={form.minimumStock} onChange={(e) => setForm({ ...form, minimumStock: Number(e.target.value || 0) })} className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Minimum stock" />
              <input type="number" value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: Number(e.target.value || 0) })} className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Reorder level" />
              <input type="number" value={form.maximumStock} onChange={(e) => setForm({ ...form, maximumStock: Number(e.target.value || 0) })} className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Maximum stock" />
              <input value={form.storageLocation} onChange={(e) => setForm({ ...form, storageLocation: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Storage location" />

              <div className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2">
                <input id={`${itemType}-batch`} type="checkbox" checked={form.batchTrackingRequired} onChange={(e) => setForm({ ...form, batchTrackingRequired: e.target.checked })} className="h-4 w-4" />
                <label htmlFor={`${itemType}-batch`} className="text-sm text-slate-700">Batch tracking</label>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2">
                <input id={`${itemType}-lot`} type="checkbox" checked={form.lotTrackingRequired} onChange={(e) => setForm({ ...form, lotTrackingRequired: e.target.checked })} className="h-4 w-4" />
                <label htmlFor={`${itemType}-lot`} className="text-sm text-slate-700">Lot tracking</label>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2">
                <input id={`${itemType}-expiry`} type="checkbox" checked={form.expiryTrackingRequired} onChange={(e) => setForm({ ...form, expiryTrackingRequired: e.target.checked })} className="h-4 w-4" />
                <label htmlFor={`${itemType}-expiry`} className="text-sm text-slate-700">Expiry tracking</label>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2">
                <input id={`${itemType}-quality`} type="checkbox" checked={form.qualityTrackingRequired} onChange={(e) => setForm({ ...form, qualityTrackingRequired: e.target.checked })} className="h-4 w-4" />
                <label htmlFor={`${itemType}-quality`} className="text-sm text-slate-700">Quality tracking</label>
              </div>

              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="md:col-span-2 rounded-lg border border-slate-300 px-3 py-2" rows={3} placeholder="Description" />
              <textarea value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} className="md:col-span-2 rounded-lg border border-slate-300 px-3 py-2" rows={2} placeholder="Remarks" />
            </div>

            <button type="submit" disabled={loading} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">
              <Plus className="h-4 w-4" /> {loading ? 'Saving...' : editingId ? 'Update item' : 'Save item'}
            </button>
          </form>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-slate-900">Existing items</h2>
            <div className="flex items-center gap-2 rounded-lg border border-slate-300 px-2 py-1.5">
              <Search className="h-4 w-4 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className="w-28 bg-transparent text-sm outline-none" />
            </div>
          </div>

          <div className="mb-4">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'ALL' | ItemStatus)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="ALL">All status</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>

          <div className="space-y-3">
            {filteredItems.length === 0 ? (
              <p className="text-sm text-slate-500">No items found.</p>
            ) : (
              filteredItems.map((item) => (
                <div key={item._id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800">{item.code || '—'}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase text-slate-600">{item.status || 'ACTIVE'}</span>
                      </div>
                      <div className="mt-1 font-medium text-slate-800">{item.name}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {item.category || '—'} {item.category && item.subCategory ? '•' : ''} {item.subCategory || ''}
                        {item.grade ? ` • ${item.grade}` : ''}
                        {item.variety ? ` • ${item.variety}` : ''}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {item.primaryUom || '—'} • Stock {item.openingStock ?? 0} • {item.batchTrackingRequired ? 'Batch' : 'No batch'}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => beginEdit(item)} className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-blue-600" title="Edit item">
                        <Pencil className="h-4 w-4" />
                      </button>

                      <button type="button" onClick={() => toggleStatus(item)} className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-amber-600" title="Toggle status">
                        {(item.status || 'ACTIVE') === 'ACTIVE' ? <ToggleLeft className="h-4 w-4" /> : <ToggleRight className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-500">
                    <div>UOM: {item.primaryUom || '—'}</div>
                    <div>GST: {item.gstRate ?? 0}%</div>
                    <div>Min: {formatMoney(item.minimumStock ?? 0)}</div>
                    <div>Reorder: {formatMoney(item.reorderLevel ?? 0)}</div>
                    {itemType === 'FINISHED_GOOD' && <div>Selling: {formatMoney(item.saleRate ?? 0)}</div>}
                    {itemType === 'WASTE' && <div>Waste: {item.wasteType || '—'}</div>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
