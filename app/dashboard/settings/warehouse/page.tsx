import { getDb } from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import WarehouseConfigForm from '@/components/features/settings/warehouse-form';

export const dynamic = 'force-dynamic'; 

export default async function WarehouseSettingsPage() {
  const session = await getServerSession(authOptions);

  // 1. Extreme Security Guard (RBAC)
  // Kick them back to the main dashboard if they aren't an ADMIN
  if (!session?.user || (session.user as any).role !== 'ADMIN') {
    redirect('/dashboard');
  }

  // 2. Fetch the existing master config (if any)
  const db = await getDb();
  const configDoc = await db.collection('warehouse_config').findOne({});
  
  // Transform _id to string to pass safely to Client Component
  const initialData = configDoc ? {
    warehouseName: configDoc.warehouseName,
    address: configDoc.address,
    contactEmail: configDoc.contactEmail,
    totalCapacitySqFt: configDoc.totalCapacitySqFt,
    coldQualityValidationMode: configDoc.coldQualityValidationMode || 'strict',
    commodities: configDoc.commodities
  } : undefined;

  return (
    <div className="w-full">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Warehouse Configuration
        </h1>
        <p className="text-slate-500 mt-1">
          Manage capacity, active commodities, and live storage rates.
        </p>
      </div>

      <WarehouseConfigForm initialData={initialData} />
    </div>
  );
}
