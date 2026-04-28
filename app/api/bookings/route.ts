import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ObjectId } from 'mongodb';

const STATIC_RATE_FALLBACK: Record<string, number> = {
  WHEAT: 85,
  RICE: 90,
  CHANA: 95,
  SOYABEAN: 80,
  MUSTARD: 88,
  CORN: 75,
  COTTON: 120,
};

type StockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

function getStockStatus(quantity: number): StockStatus {
  if (quantity <= 0) return 'OUT_OF_STOCK';
  if (quantity < 5) return 'LOW_STOCK';
  return 'IN_STOCK';
}

async function getCurrentCommodityStock(db: any, warehouseName: string, commodityName: string) {
  const stockDoc = await db.collection('warehouse_stock').findOne({ warehouseName, commodityName });
  return stockDoc?.quantity || 0;
}

async function updateWarehouseStock(db: any, warehouseName: string, commodityName: string, quantityDelta: number) {
  const stockCollection = db.collection('warehouse_stock');
  const existing = await stockCollection.findOne({ warehouseName, commodityName });
  const currentQuantity = existing?.quantity || 0;
  const newQuantity = currentQuantity + quantityDelta;

  if (newQuantity < 0) {
    throw new Error('Insufficient commodity stock for this outward movement.');
  }

  const stockStatus = getStockStatus(newQuantity);
  const result = await stockCollection.findOneAndUpdate(
    { warehouseName, commodityName },
    {
      $set: {
        warehouseName,
        commodityName,
        quantity: newQuantity,
        status: stockStatus,
        lastUpdated: new Date(),
      }
    },
    { upsert: true, returnDocument: 'after' }
  );

  return {
    warehouseName,
    commodityName,
    quantity: newQuantity,
    status: stockStatus,
    lastUpdated: new Date(),
  };
}

/**
 * PATCH /api/bookings/[bookingId]
 * Update booking details (for edit mode)
 */
export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

    const url = new URL(req.url);
    const bookingId = url.pathname.split('/').pop();

    if (!bookingId || bookingId === 'route.ts') {
      return NextResponse.json({ success: false, message: 'Booking ID is required' }, { status: 400 });
    }

    const body = await req.json();
    const db = await getDb();

    const updateFields: any = {};

    // Only allow specific fields to be updated
    const allowedFields = [
      'date',
      'warehouseName',
      'location',
      'clientName',
      'clientLocation',
      'suppliers',
      'commodityName',
      'cadNo',
      'stackNo',
      'lotNo',
      'doNumber',
      'cdfNo',
      'gatePass',
      'pass',
      'bags',
      'palaBags',
      'mt',
      'storageDays',
    ];

    allowedFields.forEach((field) => {
      if (field in body) {
        updateFields[field] = body[field];
      }
    });

    if (Object.keys(updateFields).length === 0) {
      return NextResponse.json({ success: false, message: 'No valid fields to update' }, { status: 400 });
    }

    const result = await db.collection('bookings').findOneAndUpdate(
      { _id: new ObjectId(bookingId) },
      {
        $set: {
          ...updateFields,
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after' }
    );

    if (!result || !result.value) {
      return NextResponse.json({ success: false, message: 'Booking not found' }, { status: 404 });
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Booking updated successfully',
        booking: result.value,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('PATCH /api/bookings error:', error);
    return NextResponse.json({ success: false, message: error.message || 'Server error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const db = await getDb();

    if (body.direction && body.commodityName) {
      const direction = body.direction === 'OUTWARD' ? 'OUTWARD' : 'INWARD';
      const date = body.date?.toString();
      const warehouseName = body.warehouseName?.toString();
      const commodityName = body.commodityName?.toString().toUpperCase();
      const mt = Number(body.mt);
      const storageDays = Number(body.storageDays || 1);

      if (!date || !warehouseName || !commodityName || !body.clientName || !body.gatePass || !mt || mt <= 0) {
        return NextResponse.json({ success: false, message: 'Missing required booking fields.' }, { status: 400 });
      }

      const availableStock = await getCurrentCommodityStock(db, warehouseName, commodityName);
      if (direction === 'OUTWARD' && mt > availableStock) {
        return NextResponse.json({ success: false, message: 'Commodity not available', availableStock }, { status: 400 });
      }

      const commodityDoc = await db.collection('commodities').findOne({ name: commodityName });
      const ratePerTon = commodityDoc?.baseRate ?? STATIC_RATE_FALLBACK[commodityName] ?? 0;

      const bookingDoc: any = {
        userId: new ObjectId((session.user as any).id),
        userEmail: session.user?.email || '',
        direction,
        date,
        warehouseName,
        location: body.location?.toString() || '',
        clientName: body.clientName?.toString() || '',
        clientLocation: body.clientLocation?.toString() || '',
        suppliers: body.suppliers?.toString() || '',
        commodityName,
        cadNo: body.cadNo?.toString() || '',
        stackNo: body.stackNo?.toString() || '',
        lotNo: body.lotNo?.toString() || '',
        doNumber: body.doNumber?.toString() || '',
        cdfNo: body.cdfNo?.toString() || '',
        gatePass: body.gatePass?.toString() || '',
        pass: body.pass?.toString() || '',
        bags: Number(body.bags || 0),
        palaBags: Number(body.palaBags || 0),
        mt,
        storageDays,
        ratePerTon,
        status: 'PENDING_APPROVAL',
        createdAt: new Date(),
      };

      const insertResult = await db.collection('bookings').insertOne(bookingDoc);
      const stockDelta = direction === 'INWARD' ? mt : -mt;
      const updatedStock = await updateWarehouseStock(db, warehouseName, commodityName, stockDelta);

      return NextResponse.json({
        success: true,
        bookingId: insertResult.insertedId.toString(),
        newStock: updatedStock.quantity,
        direction,
        warehouseName,
        commodityName,
      });
    }

    const { zoneId, startDate, endDate, requestedSpace } = body;

    const overlappingBookings = await db.collection('bookings').aggregate([
      {
        $match: {
          zoneId: new ObjectId(zoneId),
          status: 'APPROVED',
          startDate: { $lte: new Date(endDate) },
          endDate: { $gte: new Date(startDate) }
        }
      },
      {
        $group: {
          _id: null,
          totalOccupied: { $sum: '$occupiedSpace' }
        }
      }
    ]).toArray();

    const currentOccupied = overlappingBookings[0]?.totalOccupied || 0;
    const zone = await db.collection('zones').findOne({ _id: new ObjectId(zoneId) });
    if (!zone) return NextResponse.json({ success: false, message: 'Zone not found' }, { status: 404 });

    if (currentOccupied + requestedSpace > zone.totalCapacity) {
      return NextResponse.json({
        success: false,
        message: `Overbooking prevented. Zone only has ${zone.totalCapacity - currentOccupied} units available.`
      }, { status: 400 });
    }

    const result = await db.collection('bookings').insertOne({
      userId: new ObjectId((session.user as any).id),
      zoneId: new ObjectId(zoneId),
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      occupiedSpace: requestedSpace,
      status: 'PENDING',
      createdAt: new Date()
    });

    return NextResponse.json({ success: true, data: result, message: 'Booking requested successfully.' });
  } catch (error: any) {
    console.error('POST /api/bookings error:', error);
    return NextResponse.json({ success: false, message: error.message || 'Server error' }, { status: 500 });
  }
}
