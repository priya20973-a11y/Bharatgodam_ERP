import React from 'react';
import { getColdTransfers } from '@/app/actions/cold-transfer-actions';
import { requireWspActionPermission } from '@/lib/server-wsp-permissions';
import { requirePagePermission } from '@/lib/server-permissions';
import { hasPermission } from '@/lib/permissions';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import ColdTransferList from '@/components/features/transfers/cold-transfer-list';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Ownership Transfers | Cold Storage',
};

export default async function ColdTransfersPage() {
  await requireWspActionPermission('inward');
  const session = await requirePagePermission('ownershipTransfer');
  const canCreate = hasPermission(session, 'ownershipTransfer', 'create');
  
  const transfers = await getColdTransfers();

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Ownership Transfers</h1>
          <p className="text-slate-500">View and manage ownership transfers</p>
        </div>
        {canCreate && (
          <Link href="/cold/transfers/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Transfer Ownership
            </Button>
          </Link>
        )}
      </div>

      <ColdTransferList transfers={transfers} />
    </div>
  );
}
