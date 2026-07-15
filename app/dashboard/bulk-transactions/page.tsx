import { Toaster } from 'react-hot-toast';
import { BulkTransactionUpload } from '@/app/components/bulk-transaction-upload';

export const metadata = {
  title: 'Bulk Transaction Upload | Warehouse Management',
  description: 'Upload multiple inward and outward transactions using CSV file',
};

import { requireWspPagePermission } from '@/lib/server-wsp-permissions';

export default async function BulkTransactionsPage() {
  await requireWspPagePermission('bulkUpload');
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Bulk Transaction Upload</h1>
        <p className="text-slate-500">
          Upload multiple inward and outward transactions at once using a CSV file. Download the template to see the required format.
        </p>
      </div>

      <div className="max-w-4xl">
        <BulkTransactionUpload />
      </div>
      <Toaster />
    </div>
  );
}
