import { getWarehouses } from '@/app/actions/warehouse-actions';
import WarehouseListWrapper from '@/components/features/warehouses/warehouse-list-wrapper';

export const metadata = {
  title: 'Warehouse Master | ERP',
};

export default async function WarehousesPage() {
  const warehouses = await getWarehouses({ includeInactive: true });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Warehouse Master</h1>
        <p className="text-slate-500">
          Manage warehouse facilities, monitor occupied capacity, and update storage status.
        </p>
      </div>

      <WarehouseListWrapper initialWarehouses={warehouses} />
    </div>
  );
}
