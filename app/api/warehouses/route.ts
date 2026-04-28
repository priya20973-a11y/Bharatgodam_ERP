import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getTenantFilterForMongo, appendOwnershipForMongo } from '@/lib/ownership';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const db = await getDb();
    const tenantFilter = getTenantFilterForMongo(session);

    const warehouses = await db
      .collection('warehouses')
      .find({
        ...tenantFilter,
        name: { $nin: ['Warehouse ABC', 'Warehouse XYZ'] }
      })
      .sort({ name: 1 })
      .toArray();

    const serializedWarehouses = warehouses.map((warehouse: any) => ({
      ...warehouse,
      id: warehouse._id.toString(),
    }));

    return NextResponse.json({
      success: true,
      warehouses: serializedWarehouses,
    });

  } catch (error) {
    console.error('Error fetching warehouses:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch warehouses' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, address, totalCapacity, isActive } = body;

    if (!name || !address || !totalCapacity) {
      return NextResponse.json({
        success: false,
        message: 'Missing required fields: name, address, totalCapacity'
      }, { status: 400 });
    }

    const db = await getDb();

    const warehousePayload = appendOwnershipForMongo({
      name,
      address,
      totalCapacity: Number(totalCapacity),
      availableCapacity: Number(totalCapacity), // Initially fully available
      isActive: isActive !== undefined ? isActive : true,
      createdAt: new Date(),
    }, session);

    const result = await db.collection('warehouses').insertOne(warehousePayload);

    return NextResponse.json({
      success: true,
      message: 'Warehouse created successfully',
      warehouse: {
        id: result.insertedId.toString(),
        ...warehousePayload
      }
    });

  } catch (error) {
    console.error('Error creating warehouse:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to create warehouse' },
      { status: 500 }
    );
  }
}