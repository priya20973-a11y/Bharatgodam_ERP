'use client';

import { CalendarDays, FilePlus, Receipt, BookOpen, Landmark, Wallet, BadgeDollarSign, TrendingUp, ArrowLeft, LayoutDashboard, Scale, Banknote, Settings2, Repeat, FileText, FileMinus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const sectionGroups = [
  {
    title: 'Masters',
    items: [
      { key: 'chart-of-accounts', title: 'Chart of Accounts', description: 'Configure account names, groups, nature and opening balances.', icon: Landmark },
      { key: 'financial-year', title: 'Financial Year', description: 'Define the business year, lock dates and closing balance transfer.', icon: CalendarDays },
      { key: 'gst-settings', title: 'GST Settings', description: 'Manage GSTIN, rates, invoice prefixes and tax behavior.', icon: Receipt },
      { key: 'bank-accounts', title: 'Bank Accounts', description: 'Set up bank accounts, IFSC, opening balance and QR/UPI details.', icon: Banknote },
    ],
  },
  {
    title: 'Transactions',
    items: [
      { key: 'journal-entries', title: 'Journal Entries', description: 'Create manual vouchers for adjustments and corrections.', icon: FileText },
      { key: 'payment-voucher', title: 'Payment Voucher', description: 'Record payments made to vendors or expenses.', icon: FileMinus },
      { key: 'receipt-voucher', title: 'Receipt Voucher', description: 'Record payments received from clients and customers.', icon: FilePlus },
      { key: 'contra-voucher', title: 'Contra Voucher', description: 'Move amounts between cash and bank accounts.', icon: Repeat },
      { key: 'journal-voucher', title: 'Journal Voucher', description: 'Record non-cash accounting adjustments and reclassifications.', icon: FileText },
      { key: 'sales-invoice', title: 'Sales Invoice', description: 'Generate invoice entries from warehouse billing.', icon: FilePlus },
      { key: 'purchase-voucher', title: 'Purchase Voucher', description: 'Record vendor bills and purchase expenses.', icon: FileText },
    ],
  },
  {
    title: 'Reports',
    items: [
      { key: 'dashboard', title: 'Dashboard', description: 'Key KPIs: revenue, balances and receivables.', icon: LayoutDashboard },
      { key: 'trial-balance', title: 'Trial Balance', description: 'Check that debits and credits are in balance.', icon: Scale },
      { key: 'ledger', title: 'Ledger', description: 'View account-wise transaction history and balances.', icon: BookOpen },
      { key: 'cash-book', title: 'Cash Book', description: 'Track cash receipts and payments.', icon: BadgeDollarSign },
      { key: 'bank-book', title: 'Bank Book', description: 'Track bank receipts and payments.', icon: Banknote },
      { key: 'profit-loss', title: 'Profit & Loss', description: 'Review income and expense performance.', icon: TrendingUp },
      { key: 'balance-sheet', title: 'Balance Sheet', description: 'Review assets, liabilities and capital positions.', icon: Wallet },
      { key: 'day-book', title: 'Day Book', description: 'See all accounting transactions in one place.', icon: CalendarDays },
      { key: 'gst-reports', title: 'GST Reports', description: 'View GST output, input and net tax positions.', icon: Receipt },
    ],
  },
  {
    title: 'Settings',
    items: [
      { key: 'accounting-settings', title: 'Accounting Settings', description: 'Configure approval, voucher and automation settings.', icon: Settings2 },
    ],
  },
];

export default function ColdAccountingClient() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="rounded-lg border border-slate-300 bg-white p-2 text-slate-600 hover:bg-slate-100">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Cold Storage Accounting</h1>
            <p className="text-sm text-slate-600">Tally-style accounting for warehouse income, expenses and financial reporting.</p>
          </div>
        </div>

        <div className="space-y-10">
          {sectionGroups.map((group) => (
            <div key={group.title} className="space-y-4">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <h2 className="text-xl font-semibold text-slate-900">{group.title}</h2>
                <p className="mt-2 text-sm text-slate-600">{group.title === 'Masters' ? 'Configure your core accounting setup.' : group.title === 'Transactions' ? 'Enter vouchers and operational accounting documents.' : group.title === 'Reports' ? 'Run financial reports and statements.' : 'Manage accounting behavior and automation.'}</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {group.items.map((section) => {
                  const Icon = section.icon;
                  return (
                    <Link key={section.key} href={`/cold/accounting/${section.key}`} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-semibold text-slate-900">{section.title}</h3>
                          <p className="mt-2 text-sm text-slate-600">{section.description}</p>
                        </div>
                        <div className="rounded-xl bg-blue-50 p-2 text-blue-600">
                          <Icon className="h-5 w-5" />
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
