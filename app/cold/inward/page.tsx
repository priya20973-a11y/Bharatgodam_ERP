import { getColdInwards } from '@/app/actions/cold-inward-actions';
import { getColdWarehouses } from '@/app/actions/cold-warehouse-actions';
import { getClients } from '@/app/actions/client-actions';
import { fetchColdCommodities } from '@/app/actions/cold-commodities';
import ColdInwardWrapper from '@/components/features/inward/cold-inward-wrapper';

export const metadata = {
  title: 'Cold Storage Inward Transactions | ERP',
};

export default async function ColdInwardsPage({ searchParams }: { searchParams: { [key: string]: string | undefined } }) {
  const [inwards, warehouses, clients, commodities] = await Promise.all([
    getColdInwards(),
    getColdWarehouses({ includeInactive: false }),
    getClients(),
    fetchColdCommodities()
  ]);

  return (
    <div className="space-y-6">
      <ColdInwardWrapper 
        initialInwards={inwards} 
        clients={clients} 
        commodities={commodities} 
        warehouses={warehouses} 
        searchParams={searchParams}
      />
    </div>
  );
}
