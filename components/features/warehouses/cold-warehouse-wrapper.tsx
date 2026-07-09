'use client';

import { useState } from 'react';
import ColdWarehouseList from './cold-warehouse-list';
import ColdWarehouseForm from './cold-warehouse-form';
import { Button } from '@/components/ui/button';
import { Plus, X } from 'lucide-react';
import { getColdWarehouses, toggleColdWarehouseStatus, deleteColdWarehouse } from '@/app/actions/cold-warehouse-actions';
import { Toaster, toast } from 'react-hot-toast';
import { useColdTranslation } from '@/components/providers/cold-language-provider';

export default function ColdWarehouseWrapper({ initialColdWarehouses, isAdmin }: { initialColdWarehouses: any[], isAdmin: boolean }) {
  const { t } = useColdTranslation();
  const [coldWarehouses, setColdWarehouses] = useState(initialColdWarehouses);
  const [isAdding, setIsAdding] = useState(false);

  const refreshData = async () => {
    try {
      const data = await getColdWarehouses({ includeInactive: true });
      setColdWarehouses(data);
    } catch (err: any) {
      toast.error(err.message || 'Failed to refresh warehouses');
    }
    setIsAdding(false);
  };

  const handleToggleStatus = async (id: string) => {
    try {
      const res = await toggleColdWarehouseStatus(id);
      if (res.success) {
        toast.success(t('warehouses.statusUpdated'));
        await refreshData();
      } else {
        toast.error(res.error || t('warehouses.updateStatusFailed'));
      }
    } catch (err: any) {
      toast.error(err.message || t('warehouses.somethingWentWrong'));
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm(t('warehouses.deleteConfirm'));
    if (!confirmed) return;

    try {
      const res = await deleteColdWarehouse(id);
      if (res.success) {
        toast.success(t('warehouses.deleteSuccess'));
        await refreshData();
      } else {
        toast.error(res.error || t('warehouses.deleteFailed'));
      }
    } catch (err: any) {
      toast.error(err.message || t('warehouses.somethingWentWrong'));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 mb-6">
        <h1 className="text-3xl font-bold tracking-tight">{t('warehouses.pageTitle')}</h1>
        <p className="text-slate-500">
          {t('warehouses.pageDescription')}
        </p>
      </div>
      <Toaster />
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">{t('warehouses.registeredWarehouses')}</h2>
        <Button 
          onClick={() => {
            setIsAdding(!isAdding);
          }}
          variant={isAdding ? "outline" : "default"}
        >
          {isAdding ? <><X className="mr-2 h-4 w-4" /> {t('common.cancel')}</> : <><Plus className="mr-2 h-4 w-4" /> {t('warehouses.addWarehouse')}</>}
        </Button>
      </div>

      {isAdding && (
        <div className="mb-6">
          <ColdWarehouseForm onSuccess={refreshData} />
        </div>
      )}

      <ColdWarehouseList 
        warehouses={coldWarehouses} 
        onToggleStatus={handleToggleStatus}
        onDelete={handleDelete}
        isAdmin={isAdmin}
      />
    </div>
  );
}
