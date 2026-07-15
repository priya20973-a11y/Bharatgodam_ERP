import { getClients } from '@/app/actions/client-actions';
import { fetchCommodities } from '@/app/actions/commodities';
import { getWarehouses } from '@/app/actions/warehouse-actions';
import InwardForm from '@/components/features/transactions/inward-form';
import { Toaster } from 'react-hot-toast';

export const metadata = {
  title: 'Inward Transaction | ERP',
};

import { requireWspPagePermission } from '@/lib/server-wsp-permissions';

export default async function InwardPage() {
  await requireWspPagePermission('inward');
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
        <h1 className="text-3xl font-bold tracking-tight">Inward Transaction</h1>
        <p className="text-slate-500">
          Record incoming goods, associate them with clients and commodities, and assign storage space.
        </p>
      </div>

      <div className="max-w-4xl">
        <InwardForm 
          clients={sanitized.clients} 
          commodities={sanitized.commodities} 
          warehouses={sanitized.warehouses}
        />
      </div>
      <Toaster position="top-right" />
    </div>
  );
}
