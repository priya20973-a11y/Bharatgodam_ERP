import { NextRequest, NextResponse } from 'next/server';
import { requireSession, getTenantFilter } from '@/lib/ownership';
import connectToDatabase from '@/lib/mongoose';
import ColdWarehouse from '@/lib/models/ColdWarehouse';
import ColdEnvironmentRecord from '@/lib/models/ColdEnvironmentRecord';
import mongoose from 'mongoose';

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    await connectToDatabase();

    const searchParams = request.nextUrl.searchParams;
    const warehouseId = searchParams.get('warehouseId');
    const chamberNo = searchParams.get('chamberNo') ? parseInt(searchParams.get('chamberNo') as string) : undefined;
    const floorNo = searchParams.get('floorNo') ? parseInt(searchParams.get('floorNo') as string) : undefined;

    const tenantFilter = getTenantFilter(session);
    const warehouseFilter: any = { ...tenantFilter };
    if (warehouseId) {
      warehouseFilter._id = new mongoose.Types.ObjectId(warehouseId);
    }

    const warehouses = await ColdWarehouse.find(warehouseFilter).sort({ createdAt: -1 });
    const warehouseOptions = warehouses.map((warehouse) => ({
      id: warehouse._id.toString(),
      name: warehouse.name,
      chambers: warehouse.chambers.map((c) => ({
        chamberNo: c.chamberNo,
        name: c.name,
        floors: (c.floors || []).map((f) => ({ floorNo: f.floorNo, name: f.name })),
      })),
    }));

    const recordFilter: any = {};
    if (warehouseId) recordFilter.warehouseId = new mongoose.Types.ObjectId(warehouseId);
    if (typeof chamberNo === 'number') recordFilter.chamberNo = chamberNo;
    if (typeof floorNo === 'number') recordFilter.floorNo = floorNo;

    const records = await ColdEnvironmentRecord.find(recordFilter).sort({ recordedAt: -1 }).lean();
    return NextResponse.json({ success: true, warehouses: warehouseOptions, records });
  } catch (error: any) {
    console.error('Cold Environment GET Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    await connectToDatabase();

    const body = await request.json();
    const { warehouseId, chamberNo, floorNo, temperature, moisture, recordedAt, notes } = body;

    if (!warehouseId || chamberNo == null || floorNo == null || temperature == null || moisture == null || !recordedAt) {
      return NextResponse.json({ success: false, message: 'Missing required fields' }, { status: 400 });
    }

    const warehouse = await ColdWarehouse.findOne({ _id: warehouseId, ...getTenantFilter(session) });
    if (!warehouse) {
      return NextResponse.json({ success: false, message: 'Warehouse not found' }, { status: 404 });
    }

    const record = await ColdEnvironmentRecord.create({
      warehouseId: new mongoose.Types.ObjectId(warehouseId),
      chamberNo,
      floorNo,
      temperature,
      moisture,
      recordedAt: new Date(recordedAt),
      notes: notes || '',
      userId: session.user.id ? new mongoose.Types.ObjectId(session.user.id) : undefined,
      userEmail: session.user.email || undefined,
    });

    return NextResponse.json({ success: true, record: record.toObject() });
  } catch (error: any) {
    console.error('Cold Environment POST Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
