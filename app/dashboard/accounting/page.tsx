import Link from 'next/link';
import { getAccountingDashboard } from '@/app/actions/accounting-actions';

const sections = [
  { name: 'Dashboard', href: '/dashboard/accounting/dashboard' },
  { name: 'Chart of Accounts', href: '/dashboard/accounting/chart-of-accounts' },
  { name: 'Journal Entries', href: '/dashboard/accounting/journal-entries' },
  { name: 'Ledger', href: '/dashboard/accounting/ledger' },
  { name: 'Trial Balance', href: '/dashboard/accounting/trial-balance' },
  { name: 'Profit & Loss', href: '/dashboard/accounting/profit-loss' },
  { name: 'Balance Sheet', href: '/dashboard/accounting/balance-sheet' },
  { name: 'Cash Book', href: '/dashboard/accounting/cash-book' },
  { name: 'Bank Book', href: '/dashboard/accounting/bank-book' },
  { name: 'Day Book', href: '/dashboard/accounting/day-book' },
  { name: 'GST Reports', href: '/dashboard/accounting/gst-reports' },
  { name: 'Financial Year Settings', href: '/dashboard/accounting/financial-year' },
];

export default async function AccountingPage() {
  const dashboard = await getAccountingDashboard();

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Comprehensive Accounting</h1>
            <p className="text-sm text-slate-600">Real-time accounting reports using journal entries from the ERP workflow.</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border bg-white p-4 shadow-sm"><div className="text-sm text-slate-500">Today’s Income</div><div className="mt-2 text-2xl font-semibold">₹{Number(dashboard.kpis.todaysIncome || 0).toFixed(2)}</div></div>
          <div className="rounded-xl border bg-white p-4 shadow-sm"><div className="text-sm text-slate-500">Today’s Expense</div><div className="mt-2 text-2xl font-semibold">₹{Number(dashboard.kpis.todaysExpense || 0).toFixed(2)}</div></div>
          <div className="rounded-xl border bg-white p-4 shadow-sm"><div className="text-sm text-slate-500">Cash Balance</div><div className="mt-2 text-2xl font-semibold">₹{Number(dashboard.kpis.cashBalance || 0).toFixed(2)}</div></div>
          <div className="rounded-xl border bg-white p-4 shadow-sm"><div className="text-sm text-slate-500">Bank Balance</div><div className="mt-2 text-2xl font-semibold">₹{Number(dashboard.kpis.bankBalance || 0).toFixed(2)}</div></div>
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Accounting Modules</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sections.map((item) => (
              <Link key={item.href} href={item.href} className="rounded-lg border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-blue-500 hover:text-blue-600">
                {item.name}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
