import { Factory } from 'lucide-react';
import ProductionClient from './ProductionClient';

export default function ManufacturingProductionPage() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-xl bg-purple-100 p-3 text-purple-700">
            <Factory className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Production</h1>
            <p className="text-sm text-slate-600">Plan runs, consume raw materials, and produce finished goods.</p>
          </div>
        </div>
      </div>

      <ProductionClient />
    </div>
  );
}
