import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';
import { getTenantFilter, getTenantFilterForMongo } from '@/lib/ownership';
import { ObjectId } from 'mongodb';

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const clientId = url.searchParams.get('clientId')?.trim() || '';
    const warehouseId = url.searchParams.get('warehouseId')?.trim() || '';
    const invoiceMonth = url.searchParams.get('invoiceMonth')?.trim() || '';

    if (!clientId || !warehouseId || !invoiceMonth) {
      return NextResponse.json(
        { success: false, message: 'clientId, warehouseId and invoiceMonth are required' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const tenantFilter = getTenantFilterForMongo(session);

    const master = await db.collection('invoice_master').findOne({
      clientId: new ObjectId(clientId),
      warehouseId: new ObjectId(warehouseId),
      invoiceMonth,
      ...tenantFilter,
    });

    const lineItems = master
      ? await db.collection('invoice_line_items').find({ invoiceMasterId: master._id }).toArray()
      : [];

    return NextResponse.json({ success: true, data: { master, lineItems } }, { status: 200 });
  } catch (error: any) {
    console.error('GET /api/invoices/report error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch invoice report' },
      { status: 500 }
    );
  }
}
