import { getColdWarehouses } from '@/app/actions/cold-warehouse-actions';
import ColdWarehouseWrapper from '@/components/features/warehouses/cold-warehouse-wrapper';
import { requireSession, isAdmin } from '@/lib/ownership';

export const metadata = {
  title: 'Cold Storage Warehouse Master | ERP',
};

export default async function ColdWarehousesPage() {
  const session = await requireSession();
  const coldWarehouses = await getColdWarehouses({ includeInactive: true });
  const isUserAdmin = isAdmin(session);

  return (
    <div className="space-y-6">
      <ColdWarehouseWrapper initialColdWarehouses={coldWarehouses} isAdmin={isUserAdmin} />
    </div>
  );
}
