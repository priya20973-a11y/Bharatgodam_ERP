'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Edit, Trash2, Package } from 'lucide-react';
import { addCommodity, updateCommodity, deleteCommodity } from '@/app/actions/commodities';
import { toast, Toaster } from 'react-hot-toast';

export default function CommoditiesDashboard({ initialData }: { initialData: any[] }) {
  const [items, setItems] = useState(initialData);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', ratePerMtPerDay: 0 });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = editingId 
      ? await updateCommodity(editingId, formData)
      : await addCommodity(formData);

    if (res.success) {
      toast.success(editingId ? 'Rate updated' : 'Commodity added');
      // Simple refresh
      window.location.reload();
    } else {
      toast.error(res.error || 'Operation failed');
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this commodity?')) {
      const res = await deleteCommodity(id);
      if (res.success) {
        toast.success('Commodity deleted');
        window.location.reload();
      }
    }
  }

  return (
    <div className="space-y-6">
      <Toaster />
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <Package className="h-5 w-5 text-indigo-600" />
          {editingId ? 'Adjust Market Rate' : 'Register New Commodity'}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Commodity Name</label>
            <Input 
              required 
              value={formData.name} 
              onChange={(e) => setFormData({ ...formData, name: e.target.value.toUpperCase() })} 
              placeholder="e.g. WHEAT"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Rate (₹/MT/Day)</label>
            <Input 
              required 
              type="number" 
              value={formData.ratePerMtPerDay} 
              onChange={(e) => setFormData({ ...formData, ratePerMtPerDay: Number(e.target.value) })} 
              placeholder="6.00"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          {editingId && (
            <Button variant="outline" type="button" onClick={() => { setEditingId(null); setFormData({ name: '', ratePerMtPerDay: 0 }); }}>
              Cancel
            </Button>
          )}
          <Button type="submit">
            {editingId ? 'Update Rate' : 'Add Commodity'}
          </Button>
        </div>
      </form>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="font-bold">Commodity</TableHead>
              <TableHead className="font-bold">Daily Rate (₹/MT)</TableHead>
              <TableHead className="font-bold">Added By</TableHead>
              <TableHead className="text-right font-bold">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items && items.length > 0 ? (
              items.filter(item => item && item._id).map((item) => (
                <TableRow key={item._id.toString()}>
                  <TableCell className="font-bold tracking-tight text-slate-900">{item.name}</TableCell>
                  <TableCell>
                    <span className="font-mono text-indigo-700 font-bold bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
                      ₹{item.ratePerMtPerDay ? item.ratePerMtPerDay.toFixed(2) : '0.00'}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-slate-600">{item.addedBy || 'Unknown'}</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button variant="ghost" size="icon" onClick={() => { setEditingId(item._id); setFormData({ name: item.name, ratePerMtPerDay: item.ratePerMtPerDay }); }}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700" onClick={() => handleDelete(item._id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-slate-500">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  No commodities found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
