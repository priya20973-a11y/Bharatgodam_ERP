import { getDb } from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ObjectId } from 'mongodb';

export type AccountingAccountType = 'ASSET' | 'LIABILITY' | 'INCOME' | 'EXPENSE';

const DEFAULT_ACCOUNT_HEADS = [
  { code: '1001', name: 'Cash', type: 'ASSET' as const, parent: 'Assets' },
  { code: '1002', name: 'Bank', type: 'ASSET' as const, parent: 'Assets' },
  { code: '1003', name: 'Accounts Receivable', type: 'ASSET' as const, parent: 'Assets' },
  { code: '1004', name: 'Security Deposit', type: 'ASSET' as const, parent: 'Assets' },
  { code: '1005', name: 'Inventory', type: 'ASSET' as const, parent: 'Assets' },
  { code: '1006', name: 'Fixed Assets', type: 'ASSET' as const, parent: 'Assets' },
  { code: '2001', name: 'Accounts Payable', type: 'LIABILITY' as const, parent: 'Liabilities' },
  { code: '2002', name: 'GST Payable', type: 'LIABILITY' as const, parent: 'Liabilities' },
  { code: '2003', name: 'Loans', type: 'LIABILITY' as const, parent: 'Liabilities' },
  { code: '3001', name: 'Warehouse Rent', type: 'INCOME' as const, parent: 'Income' },
  { code: '3002', name: 'Cold Storage Charges', type: 'INCOME' as const, parent: 'Income' },
  { code: '3003', name: 'Handling Charges', type: 'INCOME' as const, parent: 'Income' },
  { code: '3004', name: 'Loading Charges', type: 'INCOME' as const, parent: 'Income' },
  { code: '3005', name: 'Unloading Charges', type: 'INCOME' as const, parent: 'Income' },
  { code: '3006', name: 'Labour Charges', type: 'INCOME' as const, parent: 'Income' },
  { code: '3007', name: 'Transportation Income', type: 'INCOME' as const, parent: 'Income' },
  { code: '3008', name: 'Miscellaneous Income', type: 'INCOME' as const, parent: 'Income' },
  { code: '4001', name: 'Electricity', type: 'EXPENSE' as const, parent: 'Expenses' },
  { code: '4002', name: 'Diesel', type: 'EXPENSE' as const, parent: 'Expenses' },
  { code: '4003', name: 'Labour Expense', type: 'EXPENSE' as const, parent: 'Expenses' },
  { code: '4004', name: 'Repair & Maintenance', type: 'EXPENSE' as const, parent: 'Expenses' },
  { code: '4005', name: 'Office Expense', type: 'EXPENSE' as const, parent: 'Expenses' },
  { code: '4006', name: 'Salary', type: 'EXPENSE' as const, parent: 'Expenses' },
  { code: '4007', name: 'Internet', type: 'EXPENSE' as const, parent: 'Expenses' },
  { code: '4008', name: 'Software Subscription', type: 'EXPENSE' as const, parent: 'Expenses' },
  { code: '4009', name: 'Miscellaneous Expense', type: 'EXPENSE' as const, parent: 'Expenses' },
];

export async function ensureDefaultChartOfAccounts() {
  const db = await getDb();
  const existingAccounts = await db.collection('accounts').find({}).toArray();

  if (existingAccounts.length > 0) {
    return existingAccounts;
  }

  await db.collection('accounts').insertMany(
    DEFAULT_ACCOUNT_HEADS.map((account) => ({
      ...account,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    }))
  );

  return db.collection('accounts').find({}).toArray();
}

export async function getAccountMap() {
  const accounts = await ensureDefaultChartOfAccounts();
  return new Map(accounts.map((account: any) => [account.name.toLowerCase(), account]));
}

export async function ensureFinancialYear(year?: string) {
  const db = await getDb();
  const currentYear = year || new Date().getFullYear().toString();
  const openYear = await db.collection('financial_years').findOne({ year: currentYear });

  if (openYear) {
    return openYear;
  }

  const fy = {
    year: currentYear,
    startDate: `${currentYear}-04-01`,
    endDate: `${Number(currentYear) + 1}-03-31`,
    status: 'OPEN',
    locked: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.collection('financial_years').insertOne(fy);
  return fy;
}

export async function getFinancialYearForEntry(entryDate?: string) {
  const db = await getDb();
  const date = entryDate ? new Date(entryDate) : new Date();
  const year = date.getFullYear();
  const fy = await db.collection('financial_years').findOne({ year: year.toString() });
  return fy || (await ensureFinancialYear(year.toString()));
}

export async function postJournalEntry(params: {
  entryDate: string;
  voucherNumber: string;
  narration: string;
  debitAccountName: string;
  creditAccountName: string;
  amount: number;
  warehouseId?: string;
  refType?: string;
  referenceId?: string;
  createdBy?: string;
}) {
  const db = await getDb();
  const session = await getServerSession(authOptions);
  const financialYear = await getFinancialYearForEntry(params.entryDate);

  if (financialYear?.status === 'CLOSED' || financialYear?.locked) {
    throw new Error('Financial year is closed and cannot accept new postings');
  }

  const accountMap = await getAccountMap();
  const debitAccount = accountMap.get(params.debitAccountName.toLowerCase());
  const creditAccount = accountMap.get(params.creditAccountName.toLowerCase());

  if (!debitAccount || !creditAccount) {
    throw new Error('Invalid account head mapping');
  }

  const lines = [
    {
      accountId: debitAccount._id,
      accountCode: debitAccount.code,
      accountName: debitAccount.name,
      debit: Number(params.amount || 0),
      credit: 0,
    },
    {
      accountId: creditAccount._id,
      accountCode: creditAccount.code,
      accountName: creditAccount.name,
      debit: 0,
      credit: Number(params.amount || 0),
    },
  ];

  const entry = {
    financialYearId: (financialYear as any)?._id ?? null,
    entryDate: params.entryDate,
    voucherNumber: params.voucherNumber,
    narration: params.narration || 'Auto posted from ERP workflow',
    warehouseId: params.warehouseId ? new ObjectId(params.warehouseId) : null,
    referenceType: params.refType || 'MANUAL',
    referenceId: params.referenceId ? new ObjectId(params.referenceId) : null,
    createdBy: params.createdBy || session?.user?.email || 'system',
    lines,
    totalDebit: Number(params.amount || 0),
    totalCredit: Number(params.amount || 0),
    status: 'POSTED',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await db.collection('journal_entries').insertOne(entry);
  return { success: true as const, entryId: result.insertedId.toString() };
}

export async function getJournalEntryList() {
  const db = await getDb();
  return db.collection('journal_entries').find({}).sort({ entryDate: -1, createdAt: -1 }).toArray();
}

export async function getLedgerRows() {
  const db = await getDb();
  const journalEntries = await db.collection('journal_entries').find({}).sort({ entryDate: 1 }).toArray();
  const accounts = await ensureDefaultChartOfAccounts();

  const ledger: Record<string, any[]> = {};

  for (const entry of journalEntries) {
    for (const line of entry.lines || []) {
      const key = line.accountId?.toString();
      if (!ledger[key]) ledger[key] = [];
      ledger[key].push({
        voucherNumber: entry.voucherNumber,
        entryDate: entry.entryDate,
        narration: entry.narration,
        debit: line.debit || 0,
        credit: line.credit || 0,
      });
    }
  }

  return accounts.map((account: any) => {
    const rows = ledger[account._id.toString()] || [];
    const debitTotal = rows.reduce((sum: number, row: any) => sum + Number(row.debit || 0), 0);
    const creditTotal = rows.reduce((sum: number, row: any) => sum + Number(row.credit || 0), 0);
    const openingBalance = 0;
    const closingBalance = debitTotal - creditTotal;

    return {
      accountId: account._id.toString(),
      accountName: account.name,
      accountType: account.type,
      openingBalance,
      debitTotal,
      creditTotal,
      closingBalance,
      rows,
    };
  });
}

export async function getTrialBalance() {
  const accounts = await ensureDefaultChartOfAccounts();
  const ledgerRows = await getLedgerRows();

  const materialized = ledgerRows.map((row: any) => {
    const debit = row.accountType === 'ASSET' || row.accountType === 'EXPENSE' ? row.debitTotal : 0;
    const credit = row.accountType === 'LIABILITY' || row.accountType === 'INCOME' ? row.creditTotal : 0;

    return {
      accountName: row.accountName,
      accountType: row.accountType,
      openingBalance: row.openingBalance,
      debit,
      credit,
      closingBalance: row.closingBalance,
    };
  });

  const totalDebit = materialized.reduce((sum, row) => sum + Number(row.debit || 0), 0);
  const totalCredit = materialized.reduce((sum, row) => sum + Number(row.credit || 0), 0);

  return { rows: materialized, totalDebit, totalCredit, balanced: totalDebit === totalCredit };
}

export async function getProfitLossData() {
  const accounts = await ensureDefaultChartOfAccounts();
  const incomes = accounts.filter((a: any) => a.type === 'INCOME');
  const expenses = accounts.filter((a: any) => a.type === 'EXPENSE');
  const journalEntries = await getJournalEntryList();

  const income = incomes.reduce((sum: number, account: any) => {
    const amount = journalEntries.reduce((innerSum: number, entry: any) => {
      const line = (entry.lines || []).find((item: any) => item.accountId?.toString() === account._id.toString());
      return innerSum + Number(line?.credit || 0);
    }, 0);
    return sum + amount;
  }, 0);

  const expense = expenses.reduce((sum: number, account: any) => {
    const amount = journalEntries.reduce((innerSum: number, entry: any) => {
      const line = (entry.lines || []).find((item: any) => item.accountId?.toString() === account._id.toString());
      return innerSum + Number(line?.debit || 0);
    }, 0);
    return sum + amount;
  }, 0);

  return {
    income,
    expense,
    grossProfit: income - expense,
    operatingProfit: income - expense,
    netProfit: income - expense,
  };
}

export async function getBalanceSheetData() {
  const accounts = await ensureDefaultChartOfAccounts();
  const journalEntries = await getJournalEntryList();

  const currentAssets = accounts.filter((a: any) => a.type === 'ASSET');
  const liabilities = accounts.filter((a: any) => a.type === 'LIABILITY');
  const income = accounts.filter((a: any) => a.type === 'INCOME');

  const assetTotal = currentAssets.reduce((sum: number, account: any) => {
    const amount = journalEntries.reduce((innerSum: number, entry: any) => {
      const line = (entry.lines || []).find((item: any) => item.accountId?.toString() === account._id.toString());
      return innerSum + Number(line?.debit || 0) - Number(line?.credit || 0);
    }, 0);
    return sum + amount;
  }, 0);

  const liabilityTotal = liabilities.reduce((sum: number, account: any) => {
    const amount = journalEntries.reduce((innerSum: number, entry: any) => {
      const line = (entry.lines || []).find((item: any) => item.accountId?.toString() === account._id.toString());
      return innerSum + Number(line?.credit || 0) - Number(line?.debit || 0);
    }, 0);
    return sum + amount;
  }, 0);

  const retainedEarnings = income.reduce((sum: number, account: any) => {
    const amount = journalEntries.reduce((innerSum: number, entry: any) => {
      const line = (entry.lines || []).find((item: any) => item.accountId?.toString() === account._id.toString());
      return innerSum + Number(line?.credit || 0) - Number(line?.debit || 0);
    }, 0);
    return sum + amount;
  }, 0);

  return {
    assets: assetTotal,
    liabilities: liabilityTotal,
    capital: retainedEarnings,
    balanced: assetTotal === liabilityTotal + retainedEarnings,
  };
}

export async function buildAccountingDashboard() {
  const db = await getDb();
  const accounts = await ensureDefaultChartOfAccounts();
  const journalEntries = await getJournalEntryList();
  const today = new Date().toISOString().slice(0, 10);

  const revenue = journalEntries.filter((entry: any) => entry.entryDate === today).reduce((sum: number, entry: any) => {
    const bankOrCash = (entry.lines || []).find((line: any) => line.accountName === 'Cash' || line.accountName === 'Bank');
    return sum + Number(bankOrCash?.debit || 0);
  }, 0);

  const expense = journalEntries.filter((entry: any) => entry.entryDate === today).reduce((sum: number, entry: any) => {
    const expenseLine = (entry.lines || []).find((line: any) => line.accountName === 'Salary' || line.accountName === 'Office Expense' || line.accountName === 'Electricity');
    return sum + Number(expenseLine?.debit || 0);
  }, 0);

  const cashBalance = (await db.collection('journal_entries').aggregate([
    { $unwind: '$lines' },
    { $match: { 'lines.accountName': 'Cash' } },
    { $group: { _id: null, total: { $sum: { $subtract: ['$lines.debit', '$lines.credit'] } } } }
  ]).toArray())[0]?.total || 0;

  const bankBalance = (await db.collection('journal_entries').aggregate([
    { $unwind: '$lines' },
    { $match: { 'lines.accountName': 'Bank' } },
    { $group: { _id: null, total: { $sum: { $subtract: ['$lines.debit', '$lines.credit'] } } } }
  ]).toArray())[0]?.total || 0;

  return {
    kpis: {
      todaysIncome: revenue,
      todaysExpense: expense,
      outstandingReceivables: 0,
      outstandingPayables: 0,
      cashBalance,
      bankBalance,
      currentMonthProfit: 0,
      currentMonthRevenue: revenue,
    },
    accountCount: accounts.length,
    journalCount: journalEntries.length,
  };
}
