import { getClients } from '@/app/actions/client-actions';
import { fetchColdCommodities } from '@/app/actions/cold-commodities';
import { getColdWarehouses } from '@/app/actions/cold-warehouse-actions';
import { ColdBulkInwardUpload } from '@/components/features/inward/cold-bulk-upload';

export const metadata = {
  title: 'Cold Storage Bulk Inward Upload | ERP',
  description: 'Upload multiple cold inward transactions through a CSV file',
};

export default async function ColdBulkUploadPage() {
  const [clients, commodities, warehouses] = await Promise.all([
    getClients(),
    fetchColdCommodities(),
    getColdWarehouses({ includeInactive: false }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Cold Bulk Inward Upload</h1>
        <p className="text-slate-500">
          Upload multiple inward transactions for cold storage in one CSV file. This is inward-only and follows the same workflow as the dry bulk upload flow.
        </p>
      </div>

      <div className="max-w-5xl">
        <ColdBulkInwardUpload
          clients={clients}
          commodities={commodities}
          warehouses={warehouses}
        />
      </div>
    </div>
  );
}
