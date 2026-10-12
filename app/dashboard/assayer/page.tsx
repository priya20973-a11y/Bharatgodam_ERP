import { getAssayers } from '@/app/actions/assayer-actions';
import AssayerListWrapper from '@/components/features/assayer/assayer-list-wrapper';
import { requireWspPagePermission } from '@/lib/server-wsp-permissions';

export const metadata = {
  title: 'Assayer Master | ERP',
};

export default async function AssayerPage() {
  await requireWspPagePermission('outward'); // Reusing a common permission as per pledgees pattern
  
  const assayers = await getAssayers();

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Assayer Master</h1>
        <p className="text-slate-500 text-sm">
          Manage assayers, licence numbers, and their active status.
        </p>
      </div>

      <AssayerListWrapper initialAssayers={assayers} />
    </div>
  );
}
