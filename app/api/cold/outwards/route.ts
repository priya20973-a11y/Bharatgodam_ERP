import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongoose';
import ColdOutward from '@/lib/models/ColdOutward';
import ColdCommodity from '@/lib/models/ColdCommodity';
import { requireSession, getTenantFilter } from '@/lib/ownership';
import mongoose from 'mongoose';

export async function GET(req: Request) {
  await connectToDatabase();
  ColdCommodity.init();
  try {
    const session = await requireSession();
    const filter = getTenantFilter(session);
    const url = new URL(req.url);
    const clientId = url.searchParams.get('clientId');
    const warehouseId = url.searchParams.get('warehouseId');

    const query: any = {
      ...filter,
    };

    if (clientId) {
      query.clientId = mongoose.Types.ObjectId.isValid(clientId)
        ? new mongoose.Types.ObjectId(clientId)
        : clientId;
    }

    if (warehouseId) {
      query.warehouseId = mongoose.Types.ObjectId.isValid(warehouseId)
        ? new mongoose.Types.ObjectId(warehouseId)
        : warehouseId;
    }

    const outwards = await ColdOutward.find(query)
      .populate('commodityId')
      .sort({ date: -1 })
      .lean();

    return NextResponse.json({ success: true, data: outwards });
  } catch (err: any) {
    if (err?.message === 'Unauthorized') {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    console.error('Error fetching cold outwards:', err);
    return NextResponse.json({ success: false, message: err.message || 'Failed to fetch outwards' }, { status: 500 });
  }
}
