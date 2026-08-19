import { requireSession } from '@/lib/ownership';
import { getColdWarehouses } from '@/app/actions/cold-warehouse-actions';
import PurchaseModuleClient from './purchase-module-client';
import { requirePagePermission } from '@/lib/server-permissions';

export const metadata = {
  title: 'Purchase Module | Cold Storage',
};

export default async function PurchaseModulePage() {
  await requireSession();
  await requirePagePermission('purchase');

  const warehousesRes = await getColdWarehouses({ includeInactive: false });
  const warehouses = Array.isArray(warehousesRes) ? warehousesRes : [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Purchase Stock Module</h1>
      <PurchaseModuleClient warehouses={warehouses} />
    </div>
  );
}
