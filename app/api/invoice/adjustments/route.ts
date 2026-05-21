import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { requireSession, getTenantFilterForMongo, appendOwnershipForMongo } from '@/lib/ownership';
import { ObjectId } from 'mongodb';
import { z } from 'zod';

const adjustmentPayloadSchema = z.object({
  invoiceId: z.string().min(1),
  additionalCharges: z.array(
    z.object({
      description: z.string().trim().min(1),
      amount: z.number().nonnegative(),
    })
  ),
});

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const tenantFilter = getTenantFilterForMongo(session);
    const invoiceIdsParam = request.nextUrl.searchParams.get('invoiceIds') || '';
    const invoiceIds = invoiceIdsParam
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);

    if (invoiceIds.length === 0) {
      return NextResponse.json({ success: true, data: {} });
    }

    const db = await getDb();
    const adjustments = await db.collection('invoice_adjustments')
      .find({
        ...tenantFilter,
        invoiceId: { $in: invoiceIds },
      })
      .toArray();

    const data = adjustments.reduce((acc: Record<string, any>, adjustment: any) => {
      const invoiceId = adjustment.invoiceId;
      if (!acc[invoiceId]) {
        acc[invoiceId] = {
          additionalChargeItems: [],
          additionalCharges: 0,
        };
      }
      const item = {
        id: adjustment._id?.toString(),
        name: adjustment.name || adjustment.note || 'Additional Charge',
        amount: Number((adjustment.amount ?? adjustment.additionalCharges) || 0),
        note: adjustment.note || '',
      };
      acc[invoiceId].additionalChargeItems.push(item);
      acc[invoiceId].additionalCharges += item.amount;
      return acc;
    }, {} as Record<string, any>);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[GET /api/invoice/adjustments] error:', error);
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const payload = await request.json();
    const parsed = adjustmentPayloadSchema.parse(payload);

    const db = await getDb();
    const invoiceCollection = db.collection('invoices');
    const invoiceObjectId = ObjectId.isValid(parsed.invoiceId)
      ? new ObjectId(parsed.invoiceId)
      : undefined;

    const searchFilters: Array<Record<string, unknown>> = [];
    if (invoiceObjectId) {
      searchFilters.push({ _id: invoiceObjectId });
    }
    searchFilters.push({ invoiceNumber: parsed.invoiceId }, { invoiceId: parsed.invoiceId });

    const invoiceDoc = await invoiceCollection.findOne({ $or: searchFilters });
    const invoiceMaster =
      invoiceDoc ??
      (await db.collection('invoice_master').findOne({ invoiceId: parsed.invoiceId }));

    const normalizedCharges = parsed.additionalCharges.map((item) => ({
      description: item.description,
      amount: Number(item.amount.toFixed(2)),
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const chargeTotal = normalizedCharges.reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const invoiceUpdate: Record<string, any> = {
      additionalCharges: Number(chargeTotal.toFixed(2)),
      additionalChargeItems: normalizedCharges,
      updatedAt: new Date(),
    };

    if (invoiceDoc) {
      const previousChargeTotal = Number(invoiceDoc.additionalCharges ?? 0);
      const baseAmount = Number(invoiceDoc.totalAmount ?? 0) - previousChargeTotal;
      invoiceUpdate.totalAmount = Number((baseAmount + chargeTotal).toFixed(2));
      invoiceUpdate.grandTotal = Number(
        (Number(invoiceDoc.grandTotal ?? 0) - previousChargeTotal + chargeTotal).toFixed(2)
      );

      const updateResult = await invoiceCollection.updateOne(
        { _id: invoiceDoc._id },
        { $set: invoiceUpdate }
      );

      if (!updateResult.acknowledged || updateResult.modifiedCount === 0) {
        throw new Error('No matching invoice found to update');
      }
    }

    const ownershipFields = appendOwnershipForMongo({}, session);
    const deleteFilter: any = {
      invoiceId: parsed.invoiceId,
      $or: [
        ownershipFields,
        { userId: { $exists: false } },
        { userEmail: { $exists: false } },
      ],
    };

    await db.collection('invoice_adjustments').deleteMany(deleteFilter);

    if (normalizedCharges.length > 0) {
      const insertResult = await db.collection('invoice_adjustments').insertMany(
        normalizedCharges.map((item) =>
          appendOwnershipForMongo({
            invoiceId: parsed.invoiceId,
            masterId: invoiceMaster?._id?.toString(),
            name: item.description,
            amount: item.amount,
            note: '',
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
          }, session)
        )
      );

      if (!insertResult.acknowledged) {
        throw new Error('Failed to persist additional charges');
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        invoiceId: parsed.invoiceId,
        additionalChargeItems: normalizedCharges.map((item) => ({
          name: item.description,
          amount: item.amount,
        })),
        additionalCharges: Number(chargeTotal.toFixed(2)),
      },
    });
  } catch (error) {
    console.error('[POST /api/invoice/adjustments] error:', error);
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : 'Server error while saving invoice adjustments',
      },
      { status: 500 }
    );
  }
}
