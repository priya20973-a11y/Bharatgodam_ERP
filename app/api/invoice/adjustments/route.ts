import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { requireSession, getTenantFilterForMongo } from '@/lib/ownership';

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const tenantFilter = getTenantFilterForMongo(session);
    const invoiceIdsParam = request.nextUrl.searchParams.get('invoiceIds') || '';
    const invoiceIds = invoiceIdsParam
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);

    if (invoiceIds.length === 0) {
      return NextResponse.json({ success: true, data: {} });
    }

    const db = await getDb();
    const adjustments = await db.collection('invoice_adjustments')
      .find({ invoiceId: { $in: invoiceIds } })
      .toArray();

    const data = adjustments.reduce((acc: Record<string, any>, adjustment: any) => {
      const invoiceId = adjustment.invoiceId;
      if (!acc[invoiceId]) {
        acc[invoiceId] = {
          additionalChargeItems: [],
          additionalCharges: 0,
        };
      }
      const item = {
        id: adjustment._id?.toString(),
        name: adjustment.name || adjustment.note || 'Additional Charge',
        amount: Number((adjustment.amount ?? adjustment.additionalCharges) || 0),
        note: adjustment.note || '',
      };
      acc[invoiceId].additionalChargeItems.push(item);
      acc[invoiceId].additionalCharges += item.amount;
      return acc;
    }, {} as Record<string, any>);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[GET /api/invoice/adjustments] error:', error);
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  }
}
