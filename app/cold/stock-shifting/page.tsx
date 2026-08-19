import React from 'react';
import { getColdStockShiftings } from '@/app/actions/cold-stock-shifting-actions';
import { requirePagePermission } from '@/lib/server-permissions';
import ColdStockShiftingList from '@/components/features/stock-shifting/cold-stock-shifting-list';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Internal Stock Shifting | Cold Storage',
};

export default async function ColdStockShiftingPage() {
  await requirePagePermission('stockShifting');
  const shiftings = await getColdStockShiftings();

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <ColdStockShiftingList shiftings={shiftings} />
    </div>
  );
}
