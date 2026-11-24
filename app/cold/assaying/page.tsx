import { getColdAssayingInwards } from '@/app/actions/cold-assaying-actions';
import ColdAssayingDashboard from '@/components/features/cold-assaying/assaying-dashboard';
import { requirePagePermission } from '@/lib/server-permissions';

export const metadata = {
  title: 'Cold Storage - Assaying & Grading | ERP',
};

export default async function ColdAssayingPage() {
  await requirePagePermission('assaying');
  
  const inwards = await getColdAssayingInwards();

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <ColdAssayingDashboard initialInwards={inwards} />
    </div>
  );
}
