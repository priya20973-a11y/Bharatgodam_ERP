import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { fetchColdUnits } from '@/app/actions/cold-units';
import ColdUnitListWrapper from '@/components/features/cold-units/cold-unit-list-wrapper';

export const metadata = {
  title: 'Unit Master (Cold Storage) | ERP',
};

export const dynamic = 'force-dynamic';

export default async function ColdUnitsPage() {
  const session = await getServerSession(authOptions);

  if (!session || (session.user as any)?.role !== 'ADMIN') {
    redirect('/cold/dashboard');
  }

  const result = await fetchColdUnits();
  const initialUnits = result.success ? result.data : [];

  return (
    <div className="space-y-6">
      <ColdUnitListWrapper initialUnits={initialUnits} />
    </div>
  );
}
