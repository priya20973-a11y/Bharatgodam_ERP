import { ClipboardList } from 'lucide-react';
import SupplierMasterClient from './SupplierMasterClient';

export default function ProcurementPage() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-xl bg-blue-100 p-3 text-blue-700">
            <ClipboardList className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Procurement Master</h1>
            <p className="text-sm text-slate-600">Manage supplier/vendor identities for raw material procurement. This entity is distinct from client/customer records.</p>
          </div>
        </div>
      </div>

      <SupplierMasterClient />
    </div>
  );
}
