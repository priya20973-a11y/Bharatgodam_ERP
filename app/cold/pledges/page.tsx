import ColdPledgeList from '@/components/features/cold-pledges/pledge-list';
import { requirePagePermission } from '@/lib/server-permissions';

export const metadata = {
  title: 'Cold Storage - Pledges & Loans | ERP',
};

export default async function ColdPledgesPage() {
  await requirePagePermission('pledge');

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <ColdPledgeList />
    </div>
  );
}
