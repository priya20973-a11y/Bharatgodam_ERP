'use client';

import { useState } from 'react';
import { createWarehouse, updateWarehouse } from '@/app/actions/warehouse-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'react-hot-toast';

interface WarehouseFormProps {
  warehouse?: any;
  onSuccess: () => void;
}

export default function WarehouseForm({ warehouse, onSuccess }: WarehouseFormProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    warehouseId: warehouse?.warehouseId || '',
    name: warehouse?.name || '',
    address: warehouse?.address || '',
    totalCapacity: warehouse?.totalCapacity || 0,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = warehouse 
        ? await updateWarehouse(warehouse.id, formData)
        : await createWarehouse(formData);

      if (res.success) {
        toast.success(warehouse ? 'Warehouse updated' : 'Warehouse created');
        onSuccess();
      } else {
        toast.error(res.error || 'Failed to save warehouse');
      }
    } catch (err) {
      toast.error('Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4 border rounded-lg bg-slate-50">
      <h3 className="font-semibold text-lg">{warehouse ? 'Edit Warehouse' : 'Add New Warehouse'}</h3>
      <div className="space-y-2">
        <label className="text-sm font-medium">Warehouse ID (Optional)</label>
        <Input 
          value={formData.warehouseId} 
          onChange={(e) => setFormData({ ...formData, warehouseId: e.target.value })} 
          placeholder="e.g. WH-001"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Warehouse Name *</label>
        <Input 
          required 
          value={formData.name} 
          onChange={(e) => setFormData({ ...formData, name: e.target.value })} 
          placeholder="e.g. Central Silo A"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Address *</label>
        <Input 
          required 
          value={formData.address} 
          onChange={(e) => setFormData({ ...formData, address: e.target.value })} 
          placeholder="Full Address"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Total Capacity (MT) *</label>
        <Input 
          required 
          type="number" 
          value={formData.totalCapacity} 
          onChange={(e) => setFormData({ ...formData, totalCapacity: Number(e.target.value) })} 
          placeholder="3000"
        />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={loading}>
          {loading ? 'Saving...' : warehouse ? 'Update Warehouse' : 'Create Warehouse'}
        </Button>
      </div>
    </form>
  );
}
