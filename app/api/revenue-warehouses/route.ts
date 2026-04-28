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

    return NextResponse.json(warehouses);

  } catch (error) {
    console.error('Error fetching warehouses:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch warehouses' },
      { status: 500 }
    );
  }
}