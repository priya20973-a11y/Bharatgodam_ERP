import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { requireSession, getTenantFilterForMongo } from '@/lib/ownership';

export async function GET() {
  try {
    const session = await requireSession();
    const tenantFilter = getTenantFilterForMongo(session);
    const db = await getDb();

    // Aggregation: Group bookings by Month and calculate Total vs Advance
    const pipeline = [
      {
        $project: {
          month: { $month: "$createdAt" },
          isAdvance: {
            // If startDate is more than 7 days after createdAt, it's an "Advance Booking"
            $cond: [
              { $gt: [{ $subtract: ["$startDate", "$createdAt"] }, 604800000] },
              1, 0
            ]
          }
        }
      },
      {
        $group: {
          _id: "$month",
          totalBookings: { $sum: 1 },
          advanceBookings: { $sum: "$isAdvance" }
        }
      },
      { $sort: { _id: 1 } } // Sort by month ascending
    ];

    const stats = await db.collection('bookings').aggregate([{ $match: tenantFilter }, ...pipeline]).toArray();
    return NextResponse.json({ success: true, data: stats, message: 'Analytics fetched' });
  } catch (error) {
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  }
}