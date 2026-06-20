'use client';

import { useState } from 'react';
import WarehouseList from './warehouse-list';
import WarehouseForm from './warehouse-form';
import { Button } from '@/components/ui/button';
import { Plus, X } from 'lucide-react';
import { getWarehouses, toggleWarehouseStatus, deleteWarehouse } from '@/app/actions/warehouse-actions';
import { Toaster, toast } from 'react-hot-toast';
import { useSession } from 'next-auth/react';

export default function WarehouseListWrapper({ initialWarehouses }: { initialWarehouses: any[] }) {
  const [warehouses, setWarehouses] = useState(initialWarehouses);
  const [isAdding, setIsAdding] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<any>(null);
  
  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.role === 'ADMIN';

  const refreshData = async () => {
    try {
      const data = await getWarehouses({ includeInactive: true });
      setWarehouses(data);
    } catch (err: any) {
      toast.error(err.message || 'Failed to refresh warehouses');
    }
    setIsAdding(false);
    setEditingWarehouse(null);
  };

  const handleToggleStatus = async (id: string) => {
    try {
      const res = await toggleWarehouseStatus(id);
      if (res.success) {
        toast.success(`Warehouse status updated successfully.`);
        await refreshData();
      } else {
        toast.error(res.error || 'Failed to update status');
      }
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong');
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm('Are you sure you want to permanently delete this warehouse? This action cannot be undone.');
    if (!confirmed) return;

    try {
      const res = await deleteWarehouse(id);
      if (res.success) {
        toast.success('Warehouse deleted successfully.');
        await refreshData();
      } else {
        toast.error(res.error || 'Failed to delete warehouse');
      }
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong');
    }
  };

  return (
    <div className="space-y-4">
      <Toaster />
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Registered Warehouses</h2>
        <Button 
          onClick={() => {
            setEditingWarehouse(null);
            setIsAdding(!isAdding);
          }}
          variant={isAdding ? "outline" : "default"}
        >
          {isAdding ? <><X className="mr-2 h-4 w-4" /> Cancel</> : <><Plus className="mr-2 h-4 w-4" /> Add Warehouse</>}
        </Button>
      </div>

      {(isAdding || editingWarehouse) && (
        <div className="mb-6">
          <WarehouseForm 
            warehouse={editingWarehouse} 
            onSuccess={refreshData} 
          />
        </div>
      )}

      <WarehouseList 
        warehouses={warehouses} 
        onEdit={(w) => {
          setIsAdding(false);
          setEditingWarehouse({
            id: w._id,
            name: w.name,
            address: w.address,
            totalCapacity: w.totalCapacity
          });
        }} 
        onToggleStatus={handleToggleStatus}
        onDelete={handleDelete}
        isAdmin={isAdmin}
      />
    </div>
  );
}
