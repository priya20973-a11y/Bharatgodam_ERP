import React from 'react';
import StockReport from '@/components/features/reports/stock-report';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Stock Report | Warehouse Management',
  description: 'View current stock organized by client and commodity',
};

import { requireWspPagePermission } from '@/lib/server-wsp-permissions';

export default async function StockReportPage() {
  await requireWspPagePermission('transactionReport');
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-50 to-indigo-50 p-6 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-2">Warehouse Management System</h1>
          <p className="text-slate-600">Stock Report</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 md:p-8">
          <StockReport />
        </div>
      </div>
    </div>
  );
}
