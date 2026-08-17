import LotList from '@/components/features/cold-allocation/lot-list';
import { getColdWarehouses } from '@/app/actions/cold-warehouse-actions';
import { getColdLots } from '@/app/actions/cold-allocation-actions';
import { requireSession } from '@/lib/ownership';

export const dynamic = 'force-dynamic';

export default async function ColdLotsPage() {
  const session = await requireSession();
  const warehouses = await getColdWarehouses({ includeInactive: true });
  const lotsRes = await getColdLots();

  const warehousesList = warehouses || [];
  const lots = lotsRes.success ? lotsRes.data : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Cold Lots</h1>
      </div>
      <LotList initialLots={lots} warehouses={warehousesList} />
    </div>
  );
}
