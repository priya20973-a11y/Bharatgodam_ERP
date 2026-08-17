import { Settings } from 'lucide-react';
import ManufacturingSettingsClient from './ManufacturingSettingsClient';

export default function ManufacturingSettingsPage() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-xl bg-slate-100 p-3 text-slate-700">
            <Settings className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
            <p className="text-sm text-slate-600">Manage manufacturing masters and defaults.</p>
          </div>
        </div>
      </div>

      <ManufacturingSettingsClient />
    </div>
  );
}
