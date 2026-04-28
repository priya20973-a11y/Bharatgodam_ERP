import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getTenantFilterForMongo } from '@/lib/ownership';
import { calculateLedger } from '@/lib/ledger-engine';
import { ObjectId } from 'mongodb';
import type { Transaction, Payment, MatchedRecord } from '@/lib/ledger-engine';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    const tenantFilter = getTenantFilterForMongo(session);

    const url = new URL(req.url);
    const clientId = url.pathname.split('/').pop() || '';
    if (!clientId) {
      return NextResponse.json({ success: false, message: 'Client ID is required' }, { status: 400 });
    }
    const trimmedClientId = clientId.trim();
    if (!trimmedClientId) {
      return NextResponse.json({ success: false, message: 'Client ID is required' }, { status: 400 });
    }

    const db = await getDb();

    const accountId = trimmedClientId;

    const [bookings, transactionDocs, paymentsDocs, outstandingInvoicesResult, commoditiesResult] = await Promise.all([
      db.collection('bookings')
        .find({ accountId, direction: { $in: ['INWARD', 'OUTWARD'] }, ...tenantFilter })
        .sort({ date: 1 })
        .toArray(),
      db.collection('transactions')
        .find({ accountId, ...tenantFilter })
        .sort({ date: 1 })
        .toArray(),
      db.collection('payments')
        .find({ accountId, ...tenantFilter })
        .sort({ date: 1 })
        .toArray(),
      db.collection('invoice_master')
        .aggregate([
          { $match: { clientId: new ObjectId(trimmedClientId), status: { $ne: 'PAID' }, ...tenantFilter } },
          { $group: { _id: null, totalOutstanding: { $sum: '$totalAmount' } } }
        ])
        .toArray(),
      db.collection('commodities')
        .find({ ...tenantFilter })
        .toArray(),
    ]);

    // Create a map of commodity name -> rate per day per MT
    const normalizeCommodityName = (value: string | undefined | null) =>
      typeof value === 'string' ? value.trim().toUpperCase() : '';

    const commodityRates = new Map<string, number>();
    commoditiesResult.forEach((commodity: any) => {
      const nameKey = normalizeCommodityName(commodity.name);
      const rate =
        Number(commodity.ratePerMtPerDay ?? commodity.ratePerDayPerMT ?? commodity.ratePerMTPerDay ?? commodity.ratePerMTPerDay ?? 0);

      if (nameKey && rate > 0) {
        commodityRates.set(nameKey, rate);
        console.log(`[LEDGER] Loaded commodity rate: '${nameKey}' -> ₹${rate}/MT/day`);
      }
    });

    const transactionData: Transaction[] = Array.from(
      new Map(
        [
          ...bookings.map((txn) => ({
            _id: txn._id?.toString() || '',
            date: txn.date,
            direction: txn.direction,
            mt: txn.mt,
            clientName: txn.clientName,
            commodityName: txn.commodityName,
            gatePass: txn.gatePass,
          })),
          ...transactionDocs.map((txn) => ({
            _id: txn._id?.toString() || '',
            date: txn.date,
            direction: txn.direction,
            mt: txn.quantityMT,
            clientName: txn.clientName || bookings[0]?.clientName || clientId,
            commodityName: txn.commodityName,
            gatePass: txn.gatePass || '',
          })),
        ].map((item) => [item._id, item])
      ).values()
    ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const paymentData: Payment[] = paymentsDocs.map((pay) => ({
      _id: pay._id?.toString() || '',
      date: pay.date,
      amount: pay.amount,
      clientName: pay.clientName || bookings[0]?.clientName || clientId,
    }));

    // Calculate outstanding invoices
    const outstandingInvoices = outstandingInvoicesResult.length > 0 
      ? outstandingInvoicesResult[0].totalOutstanding || 0 
      : 0;

    const matchedRecords: MatchedRecord[] = bookings.map((booking) => ({
      _id: booking._id?.toString() || '',
      clientName: booking.clientName,
      date: booking.date,
      location: booking.location || '',
      commodity: booking.commodityName || '',
      totalMT: booking.direction === 'INWARD' ? booking.mt : -booking.mt,
    }));

    const ledgerSummary = calculateLedger(
      transactionData,
      paymentData,
      bookings[0]?.clientName || clientId,
      outstandingInvoices,
      commodityRates
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          ...ledgerSummary,
          transactions: transactionData,
          matchedRecords,
          recordCount: matchedRecords.length,
          isAggregated: matchedRecords.length > 1,
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('GET /api/reports/ledger/[clientId] error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Server error' },
      { status: 500 }
    );
  }
}
