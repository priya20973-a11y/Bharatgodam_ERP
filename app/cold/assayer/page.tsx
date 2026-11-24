import { getColdAssayers } from '@/app/actions/cold-assayer-actions';
import ColdAssayerListWrapper from '@/components/features/cold-assayer/assayer-list-wrapper';
import { requirePagePermission } from '@/lib/server-permissions';

export const metadata = {
  title: 'Cold Storage - Assayer Master | ERP',
};

export default async function ColdAssayerPage() {
  await requirePagePermission('assayerMaster');
  
  const assayers = await getColdAssayers();

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Assayer Master</h1>
        <p className="text-slate-500 text-sm">
          Manage accredited assayers, licence numbers, and active status for Cold Storage grading.
        </p>
      </div>

      <ColdAssayerListWrapper initialAssayers={assayers} />
    </div>
  );
}
