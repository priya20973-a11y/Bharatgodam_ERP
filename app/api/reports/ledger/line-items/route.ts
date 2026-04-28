import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getTenantFilterForMongo, requireSession } from '@/lib/ownership';

/**
 * GET /api/reports/ledger/line-items?clientId=[clientId]
 * Fetch available invoices and bookings for payment selection
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const clientId = url.searchParams.get('clientId');

    if (!clientId || !String(clientId).trim()) {
      return NextResponse.json(
        { success: false, message: 'clientId is required' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const trimmedClientId = clientId.trim();

    // Fetch invoices and bookings for the client
    const tenantFilter = getTenantFilterForMongo(session);

    const [bookings, invoices] = await Promise.all([
      db.collection('bookings')
        .find({ accountId: trimmedClientId, direction: { $in: ['INWARD', 'OUTWARD'] }, ...tenantFilter })
        .sort({ date: -1 })
        .limit(50)
        .toArray(),
      db.collection('invoices')
        .find({ accountId: trimmedClientId, ...tenantFilter })
        .sort({ date: -1 })
        .limit(50)
        .toArray(),
    ]);

    const lineItems = [
      ...bookings.map((booking) => ({
        id: `booking-${booking._id?.toString() || ''}`,
        description: `${booking.direction} - ${booking.commodityName || 'Booking'} (${booking.mt || 0} MT)`,
        amount: booking.rentAmount || 0,
        date: booking.date,
        type: 'booking',
      })),
      ...invoices.map((invoice) => ({
        id: `invoice-${invoice._id?.toString() || ''}`,
        description: `Invoice - ${invoice.invoiceNumber || 'INV'} (${new Date(invoice.date).toLocaleDateString()})`,
        amount: invoice.total || invoice.basicTotal || 0,
        date: invoice.date,
        type: 'invoice',
      })),
    ];

    return NextResponse.json(
      {
        success: true,
        data: lineItems,
        total: lineItems.length,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('GET /api/reports/ledger/line-items error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Server error' },
      { status: 500 }
    );
  }
}
