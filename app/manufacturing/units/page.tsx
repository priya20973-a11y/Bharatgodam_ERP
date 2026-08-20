import ManufacturingUnitsClient from './ManufacturingUnitsClient';

export default function ManufacturingUnitsPage() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Manufacturing Units</h1>
        <p className="mt-1 text-sm text-slate-600">Define operational units, plants, and production lines for manufacturing workflows.</p>
      </div>

      <ManufacturingUnitsClient />
    </div>
  );
}
