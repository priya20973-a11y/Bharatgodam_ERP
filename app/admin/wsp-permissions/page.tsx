import { getDryStorageWsps } from '@/app/actions/wsp-permission-actions';
import WspPermissionsClient from '@/components/features/admin/wsp-permissions-client';
import { Shield } from 'lucide-react';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'WSP Permissions | Admin',
};

export default async function WspPermissionsPage() {
  const result = await getDryStorageWsps();
  
  // Note: we can use a basic empty array if fetch fails, the client will display it gracefully
  const wsps = result.success && result.data ? result.data : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Shield className="h-8 w-8 text-blue-600" />
          <h1 className="text-3xl font-bold tracking-tight">WSP Permissions</h1>
        </div>
        <p className="text-slate-500">
          Manage module access permissions for Dry Storage Warehouse Service Providers (WSPs).
        </p>
      </div>

      <WspPermissionsClient initialWsps={wsps} />
    </div>
  );
}
