'use server';

import { getDb } from '@/lib/mongodb';
import { authOptions } from '@/lib/auth';
import { getServerSession } from 'next-auth';
import { getTenantFilterForMongo, isAdmin, requireSession } from '@/lib/ownership';
import { ensureDefaultChartOfAccounts, ensureFinancialYear, getJournalEntryList, getLedgerRows, getTrialBalance, getProfitLossData, getBalanceSheetData, postJournalEntry, buildAccountingDashboard } from '@/lib/accounting';
import { ObjectId } from 'mongodb';
import { revalidatePath } from 'next/cache';

const ACCOUNTING_EDIT_ROLES = ['ADMIN', 'ACCOUNTANT'];

function canEditAccounting(session: any) {
  const role = (session?.user as any)?.role?.toString().toUpperCase();
  return ACCOUNTING_EDIT_ROLES.includes(role || '');
}

export async function initializeAccountingModule() {
  await ensureDefaultChartOfAccounts();
  await ensureFinancialYear();
  return { success: true };
}

export async function getAccountingDashboard() {
  await initializeAccountingModule();
  return buildAccountingDashboard();
}

export async function getAccounts() {
  await initializeAccountingModule();
  const db = await getDb();
  const accounts = await db.collection('accounts').find({ status: 'ACTIVE' }).sort({ code: 1 }).toArray();

  return accounts.map((account: any) => ({
    id: account?._id?.toString?.() || '',
    code: account?.code || '',
    name: account?.name || '',
    type: account?.type || '',
    parent: account?.parent || '',
    status: account?.status || 'ACTIVE',
    createdAt: account?.createdAt ? new Date(account.createdAt).toISOString() : '',
    updatedAt: account?.updatedAt ? new Date(account.updatedAt).toISOString() : '',
  }));
}

export async function getAccountingJournals() {
  await initializeAccountingModule();
  return getJournalEntryList();
}

export async function createManualJournalEntry(payload: {
  entryDate: string;
  voucherNumber: string;
  debitAccountName: string;
  creditAccountName: string;
  amount: number;
  narration: string;
  warehouseId?: string;
  createdBy?: string;
}): Promise<{ success: true; entryId: string } | { success: false; message: string }> {
  const session = await requireSession();
  if (!canEditAccounting(session)) {
    return { success: false, message: 'Only Admin and Accountant can create accounting entries' };
  }

  if (!payload.entryDate || !payload.voucherNumber || !payload.debitAccountName || !payload.creditAccountName || !payload.amount) {
    return { success: false, message: 'Missing required accounting fields' };
  }

  const result = await postJournalEntry({
    ...payload,
    createdBy: payload.createdBy || session.user?.email || '',
    refType: 'MANUAL',
  });

  revalidatePath('/dashboard/accounting');
  return result;
}

export async function updateManualJournalEntry(entryId: string, payload: {
  entryDate: string;
  voucherNumber: string;
  debitAccountName: string;
  creditAccountName: string;
  amount: number;
  narration: string;
  warehouseId?: string;
}) {
  const session = await requireSession();
  if (!canEditAccounting(session)) {
    return { success: false, message: 'Only Admin and Accountant can edit accounting entries' };
  }

  const db = await getDb();
  const result = await db.collection('journal_entries').updateOne(
    { _id: new ObjectId(entryId) },
    { $set: { ...payload, updatedAt: new Date() } }
  );

  revalidatePath('/dashboard/accounting');
  return { success: result.modifiedCount > 0 };
}

export async function deleteManualJournalEntry(entryId: string) {
  const session = await requireSession();
  if (!canEditAccounting(session)) {
    return { success: false, message: 'Only Admin and Accountant can delete accounting entries' };
  }

  const db = await getDb();
  const result = await db.collection('journal_entries').deleteOne({ _id: new ObjectId(entryId) });
  revalidatePath('/dashboard/accounting');
  return { success: result.deletedCount > 0 };
}

export async function getAccountingLedger() {
  await initializeAccountingModule();
  return getLedgerRows();
}

export async function getAccountingTrialBalance() {
  await initializeAccountingModule();
  return getTrialBalance();
}

export async function getAccountingProfitLoss() {
  await initializeAccountingModule();
  return getProfitLossData();
}

export async function getAccountingBalanceSheet() {
  await initializeAccountingModule();
  return getBalanceSheetData();
}

export async function getFinancialYears() {
  await initializeAccountingModule();
  const db = await getDb();
  return db.collection('financial_years').find({}).sort({ year: 1 }).toArray();
}

export async function saveFinancialYear(payload: {
  year: string;
  startDate: string;
  endDate: string;
  status?: 'OPEN' | 'CLOSED';
  locked?: boolean;
}) {
  const session = await requireSession();
  if (!canEditAccounting(session)) {
    return { success: false, message: 'Only Admin and Accountant can manage financial years' };
  }

  const db = await getDb();
  const existing = await db.collection('financial_years').findOne({ year: payload.year });

  if (existing) {
    await db.collection('financial_years').updateOne(
      { _id: existing._id },
      { $set: { startDate: payload.startDate, endDate: payload.endDate, status: payload.status || existing.status, locked: !!payload.locked, updatedAt: new Date() } }
    );
  } else {
    await db.collection('financial_years').insertOne({
      year: payload.year,
      startDate: payload.startDate,
      endDate: payload.endDate,
      status: payload.status || 'OPEN',
      locked: !!payload.locked,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  revalidatePath('/dashboard/accounting');
  return { success: true };
}

export async function getAccountingCashBook() {
  await initializeAccountingModule();
  const db = await getDb();
  return db.collection('journal_entries').aggregate([
    { $unwind: '$lines' },
    { $match: { 'lines.accountName': 'Cash' } },
    { $sort: { entryDate: 1 } },
  ]).toArray();
}

export async function getAccountingBankBook() {
  await initializeAccountingModule();
  const db = await getDb();
  return db.collection('journal_entries').aggregate([
    { $unwind: '$lines' },
    { $match: { 'lines.accountName': 'Bank' } },
    { $sort: { entryDate: 1 } },
  ]).toArray();
}

export async function getAccountingDayBook() {
  await initializeAccountingModule();
  return getJournalEntryList();
}

export async function getAccountingGstReports() {
  await initializeAccountingModule();
  const db = await getDb();
  const rows = await db.collection('journal_entries').aggregate([
    { $unwind: '$lines' },
    { $match: { 'lines.accountName': 'GST Payable' } },
    { $sort: { entryDate: 1 } },
  ]).toArray();
  return rows;
}
