'use client';

import { useState } from 'react';
import { createColdLot } from '@/app/actions/cold-allocation-actions';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ColdNumberInput } from '@/components/ui/cold-number-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'react-hot-toast';

export default function LotCreateForm({ warehouses, commodities, clients, onSuccess }: any) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ lotNo: '', warehouseId: '', clientId: '', commodityId: '', totalQuantityKg: 0 });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.lotNo || !form.warehouseId || !form.totalQuantityKg) {
      toast.error('Lot, warehouse and quantity are required');
      return;
    }
    setLoading(true);
    try {
      const res = await createColdLot(form);
      if (res.success) {
        toast.success('Lot created');
        onSuccess?.();
        setForm({ lotNo: '', warehouseId: '', clientId: '', commodityId: '', totalQuantityKg: 0 });
      } else {
        toast.error(res.error || 'Failed to create lot');
      }
    } catch (err) {
      toast.error('Server error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 p-4 border rounded-lg bg-white">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-medium">Lot No</label>
          <Input value={form.lotNo} onChange={(e) => setForm({ ...form, lotNo: e.target.value })} />
        </div>
        <div>
          <label className="text-xs font-medium">Warehouse</label>
          <Select value={form.warehouseId} onValueChange={(v) => setForm({ ...form, warehouseId: v })}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              {warehouses.map((w: any) => <SelectItem key={w._id} value={w._id}>{w.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium">Quantity (Kg)</label>
          <ColdNumberInput value={form.totalQuantityKg || ''} onChange={(v) => setForm({ ...form, totalQuantityKg: Number(v) || 0 })} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-medium">Client (optional)</label>
          <Select value={form.clientId} onValueChange={(v) => setForm({ ...form, clientId: v })}>
            <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">None</SelectItem>
              {clients.map((c: any) => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium">Commodity (optional)</label>
          <Select value={form.commodityId} onValueChange={(v) => setForm({ ...form, commodityId: v })}>
            <SelectTrigger><SelectValue placeholder="Select commodity" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">None</SelectItem>
              {commodities.map((c: any) => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end justify-end">
          <Button type="submit" disabled={loading}>{loading ? 'Creating...' : 'Create Lot'}</Button>
        </div>
      </div>
    </form>
  );
}
