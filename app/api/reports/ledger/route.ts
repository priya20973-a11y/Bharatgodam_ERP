import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { appendOwnership, requireSession } from '@/lib/ownership';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const parseISTDateTimeLocal = (dateTimeLocal: string) => {
  const [datePart, timePart = '00:00'] = dateTimeLocal.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);
  if ([year, month, day, hour, minute].some((value) => Number.isNaN(value))) {
    return new Date(dateTimeLocal);
  }
  const utcMs = Date.UTC(year, month - 1, day, hour, minute) - IST_OFFSET_MS;
  return new Date(utcMs);
};

export async function GET(req: Request) {
  try {
    const session = await requireSession();
    const url = new URL(req.url);
    const invoiceId = url.searchParams.get('invoiceId');

    if (!invoiceId) {
      return NextResponse.json(
        { success: false, message: 'invoiceId is required' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const filter: any = { status: 'COMPLETED' };
    const accountId = url.searchParams.get('accountId');
    const month = url.searchParams.get('month');

    const invoiceFilter = ObjectId.isValid(invoiceId)
      ? { invoiceId: { $in: [new ObjectId(invoiceId), invoiceId] } }
      : { invoiceId };

    if (accountId && month && /^\d{4}-\d{2}$/.test(month)) {
      const [year, monthPart] = month.split('-');
      const monthStart = new Date(`${year}-${monthPart}-01T00:00:00.000Z`);
      const monthEnd = new Date(Date.UTC(Number(year), Number(monthPart), 0, 23, 59, 59, 999));

      filter.$or = [
        invoiceFilter,
        {
          accountId,
          $or: [
            { paymentDate: { $gte: monthStart, $lte: monthEnd } },
            { date: { $gte: monthStart, $lte: monthEnd } },
          ],
        },
      ];
    } else {
      Object.assign(filter, invoiceFilter);
    }

    const payments = await db.collection('payments')
      .find(filter)
      .sort({ paymentDate: 1, createdAt: 1 })
      .toArray();

    const result = payments.map((payment) => ({
      paymentId: payment._id?.toString?.() || '',
      paymentDate: payment.paymentDate || payment.date,
      amount: payment.amount,
      allocations: Array.isArray(payment.allocations) ? payment.allocations : [],
    }));

    return NextResponse.json({ success: true, data: result }, { status: 200 });
  } catch (error: any) {
    console.error('GET /api/reports/ledger error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/reports/ledger
 * Record a payment for a client
 */
export async function POST(req: Request) {
  try {
    const session = await requireSession();

    const body = await req.json();
    const { accountId, clientName, invoiceId, amount, date, allocations } = body;

    if ((!accountId || !String(accountId).trim()) && (!clientName || !String(clientName).trim())) {
      return NextResponse.json(
        { success: false, message: 'accountId or clientName is required' },
        { status: 400 }
      );
    }

    if (!amount || !date) {
      return NextResponse.json(
        { success: false, message: 'amount and date are required' },
        { status: 400 }
      );
    }

    const parsedPaymentDate = parseISTDateTimeLocal(date);
    if (Number.isNaN(parsedPaymentDate.getTime())) {
      return NextResponse.json(
        { success: false, message: 'Invalid payment date' },
        { status: 400 }
      );
    }

    const db = await getDb();

    let invoiceIdValue: string | ObjectId | null = null;
    if (invoiceId) {
      try {
        invoiceIdValue = new ObjectId(invoiceId);
      } catch {
        invoiceIdValue = invoiceId;
      }
    }

    const allocationEntries = Array.isArray(allocations)
      ? allocations.map((allocation: any) => ({
          id: String(allocation.id || ''),
          name: String(allocation.name || ''),
          charge: Number(allocation.charge || 0),
          amount: Number(allocation.amount || 0),
        }))
      : [];

    const paymentDocument = appendOwnership({
      accountId: accountId?.trim() || null,
      clientName: clientName?.trim() || '',
      amount: Number(amount),
      date: parsedPaymentDate,
      paymentDate: parsedPaymentDate,
      invoiceId: invoiceIdValue,
      allocations: allocationEntries,
      recordedBy: session.user?.email,
      createdAt: new Date(),
      status: 'COMPLETED',
    }, session);

    const result = await db.collection('payments').insertOne(paymentDocument);

    try {
      const { logActivity } = await import('@/lib/cold-logger');
      await logActivity({
        actionType: 'CREATE',
        module: 'Client Ledger',
        recordId: result.insertedId.toString(),
        description: `Add Payment: Added payment of ₹${amount} for client ${clientName || accountId || 'Unknown'}`,
        newValue: paymentDocument,
        storageType: 'Dry Storage',
        sessionFallback: session
      });
    } catch (logError) {
      console.error('Failed to log payment creation:', logError);
    }

    return NextResponse.json(
      {
        success: true,
        paymentId: result.insertedId.toString(),
        message: 'Payment recorded successfully',
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('POST /api/reports/ledger error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/reports/ledger
 * Reset/cancel payments for an invoice or payment
 */
export async function DELETE(req: Request) {
  try {
    const session = await requireSession();
    const url = new URL(req.url);
    const invoiceId = url.searchParams.get('invoiceId');
    const paymentId = url.searchParams.get('paymentId');
    const accountId = url.searchParams.get('accountId');

    if (!invoiceId && !paymentId) {
      return NextResponse.json(
        { success: false, message: 'invoiceId or paymentId is required' },
        { status: 400 }
      );
    }

    const db = await getDb();

    if (paymentId) {
      const paymentToDelete = await db.collection('payments').findOne({ _id: new ObjectId(paymentId) });
      const deleteResult = await db.collection('payments').deleteOne({ _id: new ObjectId(paymentId) });
      
      if (deleteResult.deletedCount && paymentToDelete) {
        try {
          const { logActivity } = await import('@/lib/cold-logger');
          await logActivity({
            actionType: 'DELETE',
            module: 'Client Ledger',
            recordId: paymentId,
            description: `Remove Payment: Removed payment of ₹${paymentToDelete.amount} for client ${paymentToDelete.clientName || paymentToDelete.accountId || 'Unknown'}`,
            previousValue: paymentToDelete,
            storageType: 'Dry Storage',
            sessionFallback: session
          });
        } catch (logError) {
          console.error('Failed to log payment deletion:', logError);
        }
      }
      
      return NextResponse.json(
        {
          success: true,
          deletedCount: deleteResult.deletedCount,
          message: deleteResult.deletedCount
            ? 'Payment record deleted successfully'
            : 'No matching payment record found to delete',
        },
        { status: 200 }
      );
    }

    const filter: any = {
      invoiceId,
      status: 'COMPLETED',
    };
    if (accountId) {
      filter.accountId = accountId;
    }

    const month = url.searchParams.get('month');
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [year, monthPart] = month.split('-');
      const monthStart = new Date(`${year}-${monthPart}-01T00:00:00.000Z`);
      const monthEnd = new Date(Date.UTC(Number(year), Number(monthPart), 0, 23, 59, 59, 999));
      filter.$or = [
        { paymentDate: { $gte: monthStart, $lte: monthEnd } },
        { date: { $gte: monthStart, $lte: monthEnd } },
      ];
    }

    const paymentsToDelete = await db.collection('payments').find(filter).toArray();
    const deleteResult = await db.collection('payments').deleteMany(filter);

    if (deleteResult.deletedCount && paymentsToDelete.length > 0) {
      try {
        const { logActivity } = await import('@/lib/cold-logger');
        for (const payment of paymentsToDelete) {
          await logActivity({
            actionType: 'DELETE',
            module: 'Client Ledger',
            recordId: payment._id?.toString(),
            description: `Remove Payment: Removed payment of ₹${payment.amount} for client ${payment.clientName || payment.accountId || 'Unknown'} (Bulk remove)`,
            previousValue: payment,
            storageType: 'Dry Storage',
            sessionFallback: session
          });
        }
      } catch (logError) {
        console.error('Failed to log bulk payment deletion:', logError);
      }
    }

    return NextResponse.json(
      {
        success: true,
        deletedCount: deleteResult.deletedCount,
        message: deleteResult.deletedCount
          ? 'Payment records deleted successfully'
          : 'No matching payment records found to delete',
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('DELETE /api/reports/ledger error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Server error' },
      { status: 500 }
    );
  }
}
