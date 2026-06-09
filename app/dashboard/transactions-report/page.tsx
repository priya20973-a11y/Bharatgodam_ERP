import React from 'react';
import TransactionsReportWrapper from '@/components/features/reports/transactions-report-wrapper';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Transactions Report | Warehouse Management',
  description: 'View all inward and outward transactions in tabular format with CSV export',
};

export default function TransactionsReportPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-50 to-indigo-50 p-6 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-2">Warehouse Management System</h1>
          <p className="text-slate-600">Transaction Reports</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 md:p-8">
          <TransactionsReportWrapper />
        </div>
      </div>
    </div>
  );
}
