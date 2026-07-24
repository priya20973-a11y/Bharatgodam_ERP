import { getAccounts, getAccountingBankBook, getAccountingCashBook, getAccountingDayBook, getAccountingGstReports, getAccountingJournals, getAccountingLedger, getAccountingProfitLoss, getAccountingBalanceSheet, getAccountingTrialBalance, getFinancialYears, getAccountingDashboard, initializeAccountingModule } from '@/app/actions/accounting-actions';
import CreateJournalEntryForm from '@/components/features/accounting/create-journal-entry-form';
import { notFound } from 'next/navigation';

const sectionLabels: Record<string, string> = {
  dashboard: 'Dashboard',
  'chart-of-accounts': 'Chart of Accounts',
  'journal-entries': 'Journal Entries',
  ledger: 'Ledger',
  'trial-balance': 'Trial Balance',
  'profit-loss': 'Profit & Loss',
  'balance-sheet': 'Balance Sheet',
  'cash-book': 'Cash Book',
  'bank-book': 'Bank Book',
  'day-book': 'Day Book',
  'gst-reports': 'GST Reports',
  'financial-year': 'Financial Year Settings',
};

function renderTable(rows: any[], columns: string[]) {
  if (!rows || rows.length === 0) {
    return <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">No data available.</div>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-100 text-left text-slate-700">
          <tr>
            {columns.map((column) => (
              <th key={column} className="px-3 py-2 font-medium">{column}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {rows.map((row, index) => (
            <tr key={`${row._id?.toString?.() || index}-${index}`} className="hover:bg-slate-50">
              {columns.map((column) => (
                <td key={column} className="px-3 py-2 text-slate-700">{String((row as any)[column] ?? '')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function AccountingSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const resolvedParams = await params;
  const section = resolvedParams.section;
  const title = sectionLabels[section] || 'Accounting';

  if (!sectionLabels[section]) {
    notFound();
  }

  await initializeAccountingModule();

  if (section === 'dashboard') {
    const dashboard = await getAccountingDashboard();
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border bg-white p-4 shadow-sm"><div className="text-sm text-slate-500">Today’s Income</div><div className="mt-2 text-2xl font-semibold">₹{Number(dashboard.kpis.todaysIncome || 0).toFixed(2)}</div></div>
            <div className="rounded-xl border bg-white p-4 shadow-sm"><div className="text-sm text-slate-500">Today’s Expense</div><div className="mt-2 text-2xl font-semibold">₹{Number(dashboard.kpis.todaysExpense || 0).toFixed(2)}</div></div>
            <div className="rounded-xl border bg-white p-4 shadow-sm"><div className="text-sm text-slate-500">Cash Balance</div><div className="mt-2 text-2xl font-semibold">₹{Number(dashboard.kpis.cashBalance || 0).toFixed(2)}</div></div>
            <div className="rounded-xl border bg-white p-4 shadow-sm"><div className="text-sm text-slate-500">Bank Balance</div><div className="mt-2 text-2xl font-semibold">₹{Number(dashboard.kpis.bankBalance || 0).toFixed(2)}</div></div>
          </div>
        </div>
      </div>
    );
  }

  if (section === 'chart-of-accounts') {
    const accounts = await getAccounts();
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          {renderTable(accounts.map((account: any) => ({
            _id: account.id,
            code: account.code,
            name: account.name,
            type: account.type,
            parent: account.parent,
          })), ['code', 'name', 'type', 'parent'])}
        </div>
      </div>
    );
  }

  if (section === 'journal-entries') {
    const journals = await getAccountingJournals();
    const accounts = await getAccounts();
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          <CreateJournalEntryForm accounts={accounts} />
          {renderTable(journals.map((entry: any) => ({
            _id: entry._id?.toString?.(),
            entryDate: entry.entryDate,
            voucherNumber: entry.voucherNumber,
            narration: entry.narration,
            totalDebit: entry.totalDebit,
            totalCredit: entry.totalCredit,
            createdBy: entry.createdBy,
          })), ['entryDate', 'voucherNumber', 'narration', 'totalDebit', 'totalCredit', 'createdBy'])}
        </div>
      </div>
    );
  }

  if (section === 'ledger') {
    const ledger = await getAccountingLedger();
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          {renderTable(ledger.map((row: any) => ({
            accountName: row.accountName,
            accountType: row.accountType,
            openingBalance: row.openingBalance,
            debitTotal: row.debitTotal,
            creditTotal: row.creditTotal,
            closingBalance: row.closingBalance,
          })), ['accountName', 'accountType', 'openingBalance', 'debitTotal', 'creditTotal', 'closingBalance'])}
        </div>
      </div>
    );
  }

  if (section === 'trial-balance') {
    const trial = await getAccountingTrialBalance();
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          {renderTable(trial.rows.map((row: any) => ({
            accountName: row.accountName,
            accountType: row.accountType,
            openingBalance: row.openingBalance,
            debit: row.debit,
            credit: row.credit,
            closingBalance: row.closingBalance,
          })), ['accountName', 'accountType', 'openingBalance', 'debit', 'credit', 'closingBalance'])}
          <div className="rounded-xl border bg-white p-4 text-sm">Balanced: {trial.balanced ? 'Yes' : 'No'} | Total Debit: {trial.totalDebit} | Total Credit: {trial.totalCredit}</div>
        </div>
      </div>
    );
  }

  if (section === 'profit-loss') {
    const pl = await getAccountingProfitLoss();
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-5xl space-y-6">
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border bg-white p-4"><div className="text-sm text-slate-500">Income</div><div className="text-2xl font-semibold">₹{Number(pl.income || 0).toFixed(2)}</div></div>
            <div className="rounded-xl border bg-white p-4"><div className="text-sm text-slate-500">Expense</div><div className="text-2xl font-semibold">₹{Number(pl.expense || 0).toFixed(2)}</div></div>
            <div className="rounded-xl border bg-white p-4"><div className="text-sm text-slate-500">Gross Profit</div><div className="text-2xl font-semibold">₹{Number(pl.grossProfit || 0).toFixed(2)}</div></div>
            <div className="rounded-xl border bg-white p-4"><div className="text-sm text-slate-500">Net Profit</div><div className="text-2xl font-semibold">₹{Number(pl.netProfit || 0).toFixed(2)}</div></div>
          </div>
        </div>
      </div>
    );
  }

  if (section === 'balance-sheet') {
    const sheet = await getAccountingBalanceSheet();
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-5xl space-y-6">
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border bg-white p-4"><div className="text-sm text-slate-500">Total Assets</div><div className="text-2xl font-semibold">₹{Number(sheet.assets || 0).toFixed(2)}</div></div>
            <div className="rounded-xl border bg-white p-4"><div className="text-sm text-slate-500">Total Liabilities</div><div className="text-2xl font-semibold">₹{Number(sheet.liabilities || 0).toFixed(2)}</div></div>
            <div className="rounded-xl border bg-white p-4"><div className="text-sm text-slate-500">Capital</div><div className="text-2xl font-semibold">₹{Number(sheet.capital || 0).toFixed(2)}</div></div>
          </div>
          <div className="rounded-xl border bg-white p-4 text-sm">Balanced: {sheet.balanced ? 'Yes' : 'No'}</div>
        </div>
      </div>
    );
  }

  if (section === 'cash-book') {
    const cash = await getAccountingCashBook();
    return (<div className="min-h-screen bg-slate-50 p-6"><div className="mx-auto max-w-7xl space-y-6"><h1 className="text-2xl font-bold text-slate-900">{title}</h1>{renderTable(cash.map((row: any) => ({ entryDate: row.entryDate, voucherNumber: row.voucherNumber, narration: row.narration, debit: row.lines?.debit, credit: row.lines?.credit })), ['entryDate', 'voucherNumber', 'narration', 'debit', 'credit'])}</div></div>);
  }

  if (section === 'bank-book') {
    const bank = await getAccountingBankBook();
    return (<div className="min-h-screen bg-slate-50 p-6"><div className="mx-auto max-w-7xl space-y-6"><h1 className="text-2xl font-bold text-slate-900">{title}</h1>{renderTable(bank.map((row: any) => ({ entryDate: row.entryDate, voucherNumber: row.voucherNumber, narration: row.narration, debit: row.lines?.debit, credit: row.lines?.credit })), ['entryDate', 'voucherNumber', 'narration', 'debit', 'credit'])}</div></div>);
  }

  if (section === 'day-book') {
    const dayBook = await getAccountingDayBook();
    return (<div className="min-h-screen bg-slate-50 p-6"><div className="mx-auto max-w-7xl space-y-6"><h1 className="text-2xl font-bold text-slate-900">{title}</h1>{renderTable(dayBook.map((row: any) => ({ entryDate: row.entryDate, voucherNumber: row.voucherNumber, narration: row.narration, totalDebit: row.totalDebit, totalCredit: row.totalCredit })), ['entryDate', 'voucherNumber', 'narration', 'totalDebit', 'totalCredit'])}</div></div>);
  }

  if (section === 'gst-reports') {
    const gst = await getAccountingGstReports();
    return (<div className="min-h-screen bg-slate-50 p-6"><div className="mx-auto max-w-7xl space-y-6"><h1 className="text-2xl font-bold text-slate-900">{title}</h1>{renderTable(gst.map((row: any) => ({ entryDate: row.entryDate, voucherNumber: row.voucherNumber, narration: row.narration, debit: row.lines?.debit, credit: row.lines?.credit })), ['entryDate', 'voucherNumber', 'narration', 'debit', 'credit'])}</div></div>);
  }

  if (section === 'financial-year') {
    const years = await getFinancialYears();
    return (<div className="min-h-screen bg-slate-50 p-6"><div className="mx-auto max-w-7xl space-y-6"><h1 className="text-2xl font-bold text-slate-900">{title}</h1>{renderTable(years.map((year: any) => ({ year: year.year, startDate: year.startDate, endDate: year.endDate, status: year.status, locked: year.locked ? 'Yes' : 'No' })), ['year', 'startDate', 'endDate', 'status', 'locked'])}</div></div>);
  }

  return null;
}
