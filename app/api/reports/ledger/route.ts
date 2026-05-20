import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { appendOwnership, requireSession } from '@/lib/ownership';

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

    if (ObjectId.isValid(invoiceId)) {
      filter.invoiceId = { $in: [new ObjectId(invoiceId), invoiceId] };
    } else {
      filter.invoiceId = invoiceId;
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
    const { accountId, clientName, amount, date } = body;

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

    const db = await getDb();

    const paymentDocument = appendOwnership({
      accountId: accountId?.trim() || null,
      clientName: clientName?.trim() || '',
      amount: Number(amount),
      date: new Date(date).toISOString().split('T')[0],
      recordedBy: session.user?.email,
      createdAt: new Date(),
    }, session);

    const result = await db.collection('payments').insertOne(paymentDocument);

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
      const deleteResult = await db.collection('payments').deleteOne({ _id: new ObjectId(paymentId) });
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

    const deleteResult = await db.collection('payments').deleteMany(filter);

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
