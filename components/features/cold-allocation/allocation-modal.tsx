'use client';

import { useState } from 'react';
import { createAllocation } from '@/app/actions/cold-allocation-actions';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ColdNumberInput } from '@/components/ui/cold-number-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'react-hot-toast';

export default function AllocationModal({ isOpen, onClose, warehouses, lot, onSuccess }: any) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ warehouseId: lot?.warehouseId || '', chamberNo: '', floorNo: '', stackNo: '', allocatedQuantityKg: 0 });

  const activeWarehouse = warehouses.find((w: any) => w._id === form.warehouseId || w._id === lot?.warehouseId) || null;
  const chambers = activeWarehouse?.chambers || [];
  const chamberOptions = chambers.map((c: any) => ({ label: c.name || `Chamber ${c.chamberNo}`, value: String(c.chamberNo), floors: c.floors || [] }));
  const selectedChamber = chamberOptions.find((c: any) => c.value === String(form.chamberNo));
  const floorOptions = selectedChamber?.floors?.map((f: any) => ({ label: f.name || `Floor ${f.floorNo}`, value: String(f.floorNo), stacks: f.stacks || [] })) || [];
  const selectedFloor = floorOptions.find((f: any) => f.value === String(form.floorNo));
  const stackOptions = selectedFloor?.stacks?.map((s: any) => ({ label: s.name || `Stack ${s.stackNo}`, value: String(s.stackNo), capacity: s.capacity })) || [];

  const handleAllocate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.warehouseId || !form.chamberNo || !form.floorNo || !form.stackNo || !form.allocatedQuantityKg) {
      toast.error('Complete location and quantity');
      return;
    }
    setLoading(true);
    try {
      const res = await createAllocation({
        lotId: lot._id,
        warehouseId: form.warehouseId,
        chamberNo: Number(form.chamberNo),
        floorNo: Number(form.floorNo),
        stackNo: Number(form.stackNo),
        allocatedQuantityKg: Number(form.allocatedQuantityKg),
        clientId: lot.clientId,
        commodityId: lot.commodityId,
      });
      if (res.success) {
        toast.success('Allocated');
        onSuccess?.();
        onClose();
      } else {
        toast.error(res.error || 'Failed to allocate');
      }
    } catch (err) {
      toast.error('Server error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={isOpen} onOpenChange={onClose}>
      <div className="bg-white rounded-lg p-6 w-full max-w-xl">
        <h3 className="font-semibold text-lg mb-4">Allocate Lot {lot?.lotNo}</h3>
        <form onSubmit={handleAllocate} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs">Warehouse</label>
              <Select value={form.warehouseId} onValueChange={(v) => setForm({ ...form, warehouseId: v, chamberNo: '', floorNo: '', stackNo: '' })}>
                <SelectTrigger><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                <SelectContent>
                  {warehouses.map((w: any) => <SelectItem key={w._id} value={w._id}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs">Chamber</label>
              <Select value={form.chamberNo} onValueChange={(v) => setForm({ ...form, chamberNo: v, floorNo: '', stackNo: '' })}>
                <SelectTrigger><SelectValue placeholder="Select chamber" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Select</SelectItem>
                  {chamberOptions.map((c: any) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs">Floor</label>
              <Select value={form.floorNo} onValueChange={(v) => setForm({ ...form, floorNo: v, stackNo: '' })}>
                <SelectTrigger><SelectValue placeholder="Select floor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Select</SelectItem>
                  {floorOptions.map((f: any) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs">Stack</label>
              <Select value={form.stackNo} onValueChange={(v) => setForm({ ...form, stackNo: v })}>
                <SelectTrigger><SelectValue placeholder="Select stack" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Select</SelectItem>
                  {stackOptions.map((s: any) => <SelectItem key={s.value} value={s.value}>{s.label} — {s.capacity} Kg</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-xs">Quantity (Kg)</label>
              <ColdNumberInput value={form.allocatedQuantityKg || ''} onChange={(v) => setForm({ ...form, allocatedQuantityKg: Number(v) || 0 })} />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Allocating...' : 'Allocate'}</Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
