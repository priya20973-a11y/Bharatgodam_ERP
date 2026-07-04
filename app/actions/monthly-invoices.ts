'use server';

import { getDb } from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { formatTimeStateForDisplay } from '@/lib/ledger-time-state-engine';
import { calculateStorageDays } from '@/lib/storage-engine';

export interface MonthlyInvoiceData {
  bookingId: string;
  clientName: string;
  panNumber?: string;
  gstNumber?: string;
  month: string;
  year: number;
  periods: Array<{
    startDate: string;
    endDate: string;
    quantityMT: number;
    daysTotal: number;
    rentTotal: number;
    status: string;
    commodityName?: string;
    rate?: number;
    direction?: string;
    gatePass?: string;
  }>;
  transactions?: Array<{
    date: string;
    direction: 'INWARD' | 'OUTWARD';
    commodityName: string;
    quantityMT: number;
    gatePass?: string;
  }>;
  warehouseId?: string;
  warehouseName?: string;
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyEmail?: string;
  companyLogo?: string;
  companyGst?: string;
  companyPan?: string;
  bankName?: string;
  accountName?: string;
  bankAccountNumber?: string;
  ifscCode?: string;
  bankBranch?: string;
  companyTermsAndConditions?: string;
  totalRent: number;
  previousBalance?: number;
  currentPayments?: number;
  newBalance?: number;
  additionalCharges?: number;
  additionalChargeItems?: Array<{
    id?: string;
    name: string;
    amount: number;
    note?: string;
  }>;
  billingState?: string;
  taxGroup?: string;
  taxType?: string;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  totalTaxAmount?: number;
  adjustmentAmount?: number;
  invoiceDate: string;
  invoiceNumber?: string;
  notes?: string;
}

/**
 * Get monthly invoices for a client based on TIME-STATE ledger
 * Groups time-state periods by month to create monthly invoices
 */
export async function getClientMonthlyInvoicesTimeState(clientName: string) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return { success: false, message: 'Unauthorized' };
    }

    const db = await getDb();

    // Find client account
    const account = await db.collection('client_accounts').findOne({
      clientName: clientName,
    });

    if (!account) {
      return { success: false, message: 'Client not found' };
    }

    const accountId = account.bookingId;

    // Get all time-state entries for this account
    const timeStateEntries = await db
      .collection('ledger_time_state')
      .find({ accountId })
      .sort({ periodStartDate: 1 })
      .toArray();

    if (timeStateEntries.length === 0) {
      return { success: true, data: [], message: 'No transactions recorded yet' };
    }

    // Get payments for balance calculation
    const payments = await db
      .collection('payments')
      .find({ accountId })
      .sort({ date: 1 })
      .toArray();

    // Group periods by month
    const monthlyInvoices: MonthlyInvoiceData[] = [];
    const monthMap = new Map<string, typeof timeStateEntries>();

    for (const entry of timeStateEntries) {
      const date = new Date(entry.periodStartDate);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, []);
      }
      monthMap.get(monthKey)!.push(entry);
    }

    // Create invoice for each month
    let cumulativeBalance = 0;

    for (const [monthKey, entries] of monthMap) {
      const [year, month] = monthKey.split('-');
      const monthNumber = parseInt(month);
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

      // Calculate total rent for this month
      const monthlyRent = entries.reduce((sum, entry) => sum + (entry.rentCalculated || 0), 0);

      // Get payments for this month
      const monthPayments = payments.filter(p => {
        const paymentDate = new Date(p.date);
        return paymentDate.getFullYear() === parseInt(year) && 
               paymentDate.getMonth() === monthNumber - 1;
      });

      const monthlyPayments = monthPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

      // Format periods for display
      const periods = entries.map(entry => ({
        startDate: entry.periodStartDate,
        endDate: entry.periodEndDate,
        quantityMT: entry.quantityMT,
        daysTotal: calculateStorageDays(
          entry.periodStartDate,
          entry.periodEndDate || entry.periodStartDate,
          'COMPLETED'
        ),
        rentTotal: entry.rentCalculated || 0,
        status: entry.status,
      }));

      const previousBalance = cumulativeBalance;
      cumulativeBalance = previousBalance + monthlyRent - monthlyPayments;

      monthlyInvoices.push({
        bookingId: accountId,
        clientName,
        month: monthNames[monthNumber - 1],
        year: parseInt(year),
        periods,
        warehouseName: account.clientLocation || 'General',
        totalRent: monthlyRent,
        previousBalance,
        currentPayments: monthlyPayments,
        newBalance: cumulativeBalance,
        invoiceDate: new Date().toISOString().split('T')[0],
        bankName: account.bankName,
        accountName: account.accountName,
        bankAccountNumber: account.bankAccountNumber,
        ifscCode: account.ifscCode,
        bankBranch: account.bankBranch,
      });
    }

    return {
      success: true,
      data: monthlyInvoices,
    };
  } catch (error: any) {
    console.error('getClientMonthlyInvoicesTimeState error:', error);
    return {
      success: false,
      message: error.message || 'Failed to fetch invoices',
    };
  }
}

/**
 * Record a payment for a specific month's invoice
 */
export async function recordMonthlyPayment(
  accountId: string,
  amount: number,
  paymentMethod?: string,
  referenceNumber?: string
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return { success: false, message: 'Unauthorized' };
    }

    if (amount <= 0) {
      return { success: false, message: 'Payment amount must be greater than 0' };
    }

    const db = await getDb();

    // Check if account exists
    const account = await db.collection('client_accounts').findOne({
      bookingId: accountId,
    });

    if (!account) {
      return { success: false, message: 'Account not found' };
    }

    // Create payment record
    const payment = {
      accountId,
      date: new Date().toISOString().split('T')[0],
      amount: Number(amount),
      paymentMethod: paymentMethod || 'CASH',
      referenceNumber: referenceNumber || '',
      remarks: `Payment for ${new Date().toLocaleDateString()}`,
      recordedBy: session.user.email,
      createdAt: new Date(),
    };

    const result = await db.collection('payments').insertOne(payment);

    return {
      success: true,
      message: 'Payment recorded successfully',
      paymentId: result.insertedId.toString(),
    };
  } catch (error: any) {
    console.error('recordMonthlyPayment error:', error);
    return {
      success: false,
      message: error.message || 'Failed to record payment',
    };
  }
}

/**
 * Get account balance summary
 */
export async function getAccountBalance(accountId: string) {
  try {
    const db = await getDb();

    // Get account
    const account = await db.collection('client_accounts').findOne({
      bookingId: accountId,
    });

    if (!account) {
      return { success: false, message: 'Account not found' };
    }

    // Get all time-state entries
    const timeStateEntries = await db
      .collection('ledger_time_state')
      .find({ accountId })
      .toArray();

    const totalRent = timeStateEntries.reduce((sum, entry) => sum + (entry.rentCalculated || 0), 0);

    // Get all payments
    const payments = await db
      .collection('payments')
      .find({ accountId })
      .toArray();

    const totalPayments = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

    const balance = totalRent - totalPayments;

    return {
      success: true,
      data: {
        accountId,
        clientName: account.clientName,
        totalRent,
        totalPayments,
        balance,
        outstandingBalance: Math.max(0, balance),
      },
    };
  } catch (error: any) {
    console.error('getAccountBalance error:', error);
    return {
      success: false,
      message: error.message || 'Failed to fetch balance',
    };
  }
}
