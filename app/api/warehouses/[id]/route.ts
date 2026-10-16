import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ObjectId } from 'mongodb';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await props.params;
    let objId: any;
    try {
      objId = new ObjectId(id);
    } catch {
      objId = id;
    }

    const db = await getDb();
    const warehouse = await db.collection('warehouses').findOne({
      $or: [{ _id: objId }, { warehouseId: id }]
    });

    if (!warehouse) {
      return NextResponse.json({ success: false, message: 'Warehouse not found' }, { status: 404 });
    }

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

    return NextResponse.json({
      success: true,
      warehouse: {
        ...warehouse,
        id: warehouse._id.toString(),
        warehouseType: whType,
        platformCommission: pc,
        ownerEarnings: oe,
        ownerEquity: oe,
      }
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      }
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await props.params;
    const body = await request.json();
    const { warehouseType, platformCommission, ownerEarnings, ...rest } = body;

    const resolvedType = warehouseType === 'Rented' ? 'Rented' : 'Owner';
    const resolvedPc = resolvedType === 'Rented' ? 100 : (platformCommission !== undefined ? Number(platformCommission) : 40);
    const resolvedOe = resolvedType === 'Rented' ? 0 : (ownerEarnings !== undefined ? Number(ownerEarnings) : 60);

    let objId: any;
    try {
      objId = new ObjectId(id);
    } catch {
      objId = id;
    }

    const db = await getDb();
    await db.collection('warehouses').updateOne(
      { $or: [{ _id: objId }, { warehouseId: id }] },
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
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  return PUT(request, props);
}
