'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Factory, Package, ClipboardList, ArrowDownToLine, ArrowUpFromLine, Trash2, FileText, Settings, LayoutGrid } from 'lucide-react';

const moduleTabs = [
  {
    id: 'overview',
    label: 'Overview',
    icon: LayoutGrid,
    cards: [
      { title: 'Procurement', href: '/manufacturing/procurement', description: 'Create purchase orders and track raw materials.', icon: ClipboardList },
      { title: 'Raw Material Inward', href: '/manufacturing/inward', description: 'Record raw material receipts and lot details.', icon: ArrowDownToLine },
      { title: 'Production', href: '/manufacturing/production', description: 'Plan and log production runs.', icon: Factory },
      { title: 'Finished Goods Outward', href: '/manufacturing/outward', description: 'Dispatch finished goods with references.', icon: ArrowUpFromLine },
      { title: 'Waste & Rejections', href: '/manufacturing/waste', description: 'Track waste, rejections, and recoveries.', icon: Trash2 },
      { title: 'BOMs & Recipes', href: '/manufacturing/boms', description: 'Maintain ingredient recipes and operations.', icon: Package },
      { title: 'Reports', href: '/manufacturing/reports', description: 'View stock, production, and wastage summaries.', icon: FileText },
      { title: 'Settings', href: '/manufacturing/settings', description: 'Manage masters and module defaults.', icon: Settings },
    ],
  },
  {
    id: 'procurement',
    label: 'Procurement',
    icon: ClipboardList,
    cards: [
      { title: 'Procurement', href: '/manufacturing/procurement', description: 'Create purchase orders and track raw materials.', icon: ClipboardList },
    ],
  },
  {
    id: 'inward',
    label: 'Inward',
    icon: ArrowDownToLine,
    cards: [
      { title: 'Raw Material Inward', href: '/manufacturing/inward', description: 'Record raw material receipts and lot details.', icon: ArrowDownToLine },
    ],
  },
  {
    id: 'production',
    label: 'Production',
    icon: Factory,
    cards: [
      { title: 'Production', href: '/manufacturing/production', description: 'Plan and log production runs.', icon: Factory },
      { title: 'BOMs & Recipes', href: '/manufacturing/boms', description: 'Maintain ingredient recipes and operations.', icon: Package },
    ],
  },
  {
    id: 'outward',
    label: 'Outward',
    icon: ArrowUpFromLine,
    cards: [
      { title: 'Finished Goods Outward', href: '/manufacturing/outward', description: 'Dispatch finished goods with references.', icon: ArrowUpFromLine },
      { title: 'Waste & Rejections', href: '/manufacturing/waste', description: 'Track waste, rejections, and recoveries.', icon: Trash2 },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: FileText,
    cards: [
      { title: 'Reports', href: '/manufacturing/reports', description: 'View stock, production, and wastage summaries.', icon: FileText },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    cards: [
      { title: 'Settings', href: '/manufacturing/settings', description: 'Manage masters and module defaults.', icon: Settings },
    ],
  },
] as const;

export default function ManufacturingDashboardPage() {
  const [activeTab, setActiveTab] = useState<(typeof moduleTabs)[number]['id']>('overview');
  const activeModule = moduleTabs.find((tab) => tab.id === activeTab) ?? moduleTabs[0];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-100 p-3 text-blue-700">
              <Factory className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Manufacturing Control Center</h1>
              <p className="text-sm text-slate-600">Manufacturing mode for procurement, production planning, lot tracking, and dispatch.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {moduleTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {activeModule.cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={`${activeTab}-${card.title}`}
              href={card.href}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-500"
            >
              <div className="mb-3 inline-flex rounded-xl bg-slate-100 p-3 text-slate-700">
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="text-lg font-semibold text-slate-900">{card.title}</h2>
              <p className="mt-2 text-sm text-slate-600">{card.description}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
