import { ArrowDownToLine } from 'lucide-react';
import InwardClient from './InwardClient';

export default function ManufacturingInwardPage() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-xl bg-green-100 p-3 text-green-700">
            <ArrowDownToLine className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Raw Material Inward</h1>
            <p className="text-sm text-slate-600">Record purchased raw materials, lot numbers, and receipt references.</p>
          </div>
        </div>
      </div>

      <InwardClient />
    </div>
  );
}
