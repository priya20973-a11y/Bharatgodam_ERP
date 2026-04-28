'use server';

import { getDb } from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ObjectId } from 'mongodb';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { calculateLedger, Transaction, Payment, LedgerSummary, LedgerEntry } from '@/lib/ledger-engine';
import { getTenantFilterForMongo, isAdmin, requireSession } from '@/lib/ownership';
import type { ILogisticsBooking } from '@/types/schemas';

/**
 * Notify revenue distribution system with retry logic and timeout
 */
async function notifyRevenueSystem(
  revenueApiUrl: string,
  payload: object,
  maxRetries: number = 3
): Promise<boolean> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      const response = await fetch(`${revenueApiUrl}/api/payment-success`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        console.log('✓ Revenue notification sent successfully');
        return true;
      }

      const errorText = await response.text();
      console.warn(`Revenue API returned ${response.status}: ${errorText}`);
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff: 1s, 2s, 4s
        console.warn(
          `Revenue notification attempt ${attempt}/${maxRetries} failed, retrying in ${delay}ms: ${lastError.message}`
        );
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  console.error(`✗ Revenue notification failed after ${maxRetries} attempts:`, lastError?.message);
  return false;
}

export async function fetchUserInvoices() {
  const session = await requireSession();
  if (!session.user) throw new Error('User not authenticated');
  const db = await getDb();
  const tenantFilter = getTenantFilterForMongo(session);
  const query: any = isAdmin(session)
    ? {}
    : { $or: [tenantFilter, { clientEmail: session.user.email }] };

  // Fetch actual formal invoices from the database
  const invoices = await db.collection('invoices')
    .find(query)
    .sort({ generatedAt: -1 })
    .toArray();

  // MUST stringify ObjectIds and Dates to avoid "Only plain objects can be passed to Client Components" error
  return invoices.map(inv => ({
    id: inv._id.toString(),
    bookingId: inv.bookingId.toString(),
    clientEmail: inv.clientEmail,
    customerName: inv.customerName,
    commodity: inv.commodity,
    durationDays: inv.durationDays,
    rateApplied: inv.rateApplied,
    subtotal: inv.subtotal,
    totalAmount: inv.totalAmount,
    paidAmount: inv.paidAmount || 0,
    pendingAmount: (inv.totalAmount || 0) - (inv.paidAmount || 0), // Calculate dynamically
    status: inv.status,
    generatedAt: inv.generatedAt ? inv.generatedAt.toISOString() : new Date().toISOString()
  }));
}

/**
 * Fetch invoice master records for the current user
 */
export async function fetchInvoiceMasters() {
  const session = await requireSession();
  if (!session.user) throw new Error('User not authenticated');
  const db = await getDb();
  const tenantFilter = getTenantFilterForMongo(session);
  const query: any = isAdmin(session)
    ? {}
    : { $or: [tenantFilter, { clientEmail: session.user.email }] };

  const invoices = await db.collection('invoices')
    .find(query)
    .sort({ generatedAt: -1 })
    .toArray();

  if (!invoices || invoices.length === 0) {
    return [];
  }

  // Get all clients for lookup
  const clientIds = [...new Set(invoices.map(inv => inv.clientId).filter(id => id))];
  const clients = await db.collection('clients')
    .find({ _id: { $in: clientIds } })
    .toArray();
  const clientMap = new Map(clients.map(c => [c._id.toString(), c]));

  // Get warehouse names
  const warehouseIds = [...new Set(invoices.map(inv => inv.warehouseId).filter(id => id))];
  const warehouses = await db.collection('warehouses')
    .find({ _id: { $in: warehouseIds } })
    .toArray();

  const warehouseMap = new Map(warehouses.map(w => [w._id.toString(), w.name]));

  // MUST stringify ObjectIds and Dates to avoid "Only plain objects can be passed to Client Components" error
  return invoices.map(inv => {
    const client = clientMap.get(inv.clientId?.toString());
    const commodities = (inv.items || []).map((item: any) => item.commodityName).filter(Boolean);
    return {
      id: inv._id.toString(),
      clientId: inv.clientId?.toString() || '',
      warehouseId: inv.warehouseId?.toString() || '',
      warehouseName: warehouseMap.get(inv.warehouseId?.toString()) || 'Unknown Warehouse',
      customerName: client?.name || 'Unknown Client',
      commodity: commodities.join(', ') || 'Multiple Commodities',
      invoiceMonth: inv.cycleName || new Date().toISOString().slice(0, 7),
      totalAmount: inv.totalAmount || 0,
      paidAmount: inv.paidAmount || 0,
      pendingAmount: (inv.totalAmount || 0) - (inv.paidAmount || 0),
      status: inv.status || 'ACTIVE',
      generatedAt: inv.generatedAt ? inv.generatedAt.toISOString() : new Date().toISOString(),
      dueDate: new Date(new Date(inv.generatedAt || new Date()).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: inv.createdAt ? inv.createdAt.toISOString() : new Date().toISOString(),
      updatedAt: inv.updatedAt ? inv.updatedAt.toISOString() : new Date().toISOString()
    };
  });
}

export interface UnifiedInvoiceData {
  clientId: string;
  clientName: string;
  bookings: ILogisticsBooking[];
  transactions: Transaction[];
  payments: Payment[];
  ledgerSummary: LedgerSummary;
  totalBalance: number;
}

export async function getUnifiedFinancials(
  clientId: string
): Promise<{ success: boolean; data?: UnifiedInvoiceData; message?: string }> {
  try {
    const session = await requireSession();
    if (!session.user) throw new Error('User not authenticated');
    const trimmedId = clientId?.trim();
    if (!trimmedId) {
      return { success: false, message: 'Client ID is required' };
    }

    const db = await getDb();
    const tenantFilter = getTenantFilterForMongo(session);
    const sharedFilter: any = isAdmin(session)
      ? {}
      : { $or: [tenantFilter, { userEmail: session.user.email }] };

    const [bookings, transactionDocs, paymentDocs, outstandingInvoicesResult, commoditiesResult] = await Promise.all([
      db.collection('bookings')
        .find({ accountId: trimmedId, ...sharedFilter })
        .sort({ date: 1 })
        .toArray(),
      db.collection('transactions')
        .find({ accountId: trimmedId, ...sharedFilter })
        .sort({ date: 1 })
        .toArray(),
      db.collection('payments')
        .find({ accountId: trimmedId, ...sharedFilter })
        .sort({ date: 1 })
        .toArray(),
      db.collection('invoices')
        .aggregate([
          { $match: { clientId: new ObjectId(trimmedId), status: { $ne: 'PAID' }, ...sharedFilter } },
          { $group: { _id: null, totalOutstanding: { $sum: '$totalAmount' } } }
        ])
        .toArray(),
      db.collection('commodities')
        .find({})
        .toArray(),
    ]);

    const clientName =
      bookings[0]?.clientName || transactionDocs[0]?.clientName || 'Unknown Client';

    const normalizeDate = (value: unknown) => {
      if (value instanceof Date) {
        return value.toISOString().split('T')[0];
      }
      if (typeof value === 'string' && value.trim().length > 0) {
        return value;
      }
      return String(value || '');
    };

    const bookingTransactions: Transaction[] = bookings.map((booking: any) => ({
      _id: booking._id?.toString() || '',
      date: normalizeDate(booking.date),
      direction: booking.direction,
      mt: booking.mt,
      clientName: booking.clientName,
      commodityName: booking.commodityName,
      gatePass: booking.gatePass,
    }));

    const additionalTransactions: Transaction[] = transactionDocs.map((txn: any) => ({
      _id: txn._id?.toString() || '',
      date: normalizeDate(txn.date),
      direction: txn.direction,
      mt: txn.quantityMT,
      clientName: txn.clientName || clientName,
      commodityName: txn.commodityName,
      gatePass: txn.gatePass || '',
    }));

    const transactions: Transaction[] = Array.from(
      new Map(
        [...bookingTransactions, ...additionalTransactions].map((txn) => [txn._id, txn])
      ).values()
    ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const payments: Payment[] = paymentDocs.map((payment: any) => ({
      _id: payment._id?.toString() || '',
      date: normalizeDate(payment.date),
      amount: payment.amount,
      clientName: payment.clientName || clientName,
    }));

    // Calculate outstanding invoices amount
    const outstandingInvoices = outstandingInvoicesResult.length > 0 
      ? outstandingInvoicesResult[0].totalOutstanding || 0 
      : 0;

    // Create a map of commodity name -> rate per day per MT
    const commodityRates = new Map<string, number>();
    commoditiesResult.forEach((commodity: any) => {
      if (commodity.name && commodity.ratePerDayPerMT) {
        commodityRates.set(commodity.name, commodity.ratePerDayPerMT);
      }
    });

    const ledgerSummary = calculateLedger(transactions, payments, clientName, outstandingInvoices, commodityRates);

    return {
      success: true,
      data: {
        clientId: trimmedId,
        clientName,
        bookings: JSON.parse(JSON.stringify(bookings)),
        transactions,
        payments,
        ledgerSummary,
        totalBalance: ledgerSummary.balance,
      },
    };
  } catch (error: any) {
    console.error('getUnifiedFinancials error:', error);
    return {
      success: false,
      message: error.message || 'Failed to load unified invoice data',
    };
  }
}

// NEW: Dynamically update Invoice Status (Pending <-> Paid)
export async function updateInvoiceStatus(invoiceId: string, newStatus: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { success: false, message: 'Unauthorized' };

  try {
    const db = await getDb();
    await db.collection('invoices').updateOne(
      { _id: new ObjectId(invoiceId) },
      { $set: { status: newStatus } }
    );

    // Forces Next.js to immediately refetch and redraw the server-rendered table
    revalidatePath('/dashboard/invoices');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    console.error('Failed to update invoice:', error);
    return { success: false, message: 'Database error' };
  }
}

// Zod schema for payment update validation
const updatePaymentSchema = z.object({
  invoiceId: z.string().min(1, 'Invoice ID is required'),
  additionalPayment: z.number().min(0, 'Payment amount cannot be negative'),
});

// NEW: Add cumulative payment with Zod validation and integer math (paise)
export async function updateInvoicePayment(invoiceId: string, additionalPayment: number) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { success: false, message: 'Unauthorized' };

  try {
    // Validate input using Zod
    const validationResult = updatePaymentSchema.safeParse({ invoiceId, additionalPayment });
    if (!validationResult.success) {
      const errorMessage = validationResult.error.issues?.[0]?.message || 'Validation failed';
      return { success: false, message: errorMessage };
    }

    const db = await getDb();

    // Get the invoice to validate against total amount and current paid amount
    const invoice = await db.collection('invoices').findOne({ _id: new ObjectId(invoiceId) });
    if (!invoice) return { success: false, message: 'Invoice not found' };

    // Use integer math (paise) - convert to integers for calculation
    const totalAmount = Math.round((invoice.totalAmount || invoice.finalTotal || 0) * 100); // Convert to paise
    const currentPaidAmount = Math.round((invoice.paidAmount || 0) * 100); // Current paid in paise
    const additionalPaymentPaise = Math.round(additionalPayment * 100); // Additional payment in paise

    // Calculate new total paid amount
    const newTotalPaidPaise = currentPaidAmount + additionalPaymentPaise;

    // Server-side validation: new total paid cannot exceed total amount
    if (newTotalPaidPaise > totalAmount) {
      const remainingBalance = (totalAmount - currentPaidAmount) / 100;
      return {
        success: false,
        message: `Payment exceeds remaining balance of ₹${remainingBalance.toFixed(2)}`
      };
    }

    // Calculate pending amount in paise
    const pendingAmountPaise = Math.max(0, totalAmount - newTotalPaidPaise);

    // Determine payment status based on amounts
    let status = 'UNPAID';
    if (newTotalPaidPaise === 0) {
      status = 'UNPAID';
    } else if (pendingAmountPaise === 0) {
      status = 'PAID';
    } else {
      status = 'PARTIALLY_PAID';
    }

    // Update the invoice using $set for atomic operation with absolute values
    await db.collection('invoices').updateOne(
      { _id: new ObjectId(invoiceId) },
      {
        $set: {
          paidAmount: newTotalPaidPaise / 100, // Store as rupees
          pendingAmount: pendingAmountPaise / 100, // Store as rupees
          status: status
        }
      }
    );

    // If payment is now fully paid, notify revenue distribution system
    if (status === 'PAID') {
      try {
        // Get booking details to extract warehouse info
        const booking = await db.collection('bookings').findOne({ _id: invoice.bookingId });
        if (booking) {
          // Get warehouse ID from database by name
          const warehouse = await db.collection('warehouses').findOne({ name: booking.warehouseName });
          const warehouseId = warehouse ? warehouse._id.toString() : 'WH1'; // Fallback to WH1 if not found
          const revenueApiUrl = process.env.REVENUE_API_BASE || 'http://localhost:4000';

          const notified = await notifyRevenueSystem(revenueApiUrl, {
            booking_id: booking._id.toString(),
            warehouse_id: warehouseId,
            total_amount: totalAmount / 100, // Convert back to rupees
          });

          if (!notified) {
            console.warn('Revenue system notification will be retried on next payment update');
          }
        } else {
          console.error('Booking not found for invoice:', invoiceId);
        }
      } catch (error) {
        console.error('Error notifying revenue distribution system:', error);
        // Don't fail the payment update if revenue notification fails
      }
    }

    revalidatePath('/dashboard/invoices');
    revalidatePath('/dashboard');
    return {
      success: true,
      newPaidAmount: newTotalPaidPaise / 100, // Return new total paid in rupees
      pendingAmount: pendingAmountPaise / 100, // Return pending in rupees
      status
    };
  } catch (error) {
    console.error('Failed to update payment:', error);
    return { success: false, message: 'Database error' };
  }
}
