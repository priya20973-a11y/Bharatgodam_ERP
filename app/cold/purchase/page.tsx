import { requireSession } from '@/lib/ownership';
import { getColdWarehouses } from '@/app/actions/cold-warehouse-actions';
import PurchaseModuleClient from './purchase-module-client';
import { requirePagePermission } from '@/lib/server-permissions';

export const metadata = {
  title: 'Purchase Module | Cold Storage',
};

export default async function PurchaseModulePage() {
  await requireSession();
  
  // You might want a separate permission for purchase module, but 'dashboard' or 'inward' is a safe fallback
  // If a new permission 'purchase' is needed, you can add it, but using 'warehouse' or no-permission is safer 
  // if not defined in permissions map. Let's just allow it for users who have access to cold storage.

  const warehousesRes = await getColdWarehouses({ includeInactive: false });
  const warehouses = Array.isArray(warehousesRes) ? warehousesRes : [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Purchase Stock Module</h1>
      <PurchaseModuleClient warehouses={warehouses} />
    </div>
  );
}
