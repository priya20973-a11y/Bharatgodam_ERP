import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { requireSession, getTenantFilterForMongo } from '@/lib/ownership';

export async function GET() {
  const session = await requireSession();
  const db = await getDb();
  const tenantFilter = getTenantFilterForMongo(session);

  const outstandingResult = await db.collection('invoice_master').aggregate([
    { $match: tenantFilter },
    {
      $project: {
        totalAmount: 1,
        paidAmount: { $ifNull: ['$paidAmount', 0] },
        pendingAmount: {
          $max: [
            { $subtract: ['$totalAmount', { $ifNull: ['$paidAmount', 0] }] },
            0
          ]
        },
        status: 1
      }
    },
    { $match: { status: { $ne: 'PAID' }, pendingAmount: { $gt: 0 } } },
    { $group: { _id: null, totalOutstanding: { $sum: '$pendingAmount' } } }
  ]).toArray();

  const receivedResult = await db.collection('payments').aggregate([
    { $match: { status: 'COMPLETED', ...tenantFilter } },
    { $group: { _id: null, totalReceived: { $sum: '$amount' } } }
  ]).toArray();

  const totalOutstanding = outstandingResult[0]?.totalOutstanding ?? 0;
  const totalReceived = receivedResult[0]?.totalReceived ?? 0;

  return NextResponse.json({ totalOutstanding, totalReceived });
}
