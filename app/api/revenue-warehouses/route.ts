import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';
import { getTenantFilter, getTenantFilterForMongo } from '@/lib/ownership';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const db = await getDb();
    const warehouses = await db.collection('warehouses').find({ ...getTenantFilterForMongo(session) }).sort({ name: 1 }).toArray();

    const { getWarehouseFormatter } = await import('@/lib/warehouse-format');
    const isAdmin = session.user?.role === 'SUPER_ADMIN' || session.user?.role === 'ADMIN';
    const formatter = await getWarehouseFormatter(db, isAdmin);

    const formattedWarehouses = warehouses.map(w => ({
      ...w,
      name: formatter(w.name || '', w.userId?.toString(), w.warehouseId)
    }));

    return NextResponse.json(formattedWarehouses);

  } catch (error) {
    console.error('Error fetching warehouses:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch warehouses' },
      { status: 500 }
    );
  }
}