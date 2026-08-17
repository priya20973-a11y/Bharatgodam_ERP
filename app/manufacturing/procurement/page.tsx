import { ClipboardList } from 'lucide-react';
import ProcurementClient from './ProcurementClient';

export default function ProcurementPage() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-xl bg-blue-100 p-3 text-blue-700">
            <ClipboardList className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Procurement</h1>
            <p className="text-sm text-slate-600">Manage purchase requests and raw-material sourcing flow.</p>
          </div>
        </div>
      </div>

      <ProcurementClient />
    </div>
  );
}
