import { Package } from 'lucide-react';
import BOMClient from './BOMClient';

export default function ManufacturingBomsPage() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-xl bg-sky-100 p-3 text-sky-700">
            <Package className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">BOMs & Recipes</h1>
            <p className="text-sm text-slate-600">Maintain bill of materials, process instructions, and ingredient ratios.</p>
          </div>
        </div>
      </div>

      <BOMClient />
    </div>
  );
}
