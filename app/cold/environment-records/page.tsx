import React from 'react';
import { requirePagePermission } from '@/lib/server-permissions';
import { getColdEnvironmentRecords, getRecentColdEnvironmentRecords } from '@/app/actions/cold-environment-actions';
import { getColdWarehouses } from '@/app/actions/cold-warehouse-actions';
import { hasPermission } from '@/lib/permissions';
import { Metadata } from 'next';
import ColdEnvironmentForm from '@/components/features/cold-environment/cold-environment-form';
import ColdEnvironmentRecent from '@/components/features/cold-environment/cold-environment-recent';
import ColdEnvironmentTable from '@/components/features/cold-environment/cold-environment-table';

export const metadata: Metadata = {
  title: 'Environment Records | Cold Storage',
};

export default async function ColdEnvironmentRecordsPage() {
  const session = await requirePagePermission('environmentRecords');
  const canCreate = hasPermission(session, 'environmentRecords', 'create');

  const [records, recentRecords, warehouses] = await Promise.all([
    getColdEnvironmentRecords(),
    getRecentColdEnvironmentRecords(10),
    getColdWarehouses({ includeInactive: false })
  ]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Environment Records</h1>
        <p className="text-slate-500">Record temperature, moisture, and CO2 levels per warehouse, chamber and floor.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {canCreate ? (
          <ColdEnvironmentForm warehouses={warehouses} />
        ) : (
          <div className="bg-white p-6 rounded-lg border shadow-sm h-full flex items-center justify-center text-slate-500">
            You do not have permission to create records.
          </div>
        )}
        <ColdEnvironmentRecent records={recentRecords} warehouses={warehouses} />
      </div>

      <ColdEnvironmentTable records={records} warehouses={warehouses} />
    </div>
  );
}
