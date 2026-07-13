import FloorMappingWrapper from '@/components/features/floor-mapping/floor-mapping-wrapper';
import { getColdWarehouses } from '@/app/actions/cold-warehouse-actions';
import { requireSession } from '@/lib/ownership';
import { redirect } from 'next/navigation';

import { requirePagePermission } from '@/lib/server-permissions';
export default async function FloorMappingPage() {
  const session = await requireSession();
  await requirePagePermission('floorMapping');
  if (!session) redirect('/login');

  const warehouses = await getColdWarehouses();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-800">Floor Mapping</h1>
      </div>
      
      <FloorMappingWrapper warehouses={warehouses || []} />
    </div>
  );
}
