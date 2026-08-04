import { fetchColdUnits } from '@/app/actions/cold-units';
import ColdUnitListWrapper from '@/components/features/cold-units/cold-unit-list-wrapper';

export const metadata = {
  title: 'Unit Master (Cold Storage) | ERP',
};

export default async function ColdUnitsPage() {
  const result = await fetchColdUnits();
  const initialUnits = result.success ? result.data : [];

  return (
    <div className="space-y-6">
      <ColdUnitListWrapper initialUnits={initialUnits} />
    </div>
  );
}
