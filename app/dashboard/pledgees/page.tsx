import { getPledgees } from '@/app/actions/pledgee-actions';
import PledgeeListWrapper from '@/components/features/pledgees/pledgee-list-wrapper';
import { requireWspPagePermission } from '@/lib/server-wsp-permissions';

export const metadata = {
  title: 'Pledgee Master | ERP',
};

export default async function PledgeesPage() {
  await requireWspPagePermission('outward'); // Reusing pledges permission for Pledgee Master as per common practice
  
  const pledgees = await getPledgees();

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Pledgee Master</h1>
        <p className="text-slate-500 text-sm">
          Manage banks, NBFCs, and other pledgees for stock loans.
        </p>
      </div>

      <PledgeeListWrapper initialPledgees={pledgees} />
    </div>
  );
}
