import { getClients } from '@/app/actions/client-actions';
import { fetchColdCommodities } from '@/app/actions/cold-commodities';
import { getColdWarehouses } from '@/app/actions/cold-warehouse-actions';
import { getColdOutwards } from '@/app/actions/cold-outward-actions';
import ColdOutwardWrapper from '@/components/features/outward/cold-outward-wrapper';

export const metadata = {
  title: 'Outward Transactions (Cold Storage) | ERP',
};

export default async function ColdOutwardPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | undefined }> }) {
  const resolvedSearchParams = await searchParams;
  const [clients, commodities, warehouses, outwards] = await Promise.all([
    getClients(),
    fetchColdCommodities(),
    getColdWarehouses({ includeInactive: false }),
    getColdOutwards()
  ]);

  return (
    <div className="space-y-6">
      <ColdOutwardWrapper 
        initialOutwards={outwards}
        clients={clients}
        commodities={commodities}
        warehouses={warehouses}
        searchParams={resolvedSearchParams}
      />
    </div>
  );
}
