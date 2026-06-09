import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';
import InvoiceDownloadForm from '@/components/admin/invoice-download-form';

export default async function AdminInvoicesPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/');
  }

  if ((session.user as any).role !== 'ADMIN') {
    redirect('/dashboard');
  }

  const db = await getDb();
  const warehouses = await db
    .collection('warehouses')
    .find()
    .sort({ name: 1 })
    .toArray();

  const warehouseOptions = warehouses.map((warehouse) => ({
    id: String(warehouse._id),
    name: warehouse.name || 'Unnamed Warehouse',
  }));

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Admin Invoice Download</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Download monthly invoices for a selected warehouse (WSP) and billing month. This page is visible only to ADMIN users.
        </p>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <InvoiceDownloadForm warehouses={warehouseOptions} />
      </div>
    </div>
  );
}
