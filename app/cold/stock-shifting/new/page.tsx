import React from 'react';
import { getClients } from '@/app/actions/client-actions';
import { getColdWarehouses } from '@/app/actions/cold-warehouse-actions';
import { requirePagePermission } from '@/lib/server-permissions';
import { hasPermission } from '@/lib/permissions';
import { redirect } from 'next/navigation';
import ColdStockShiftingForm from '@/components/features/stock-shifting/cold-stock-shifting-form';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'New Internal Stock Shifting | Cold Storage',
};

export default async function NewColdStockShiftingPage() {
  const session = await requirePagePermission('stockShifting');

  if (!hasPermission(session, 'stockShifting', 'create')) {
    redirect('/cold/stock-shifting');
  }

  const clients = await getClients();
  const warehouses = await getColdWarehouses();

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <ColdStockShiftingForm clients={clients} warehouses={warehouses} />
    </div>
  );
}
