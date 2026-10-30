import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getTenantFilterForMongo } from '@/lib/ownership';
import { getInternalLedgerData } from '@/app/actions/internal-ledger';
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
    const activeRecordFilter = {
      deletedAt: { $exists: false },
      status: { $nin: ['DELETED', 'CANCELLED'] },
    };

    const url = new URL(req.url);
    const rawClientId = url.pathname.split('/').pop() || '';
    if (!rawClientId) {
      return NextResponse.json({ success: false, message: 'Client ID is required' }, { status: 400 });
    }
    // Decode URI component in case clientId was URL-encoded by the client
    const trimmedClientId = decodeURIComponent(rawClientId).trim();
    if (!trimmedClientId) {
      return NextResponse.json({ success: false, message: 'Client ID is required' }, { status: 400 });
    }

    // Guard: ObjectId.isValid alone accepts 12-byte strings too. Require full 24-char hex to
    // avoid BSONTypeError crashes for legacy / non-ObjectId client ids.
    const isValidObjectId = ObjectId.isValid(trimmedClientId) && /^[a-fA-F0-9]{24}$/.test(trimmedClientId);
    console.log(`[LEDGER API] clientId=${trimmedClientId} isValidObjectId=${isValidObjectId}`);

    const db = await getDb();
    const accountId = trimmedClientId;

    // Build payment $or clauses safely — only include ObjectId clause when valid.
    const paymentOrClauses: any[] = [{ accountId }];
    if (isValidObjectId) {
      paymentOrClauses.push({ clientId: new ObjectId(trimmedClientId) });
    }

    const [bookings, transactionDocs, paymentsDocs, outstandingInvoicesResult, commoditiesResult] = await Promise.all([
      db.collection('bookings')
        .find({ accountId, direction: { $in: ['INWARD', 'OUTWARD'] }, ...tenantFilter, ...activeRecordFilter })
        .sort({ date: 1 })
        .toArray(),
      db.collection('transactions')
        .find({ accountId, ...tenantFilter, ...activeRecordFilter })
        .sort({ date: 1 })
        .toArray(),
      db.collection('payments')
        .find({ $or: paymentOrClauses, ...tenantFilter })
        .sort({ date: 1 })
        .toArray(),
      // Only aggregate on invoice_master when the id is a valid ObjectId; avoids BSONTypeError.
      isValidObjectId
        ? db.collection('invoice_master')
            .aggregate([
              { $match: { clientId: new ObjectId(trimmedClientId), status: { $ne: 'PAID' }, ...tenantFilter } },
              { $group: { _id: null, totalOutstanding: { $sum: '$totalAmount' } } },
            ])
            .toArray()
        : Promise.resolve([]),
      db.collection('commodities')
        .find({ ...tenantFilter })
        .toArray(),
    ]);

    // Create a map of commodity name -> rate per day per MT
    const normalizeCommodityName = (value: string | undefined | null) =>
      typeof value === 'string' ? value.trim().toUpperCase() : '';

    const commodityRates = new Map<string, number>();
    const commodityNameById = new Map<string, string>();

    commoditiesResult.forEach((commodity: any) => {
      const nameKey = normalizeCommodityName(commodity.name);
      const rate =
        Number(commodity.ratePerMtPerDay ?? commodity.ratePerDayPerMT ?? commodity.ratePerMTPerDay ?? 0);

      if (nameKey && rate > 0) {
        commodityRates.set(nameKey, rate);
        console.log(`[LEDGER API] Commodity rate loaded: '${nameKey}' -> ${rate}/MT/day`);
      }

      if (commodity?._id) {
        commodityNameById.set(commodity._id.toString(), commodity.name || '');
      }
    });

    const normalizeTransactionKey = (txn: Transaction & { clientId?: string; warehouseId?: string }) => {
      const clientKey = (txn.clientId || txn.clientName || '').toString().trim().toUpperCase();
      const commodityKey = (txn.commodityName || '').toString().trim().toUpperCase();
      const warehouseKey = (txn.warehouseId || '').toString().trim().toUpperCase();

      return [
        (txn.date || '').toString().trim(),
        txn.direction,
        Number(txn.mt || 0).toFixed(4),
        clientKey,
        commodityKey,
        warehouseKey,
      ].join('|');
    };

    const transactionKeys = new Set<string>();
    const transactionData: Transaction[] = [];

    const addTransaction = (txn: Transaction & { clientId?: string; warehouseId?: string }) => {
      const key = normalizeTransactionKey(txn);
      if (transactionKeys.has(key)) return;
      transactionKeys.add(key);
      transactionData.push(txn);
    };

    bookings.forEach((txn) => addTransaction({
      _id: txn._id?.toString() || '',
      date: txn.date,
      direction: txn.direction,
      mt: txn.mt,
      clientId: txn.clientId?.toString?.() || undefined,
      clientName: txn.clientName,
      commodityName: txn.commodityName,
      warehouseId: txn.warehouseId?.toString?.() || undefined,
      gatePass: txn.gatePass,
    } as Transaction & { clientId?: string; warehouseId?: string }));

    transactionDocs.forEach((txn) => addTransaction({
      _id: txn._id?.toString() || '',
      date: txn.date,
      direction: txn.direction,
      mt: txn.quantityMT,
      clientId: txn.clientId || undefined,
      clientName: txn.clientName || bookings[0]?.clientName || trimmedClientId,
      commodityName: txn.commodityName,
      warehouseId: txn.warehouseId || undefined,
      gatePass: txn.gatePass || '',
    } as Transaction & { clientId?: string; warehouseId?: string }));

    transactionData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const paymentData: Payment[] = paymentsDocs.map((pay) => ({
      _id: pay._id?.toString() || '',
      // Normalise: some records use paymentDate, some use date
      date: pay.paymentDate || pay.date,
      amount: Number(pay.amount || 0),
      clientName: pay.clientName || bookings[0]?.clientName || trimmedClientId,
    }));

    // Calculate outstanding invoices
    const outstandingInvoices = outstandingInvoicesResult.length > 0
      ? Number(outstandingInvoicesResult[0].totalOutstanding || 0)
      : 0;

    console.log(`[LEDGER API] accountId=${accountId} bookings=${bookings.length} transactions=${transactionDocs.length} payments=${paymentsDocs.length} outstandingInvoices=${outstandingInvoices}`);

    const matchedRecords: MatchedRecord[] = bookings.map((booking) => ({
      _id: booking._id?.toString() || '',
      clientName: booking.clientName,
      date: booking.date,
      location: booking.location || '',
      commodity: booking.commodityName || '',
      totalMT: booking.direction === 'INWARD' ? booking.mt : -booking.mt,
    }));

    const ledgerSummary = await getInternalLedgerData(accountId, tenantFilter);

    return NextResponse.json(
      { success: true, data: ledgerSummary },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[LEDGER API] GET /api/reports/ledger/[clientId] error:', error?.message || error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Server error' },
      { status: 500 }
    );
  }
}
