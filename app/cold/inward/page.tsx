import { getColdInwards, getColdInwardDrafts } from '@/app/actions/cold-inward-actions';
import { getColdWarehouses } from '@/app/actions/cold-warehouse-actions';
import { getClients } from '@/app/actions/client-actions';
import { fetchColdCommodities } from '@/app/actions/cold-commodities';
import ColdInwardWrapper from '@/components/features/inward/cold-inward-wrapper';

export const metadata = {
  title: 'Cold Storage Inward Transactions | ERP',
};

export default async function ColdInwardsPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | undefined }> | { [key: string]: string | undefined } }) {
  const resolvedSearchParams = await Promise.resolve(searchParams);
  const page = parseInt(resolvedSearchParams?.page || '1', 10) || 1;
  const limit = parseInt(resolvedSearchParams?.limit || '50', 10) || 50;
  const search = resolvedSearchParams?.search || '';
  const warehouseId = resolvedSearchParams?.warehouseId;
  const clientId = resolvedSearchParams?.clientId;
  const commodityId = resolvedSearchParams?.commodityId;

  const [inwardResult, drafts, warehouses, clients, commodities] = await Promise.all([
    getColdInwards({ page, limit, search, warehouseId, clientId, commodityId }),
    getColdInwardDrafts(),
    getColdWarehouses({ includeInactive: false }),
    getClients(),
    fetchColdCommodities()
  ]);

  return (
    <div className="space-y-6">
      <ColdInwardWrapper 
        initialInwards={inwardResult.inwards} 
        pagination={inwardResult.pagination}
        initialDrafts={drafts}
        clients={clients} 
        commodities={commodities} 
        warehouses={warehouses} 
        searchParams={resolvedSearchParams}
      />
    </div>
  );
}
