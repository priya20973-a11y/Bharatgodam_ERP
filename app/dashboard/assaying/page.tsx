import { Metadata } from 'next';
import { requireWspPagePermission } from '@/lib/server-wsp-permissions';
import { getAssayingInwards } from '@/app/actions/assaying-actions';
import AssayingDashboard from '@/components/features/assaying/assaying-dashboard';
import { Toaster } from 'react-hot-toast';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Assaying / Grading | BharatGodam ERP',
  description: 'Manage Dry Storage inward assaying and quality grading approvals',
};

export default async function AssayingPage() {
  await requireWspPagePermission('inward');
  const inwards = await getAssayingInwards();
  const serialized = JSON.parse(JSON.stringify(inwards));

  return (
    <>
      <Toaster position="top-right" />
      <AssayingDashboard initialInwards={serialized} />
    </>
  );
}
