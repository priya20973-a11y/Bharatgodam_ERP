import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { requireSession, getTenantFilterForMongo } from '@/lib/ownership';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const tenantFilter = getTenantFilterForMongo(session);
    const { id } = await params;
    const body = await req.json();

    const db = await getDb();
    const updateResult: any = {};

    if (body.status) {
      if (!ObjectId.isValid(id)) {
        return NextResponse.json({ success: false, message: 'Invalid invoice ID for status update' }, { status: 400 });
      }

      const result = await db.collection('invoices').updateOne(
        { _id: new ObjectId(id), ...tenantFilter },
        { $set: { status: body.status } }
      );

      if (result.modifiedCount === 0) {
        return NextResponse.json({ success: false, message: 'Invoice not found or unaltered.' }, { status: 404 });
      }

      updateResult.status = body.status;
    }

    if (body.additionalChargeItems !== undefined) {
      if (!Array.isArray(body.additionalChargeItems)) {
        return NextResponse.json({ success: false, message: 'invalid additionalChargeItems payload' }, { status: 400 });
      }

      const items = body.additionalChargeItems.map((item: any) => {
        const name = String(item.name || item.note || 'Additional Charge').trim();
        const amount = Number(item.amount ?? item.value ?? item.additionalCharges ?? 0);
        if (!name) {
          throw new Error('Adjustment item name cannot be empty');
        }
        if (Number.isNaN(amount) || amount < 0) {
          throw new Error('Adjustment item amount must be a valid non-negative number');
        }
        return {
          invoiceId: id,
          name,
          amount: Math.round(amount * 100) / 100,
          note: item.note || '',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      });

      await db.collection('invoice_adjustments').deleteMany({ invoiceId: id });
      let insertedIds: any = null;
      if (items.length > 0) {
        const insertResult = await db.collection('invoice_adjustments').insertMany(items);
        insertedIds = insertResult.insertedIds;
      }

      updateResult.additionalChargeItems = items.map((item, index) => ({
        id: insertedIds?.[index]?.toString?.() || undefined,
        name: item.name,
        amount: item.amount,
        note: item.note,
      }));
      updateResult.additionalCharges = items.reduce((sum: number, item: any) => sum + item.amount, 0);
    } else if (body.additionalCharges !== undefined) {
      const additionalCharges = Number(body.additionalCharges);
      if (Number.isNaN(additionalCharges)) {
        return NextResponse.json({ success: false, message: 'Invalid additional charges value' }, { status: 400 });
      }

      const normalizedCharges = Math.round(additionalCharges * 100) / 100;
      await db.collection('invoice_adjustments').deleteMany({ invoiceId: id });
      let itemId: string | undefined;
      if (normalizedCharges !== 0) {
        const insertResult = await db.collection('invoice_adjustments').insertOne({
          invoiceId: id,
          name: 'Additional Charges',
          amount: normalizedCharges,
          note: '',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        itemId = insertResult.insertedId?.toString?.();
      }

      updateResult.additionalChargeItems = normalizedCharges === 0 ? [] : [{ id: itemId, name: 'Additional Charges', amount: normalizedCharges, note: '' }];
      updateResult.additionalCharges = normalizedCharges;
    }

    if (!body.status && body.additionalCharges === undefined && body.additionalChargeItems === undefined) {
      return NextResponse.json({ success: false, message: 'No valid update fields provided' }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: updateResult, message: 'Invoice updated.' });
  } catch (error) {
    console.error('[PATCH /api/invoices/[id]] error:', error);
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  }
}
