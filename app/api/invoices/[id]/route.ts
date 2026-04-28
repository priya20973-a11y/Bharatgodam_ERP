import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { requireSession, getTenantFilterForMongo } from '@/lib/ownership';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const tenantFilter = getTenantFilterForMongo(session);
    const { id } = await params;
    const body = await req.json(); // Expected: { status: 'PAID' }
    
    const db = await getDb();
    
    const result = await db.collection('invoices').updateOne(
      { _id: new ObjectId(id), ...tenantFilter },
      { $set: { status: body.status } }
    );

    if (result.modifiedCount === 0) {
      return NextResponse.json({ success: false, message: 'Invoice not found or unaltered.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: [], message: 'Invoice updated.' });
  } catch (error) {
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  }
}
