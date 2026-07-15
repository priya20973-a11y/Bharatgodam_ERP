import { getClients } from '@/app/actions/client-actions';
import { fetchCommodities } from '@/app/actions/commodities';
import { getWarehouses } from '@/app/actions/warehouse-actions';
import OutwardForm from '@/components/features/transactions/outward-form';
import { Toaster } from 'react-hot-toast';

export const metadata = {
  title: 'Outward Transaction | ERP',
};

import { requireWspPagePermission } from '@/lib/server-wsp-permissions';

export default async function OutwardPage() {
  await requireWspPagePermission('outward');
  const [clients, commodities, warehouses] = await Promise.all([
    getClients(),
    fetchCommodities(),
    getWarehouses(),
  ]);

  // Sanitize for serializable props
  const sanitized = JSON.parse(JSON.stringify({ clients, commodities, warehouses }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-orange-900">Outward Transaction</h1>
        <p className="text-slate-500">
          Record stock withdrawals with automatic inventory validation and capacity updates.
        </p>
      </div>

      <div className="max-w-4xl">
        <OutwardForm 
          clients={sanitized.clients} 
          commodities={sanitized.commodities} 
          warehouses={sanitized.warehouses}
        />
      </div>
      <Toaster position="top-right" />
    </div>
  );
}
