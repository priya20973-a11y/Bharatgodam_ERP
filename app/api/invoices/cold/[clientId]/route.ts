import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongoose';
import ColdInvoice from '@/lib/models/ColdInvoice';
import { requireSession, getTenantFilter } from '@/lib/ownership';
import mongoose from 'mongoose';

export async function GET(req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  await connectToDatabase();
  try {
    const session = await requireSession();
    const filter = getTenantFilter(session);
    const { clientId } = await params;
    const url = new URL(req.url);
    const warehouseId = url.searchParams.get('warehouseId');

    const query: any = {
      ...filter,
    };

    if (mongoose.Types.ObjectId.isValid(clientId)) {
      query.clientId = new mongoose.Types.ObjectId(clientId);
    } else {
      query.clientId = clientId;
    }

    if (warehouseId) {
      if (mongoose.Types.ObjectId.isValid(warehouseId)) {
        query.warehouseId = new mongoose.Types.ObjectId(warehouseId);
      } else {
        query.warehouseId = warehouseId;
      }
    }

    const invoices = await ColdInvoice.find(query)
      .populate('clientId', 'name')
      .populate('warehouseId', 'name')
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ success: true, data: invoices }, { status: 200 });
  } catch (err: any) {
    if (err?.message === 'Unauthorized') {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    console.error('Error fetching cold invoices:', err);
    return NextResponse.json({ success: false, message: err.message || 'Failed to fetch cold invoices' }, { status: 500 });
  }
}
