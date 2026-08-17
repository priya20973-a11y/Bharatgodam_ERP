import { Trash2 } from 'lucide-react';
import WasteClient from './WasteClient';

export default function ManufacturingWastePage() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-xl bg-rose-100 p-3 text-rose-700">
            <Trash2 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Waste & Rejections</h1>
            <p className="text-sm text-slate-600">Capture scrap, rework, and rejected output with reason codes.</p>
          </div>
        </div>
      </div>

      <WasteClient />
    </div>
  );
}
