import { getColdPledgees } from '@/app/actions/cold-pledgee-actions';
import ColdPledgeeListWrapper from '@/components/features/cold-pledgees/pledgee-list-wrapper';
import { requirePagePermission } from '@/lib/server-permissions';

export const metadata = {
  title: 'Cold Storage - Pledge Master | ERP',
};

export default async function ColdPledgeesPage() {
  await requirePagePermission('pledgeeMaster');
  
  const pledgees = await getColdPledgees();

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Pledge Master</h1>
        <p className="text-slate-500 text-sm">
          Manage banks, NBFCs, and financial institutions for Cold Storage pledge loans.
        </p>
      </div>

      <ColdPledgeeListWrapper initialPledgees={pledgees} />
    </div>
  );
}
