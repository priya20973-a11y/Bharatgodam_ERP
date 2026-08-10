import React from 'react';
import { getClients } from '@/app/actions/client-actions';
import { requireWspActionPermission } from '@/lib/server-wsp-permissions';
import { hasPermission } from '@/lib/permissions';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import ColdTransferForm from '@/components/features/transfers/cold-transfer-form';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'New Ownership Transfer | Cold Storage',
};

export default async function NewColdTransferPage() {
  await requireWspActionPermission('inward');
  const session = await getServerSession(authOptions);
  
  if (!hasPermission(session, 'ownershipTransfer', 'create')) {
    redirect('/cold/transfers');
  }

  const clients = await getClients();

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">New Ownership Transfer</h1>
        <p className="text-slate-500">Transfer available stock from one client to another</p>
      </div>

      <ColdTransferForm clients={clients} />
    </div>
  );
}
