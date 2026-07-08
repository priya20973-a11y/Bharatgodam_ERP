import { getClients } from '@/app/actions/client-actions';
import { fetchColdCommodities } from '@/app/actions/cold-commodities';
import ClientListWrapper from '@/components/features/clients/client-list-wrapper';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { en, gu } from '@/lib/i18n/cold/dictionaries';

export const metadata = {
  title: 'Client Master | ERP',
};

export default async function ColdClientsPage() {
  const session = await getServerSession(authOptions);
  const lang = (session?.user as any)?.coldLanguage === 'gu' ? gu : en;
  const t = lang.clients as any || {};

  const [clients, commodities] = await Promise.all([getClients(), fetchColdCommodities()]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">{t.pageTitle || 'Client Master (Cold Storage)'}</h1>
        <p className="text-slate-500">
          {t.pageDescription || 'Manage and search for business partners, including Farmers, FPOs, and Companies.'}
        </p>
      </div>

      <ClientListWrapper initialClients={clients} initialCommodities={commodities} isColdStorage={true} />
    </div>
  );
}
