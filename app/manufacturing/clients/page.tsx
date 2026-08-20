import { fetchCommodities } from '@/app/actions/commodities';
import { getClients } from '@/app/actions/client-actions';
import ClientListWrapper from '@/components/features/clients/client-list-wrapper';

export default async function ManufacturingClientsPage() {
  const [clients, commodities] = await Promise.all([getClients(), fetchCommodities()]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Client Master</h1>
        <p className="mt-1 text-sm text-slate-600">Manage supplier, farmer, and business partner records for manufacturing procurement.</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <ClientListWrapper initialClients={clients} initialCommodities={commodities} />
      </div>
    </div>
  );
}
