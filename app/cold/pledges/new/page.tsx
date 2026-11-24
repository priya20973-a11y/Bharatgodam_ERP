import ColdCreatePledgeForm from '@/components/features/cold-pledges/create-pledge-form';
import { requirePagePermission } from '@/lib/server-permissions';

export const metadata = {
  title: 'Cold Storage - Create Pledge | ERP',
};

export default async function ColdNewPledgePage() {
  await requirePagePermission('pledge');

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <ColdCreatePledgeForm />
    </div>
  );
}
