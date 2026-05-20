import { getClients } from '@/app/actions/client-actions';
import { fetchCommodities } from '@/app/actions/commodities';
import ClientListWrapper from '@/components/features/clients/client-list-wrapper';

export const metadata = {
  title: 'Client Master | ERP',
};

export default async function ClientsPage() {
  const [clients, commodities] = await Promise.all([getClients(), fetchCommodities()]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Client Master</h1>
        <p className="text-slate-500">
          Manage and search for business partners, including Farmers, FPOs, and Companies.
        </p>
      </div>

      <ClientListWrapper initialClients={clients} initialCommodities={commodities} />
    </div>
  );
}
