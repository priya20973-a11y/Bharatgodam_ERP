import { FileText } from 'lucide-react';
import ReportsClient from './ReportsClient';

export default function ManufacturingReportsPage() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-xl bg-indigo-100 p-3 text-indigo-700">
            <FileText className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Reports</h1>
            <p className="text-sm text-slate-600">Summaries of procurement, production, stock, and wastage.</p>
          </div>
        </div>
      </div>

      <ReportsClient />
    </div>
  );
}
