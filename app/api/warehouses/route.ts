import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getTenantFilterForMongo, appendOwnershipForMongo } from '@/lib/ownership';
import { ObjectId } from 'mongodb';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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

    const serializedWarehouses = warehouses.map((warehouse: any) => {
      const whType = (warehouse.warehouseType || 'Owner') as 'Rented' | 'Owner';
      const oe = whType === 'Rented'
        ? 0
        : (warehouse.ownerEarnings !== undefined
            ? Number(warehouse.ownerEarnings)
            : (warehouse.ownerEquity !== undefined ? Number(warehouse.ownerEquity) : 60));
      const pc = whType === 'Rented'
        ? 100
        : (warehouse.platformCommission !== undefined
            ? Number(warehouse.platformCommission)
            : (100 - oe));

      return {
        ...warehouse,
        id: warehouse._id.toString(),
        warehouseType: whType,
        platformCommission: pc,
        ownerEarnings: oe,
        ownerEquity: oe,
      };
    });

    return NextResponse.json({
      success: true,
      warehouses: serializedWarehouses,
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      }
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
    const { warehouseId, name, address, totalCapacity, isActive, warehouseType, platformCommission, ownerEarnings } = body;

    if (!name || !address || !totalCapacity) {
      return NextResponse.json({
        success: false,
        message: 'Missing required fields: name, address, totalCapacity'
      }, { status: 400 });
    }

    const resolvedType = warehouseType === 'Rented' ? 'Rented' : 'Owner';
    const resolvedPc = resolvedType === 'Rented' ? 100 : (platformCommission !== undefined ? Number(platformCommission) : 40);
    const resolvedOe = resolvedType === 'Rented' ? 0 : (ownerEarnings !== undefined ? Number(ownerEarnings) : 60);

    const db = await getDb();

    const warehousePayload = appendOwnershipForMongo({
      warehouseId,
      name,
      address,
      warehouseType: resolvedType,
      platformCommission: resolvedPc,
      ownerEarnings: resolvedOe,
      ownerEquity: resolvedOe,
      totalCapacity: Number(totalCapacity),
      availableCapacity: Number(totalCapacity), // Initially fully available
      isActive: isActive !== undefined ? isActive : true,
      createdAt: new Date(),
    }, session);

    const result = await db.collection('warehouses').insertOne(warehousePayload);

    try {
      revalidatePath('/dashboard/warehouses');
      revalidatePath('/dashboard/revenue');
    } catch {}

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

export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, _id, warehouseType, platformCommission, ownerEarnings, ...rest } = body;
    const targetId = id || _id;

    if (!targetId) {
      return NextResponse.json({ success: false, message: 'Warehouse ID is required' }, { status: 400 });
    }

    const resolvedType = warehouseType === 'Rented' ? 'Rented' : 'Owner';
    const resolvedPc = resolvedType === 'Rented' ? 100 : (platformCommission !== undefined ? Number(platformCommission) : 40);
    const resolvedOe = resolvedType === 'Rented' ? 0 : (ownerEarnings !== undefined ? Number(ownerEarnings) : 60);

    let objId: any;
    try {
      objId = new ObjectId(String(targetId));
    } catch {
      objId = targetId;
    }

    const db = await getDb();
    await db.collection('warehouses').updateOne(
      { _id: objId },
      {
        $set: {
          ...rest,
          warehouseType: resolvedType,
          platformCommission: resolvedPc,
          ownerEarnings: resolvedOe,
          ownerEquity: resolvedOe,
          updatedAt: new Date(),
        }
      }
    );

    try {
      revalidatePath('/dashboard/warehouses');
      revalidatePath('/dashboard/revenue');
    } catch {}

    return NextResponse.json({
      success: true,
      message: 'Warehouse updated successfully',
    });
  } catch (error: any) {
    console.error('Error updating warehouse:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to update warehouse' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  return PUT(request);
}