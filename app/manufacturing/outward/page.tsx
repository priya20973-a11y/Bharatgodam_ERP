import { ArrowUpFromLine } from 'lucide-react';
import OutwardClient from './OutwardClient';

export default function ManufacturingOutwardPage() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-xl bg-amber-100 p-3 text-amber-700">
            <ArrowUpFromLine className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Finished Goods Outward</h1>
            <p className="text-sm text-slate-600">Dispatch finished goods and tie each movement to a production lot.</p>
          </div>
        </div>
      </div>

      <OutwardClient />
    </div>
  );
}
