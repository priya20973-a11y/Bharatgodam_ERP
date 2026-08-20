'use client';

import { useEffect, useMemo, useState } from 'react';
import { Pencil, Search, Plus, Trash2, Eye, Power, PowerOff } from 'lucide-react';

type SupplierStatus = 'ACTIVE' | 'INACTIVE';

type Supplier = {
  _id?: string;
  supplierId: string;
  supplierName: string;
  companyName: string;
  contactPerson: string;
  mobile: string;
  alternateMobile?: string;
  email?: string;
  alternateEmail?: string;
  gstin?: string;
  pan?: string;
  address?: string;
  city?: string;
  state?: string;
  pinCode?: string;
  country?: string;
  paymentTerms?: string;
  creditPeriod?: number;
  openingBalance?: number;
  bankName?: string;
  accountNumber?: string;
  ifsc?: string;
  status?: SupplierStatus;
  remarks?: string;
};

type SupplierForm = Omit<Supplier, '_id'> & {
  status: SupplierStatus;
};

const emptyForm: SupplierForm = {
  supplierId: '',
  supplierName: '',
  companyName: '',
  contactPerson: '',
  mobile: '',
  alternateMobile: '',
  email: '',
  alternateEmail: '',
  gstin: '',
  pan: '',
  address: '',
  city: '',
  state: '',
  pinCode: '',
  country: 'India',
  paymentTerms: '',
  creditPeriod: 0,
  openingBalance: 0,
  bankName: '',
  accountNumber: '',
  ifsc: '',
status: 'ACTIVE',
  remarks: '',
};

export default function SupplierMasterClient() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [loading, setLoading] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);

  const loadSuppliers = async () => {
    const response = await fetch('/api/manufacturing/suppliers');
    const data = await response.json();
    setSuppliers(data.suppliers || []);
  };

  useEffect(() => {
    loadSuppliers();
  }, []);

  const filteredSuppliers = useMemo(() => {
    return suppliers.filter((supplier) => {
      const matchQuery = !search || [supplier.supplierId, supplier.supplierName, supplier.companyName, supplier.city, supplier.mobile, supplier.gstin]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(search.toLowerCase());

      const matchStatus = statusFilter === 'ALL' || (supplier.status || 'ACTIVE') === statusFilter;
      return matchQuery && matchStatus;
    });
  }, [suppliers, search, statusFilter]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!form.supplierName || !form.companyName || !form.contactPerson || !form.mobile) {
      alert('Supplier name, company, contact person and mobile are required.');
      return;
    }

    setLoading(true);

    const payload = editingId ? { ...form, id: editingId } : form;
    const response = await fetch('/api/manufacturing/suppliers', {
      method: editingId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (response.ok) {
      setForm(emptyForm);
      setEditingId(null);
      setSelectedSupplier(null);
      await loadSuppliers();
    } else {
      alert(data.message || 'Unable to save supplier.');
    }

    setLoading(false);
  };

  const beginEdit = (supplier: Supplier) => {
    setEditingId(supplier._id || null);
    setSelectedSupplier(supplier);
    setForm({
      supplierId: supplier.supplierId || '',
      supplierName: supplier.supplierName || '',
      companyName: supplier.companyName || '',
      contactPerson: supplier.contactPerson || '',
      mobile: supplier.mobile || '',
      alternateMobile: supplier.alternateMobile || '',
      email: supplier.email || '',
      alternateEmail: supplier.alternateEmail || '',
      gstin: supplier.gstin || '',
      pan: supplier.pan || '',
      address: supplier.address || '',
      city: supplier.city || '',
      state: supplier.state || '',
      pinCode: supplier.pinCode || '',
      country: supplier.country || 'India',
      paymentTerms: supplier.paymentTerms || '',
      creditPeriod: Number(supplier.creditPeriod || 0),
      openingBalance: Number(supplier.openingBalance || 0),
      bankName: supplier.bankName || '',
      accountNumber: supplier.accountNumber || '',
      ifsc: supplier.ifsc || '',
      status: supplier.status || 'ACTIVE',
      remarks: supplier.remarks || '',
    });
  };

  const remove = async (id?: string) => {
    if (!id) return;
    const confirmed = confirm('Delete this supplier?');
    if (!confirmed) return;

    const response = await fetch(`/api/manufacturing/suppliers?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });

    if (response.ok) {
      await loadSuppliers();
      if (selectedSupplier?._id === id) setSelectedSupplier(null);
    } else {
      const data = await response.json();
      alert(data.message || 'Unable to delete supplier.');
    }
  };

  const toggleStatus = async (supplier: Supplier) => {
    const nextStatus = (supplier.status || 'ACTIVE') === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const response = await fetch('/api/manufacturing/suppliers', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: supplier._id, status: nextStatus }),
    });

    if (response.ok) {
      await loadSuppliers();
    } else {
      const data = await response.json();
      alert(data.message || 'Unable to update status.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-slate-900">{editingId ? 'Edit Supplier' : 'Add Supplier'}</h2>
            <button
              type="button"
              onClick={() => {
                setForm(emptyForm);
                setEditingId(null);
                setSelectedSupplier(null);
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
            >
              <Plus className="h-4 w-4" /> New
            </button>
          </div>

          <form onSubmit={submit} className="mt-5 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <input value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Supplier ID" />
              <input value={form.supplierName} onChange={(e) => setForm({ ...form, supplierName: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Supplier Name" />
              <input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 md:col-span-2" placeholder="Company Name" />
              <input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 md:col-span-2" placeholder="Contact Person" />
              <input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Mobile" />
              <input value={form.alternateMobile} onChange={(e) => setForm({ ...form, alternateMobile: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Alternate Mobile" />
              <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Email" />
              <input value={form.alternateEmail} onChange={(e) => setForm({ ...form, alternateEmail: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Alternate Email" />
              <input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2" placeholder="GSTIN" />
              <input value={form.pan} onChange={(e) => setForm({ ...form, pan: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2" placeholder="PAN" />
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 md:col-span-2" placeholder="Address" />
              <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2" placeholder="City" />
              <input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2" placeholder="State" />
              <input value={form.pinCode} onChange={(e) => setForm({ ...form, pinCode: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2" placeholder="PIN" />
              <input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Country" />
              <input value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Payment Terms" />
              <input type="number" value={form.creditPeriod} onChange={(e) => setForm({ ...form, creditPeriod: Number(e.target.value) })} className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Credit Period" />
              <input type="number" value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: Number(e.target.value) })} className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Opening Balance" />
              <input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Bank Name" />
              <input value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Account Number" />
              <input value={form.ifsc} onChange={(e) => setForm({ ...form, ifsc: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2" placeholder="IFSC" />
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as SupplierStatus })} className="rounded-lg border border-slate-300 px-3 py-2">
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
              <textarea value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 md:col-span-2" placeholder="Remarks" rows={3} />
            </div>

            <button type="submit" disabled={loading} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">
              <Plus className="h-4 w-4" /> {loading ? 'Saving...' : editingId ? 'Update Supplier' : 'Save Supplier'}
            </button>
          </form>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3" placeholder="Search supplier" />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE')} className="rounded-lg border border-slate-300 px-3 py-2">
              <option value="ALL">All</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>

          <div className="mt-5 space-y-3">
            {filteredSuppliers.length === 0 ? (
              <p className="text-sm text-slate-500">No suppliers found.</p>
            ) : (
              filteredSuppliers.map((supplier) => (
                <div key={supplier._id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-800">{supplier.supplierName}</div>
                      <div className="text-xs text-slate-500">{supplier.supplierId} • {supplier.companyName}</div>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${supplier.status === 'INACTIVE' ? 'bg-slate-200 text-slate-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {supplier.status || 'ACTIVE'}
                    </span>
                  </div>

                  <div className="mt-3 grid gap-2 text-sm text-slate-600">
                    <div><span className="font-medium text-slate-700">GSTIN:</span> {supplier.gstin || '-'}</div>
                    <div><span className="font-medium text-slate-700">Mobile:</span> {supplier.mobile || '-'}</div>
                    <div><span className="font-medium text-slate-700">City:</span> {supplier.city || '-'}</div>
                    <div><span className="font-medium text-slate-700">Payment Terms:</span> {supplier.paymentTerms || '-'}</div>
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <button type="button" onClick={() => setSelectedSupplier(supplier)} className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs">
                      <Eye className="h-3.5 w-3.5" /> View
                    </button>
                    <button type="button" onClick={() => beginEdit(supplier)} className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs">
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                    <button type="button" onClick={() => toggleStatus(supplier)} className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs">
                      {(supplier.status || 'ACTIVE') === 'ACTIVE' ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
                      {(supplier.status || 'ACTIVE') === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                    </button>
                    <button type="button" onClick={() => remove(supplier._id)} className="inline-flex items-center gap-1 rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-600">
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {selectedSupplier && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Supplier Details</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3 text-sm text-slate-700">
            <div><span className="font-medium text-slate-500">Supplier ID:</span> {selectedSupplier.supplierId}</div>
            <div><span className="font-medium text-slate-500">Supplier Name:</span> {selectedSupplier.supplierName}</div>
            <div><span className="font-medium text-slate-500">Company:</span> {selectedSupplier.companyName}</div>
            <div><span className="font-medium text-slate-500">Contact Person:</span> {selectedSupplier.contactPerson}</div>
            <div><span className="font-medium text-slate-500">Mobile:</span> {selectedSupplier.mobile}</div>
            <div><span className="font-medium text-slate-500">GSTIN:</span> {selectedSupplier.gstin || '-'}</div>
            <div><span className="font-medium text-slate-500">PAN:</span> {selectedSupplier.pan || '-'}</div>
            <div><span className="font-medium text-slate-500">City:</span> {selectedSupplier.city || '-'}</div>
            <div><span className="font-medium text-slate-500">State:</span> {selectedSupplier.state || '-'}</div>
            <div><span className="font-medium text-slate-500">Bank:</span> {selectedSupplier.bankName || '-'}</div>
            <div><span className="font-medium text-slate-500">IFSC:</span> {selectedSupplier.ifsc || '-'}</div>
            <div><span className="font-medium text-slate-500">Payment Terms:</span> {selectedSupplier.paymentTerms || '-'}</div>
            <div><span className="font-medium text-slate-500">Credit Period:</span> {selectedSupplier.creditPeriod ?? 0}</div>
            <div><span className="font-medium text-slate-500">Opening Balance:</span> {selectedSupplier.openingBalance ?? 0}</div>
            <div><span className="font-medium text-slate-500">Remarks:</span> {selectedSupplier.remarks || '-'}</div>
          </div>
        </div>
      )}
    </div>
  );
}
