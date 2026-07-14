import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { requireSession, getTenantFilterForMongo, appendOwnershipForMongo } from '@/lib/ownership';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { findInvoiceMasterByIdentifier, buildMonthlyInvoiceFromLedger, buildMonthlyInvoiceFromTransactions } from '@/app/api/invoice/utils';

const adjustmentPayloadSchema = z.object({
  invoiceId: z.string().min(1),
  additionalCharges: z.array(
    z.object({
      description: z.string().trim().min(1),
      amount: z.number().nonnegative(),
      sacCode: z.string().regex(/^[0-9]{6}$/, 'SAC Code must be exactly 6 numeric digits').optional().or(z.literal('')),
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
        sacCode: adjustment.sacCode || '',
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
    const tenantFilter = getTenantFilterForMongo(session);
    const invoiceCollection = db.collection('invoices');

    // Resolve invoiceMaster and invoiceDoc using robust ID parsing
    let invoiceMaster = null;
    let invoiceDoc = null;

    // 1. Try to find in invoice_master using identifier helper
    invoiceMaster = await findInvoiceMasterByIdentifier(db, parsed.invoiceId, tenantFilter);

    // 2. If not found in invoice_master, parse parts to find in invoices
    let clientId = '';
    let invoiceMonth = '';
    let parsedWarehouseId = '';
    if (parsed.invoiceId.includes('-')) {
      const parts = parsed.invoiceId.split('-');
      if (parts.length >= 3 && ObjectId.isValid(parts[0]) && /^\d{4}$/.test(parts[1]) && /^\d{2}$/.test(parts[2])) {
        clientId = parts[0];
        invoiceMonth = `${parts[1]}-${parts[2]}`;
        parsedWarehouseId = parts.length > 3 ? parts.slice(3).join('-') : '';
      }
    }

    if (invoiceMaster) {
      // Find matching invoiceDoc using fields from master
      const searchFilters: any[] = [{ invoiceId: invoiceMaster.invoiceId }, { invoiceNumber: invoiceMaster.invoiceId }];
      if (invoiceMaster._id) {
        searchFilters.push({ _id: invoiceMaster._id });
      }
      invoiceDoc = await invoiceCollection.findOne({ $or: searchFilters });
    } else if (clientId && invoiceMonth) {
      const [yearPart, monthPart] = invoiceMonth.split('-');
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthName = monthNames[parseInt(monthPart, 10) - 1] || '';
      const cycleName = invoiceMonth;
      const yearValue = parseInt(yearPart, 10);

      const invoiceQuery: any = {
        clientId,
        $or: [
          { month: `${monthName} ${yearValue}`, year: yearValue },
          { cycleName }
        ]
      };
      if (parsedWarehouseId) {
        try {
          invoiceQuery.warehouseId = ObjectId.isValid(parsedWarehouseId) ? new ObjectId(parsedWarehouseId) : parsedWarehouseId;
        } catch {
          invoiceQuery.warehouseId = parsedWarehouseId;
        }
      }
      invoiceDoc = await invoiceCollection.findOne(invoiceQuery);
    }

    if (!invoiceMaster && invoiceDoc) {
      invoiceMaster = invoiceDoc;
    }

    if (!invoiceMaster && clientId && invoiceMonth) {
      // Dynamically initialize invoice in invoice_master
      await buildMonthlyInvoiceFromLedger(db, parsed.invoiceId, parsedWarehouseId, tenantFilter);
      invoiceMaster = await findInvoiceMasterByIdentifier(db, parsed.invoiceId, tenantFilter);

      if (!invoiceMaster) {
        await buildMonthlyInvoiceFromTransactions(db, parsed.invoiceId, parsedWarehouseId, tenantFilter);
        invoiceMaster = await findInvoiceMasterByIdentifier(db, parsed.invoiceId, tenantFilter);
      }
    }

    if (!invoiceMaster) {
      throw new Error('Invoice not found');
    }

    const normalizedCharges = parsed.additionalCharges.map((item) => ({
      description: item.description,
      amount: Number(item.amount.toFixed(2)),
      sacCode: item.sacCode || '',
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
    const invoiceMasterId = invoiceMaster?._id?.toString?.();
    const deleteQuery: any = {
      ...ownershipFields,
      $or: [{ invoiceId: parsed.invoiceId }],
    };

    if (invoiceMasterId) {
      deleteQuery.$or.push({ masterId: invoiceMasterId });
    }

    await db.collection('invoice_adjustments').deleteMany(deleteQuery);

    if (normalizedCharges.length > 0) {
      const insertResult = await db.collection('invoice_adjustments').insertMany(
        normalizedCharges.map((item) =>
          appendOwnershipForMongo({
            invoiceId: parsed.invoiceId,
            masterId: invoiceMaster?._id?.toString(),
            name: item.description,
            amount: item.amount,
            sacCode: item.sacCode,
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

    const finalInvoiceMaster = await db.collection('invoice_master').findOne({
      $or: [
        ...(invoiceMaster?._id ? [{ _id: invoiceMaster._id }] : []),
        { invoiceId: parsed.invoiceId }
      ]
    });

    let totalTaxAmount = 0;
    let cgstAmount = 0;
    let sgstAmount = 0;
    let igstAmount = 0;
    let taxType = 'IGST';

    if (finalInvoiceMaster) {
      const TAX_RATES: Record<string, number> = {
        'Non-GST Supply': 0,
        'GST 5%': 0.05,
        'GST 12%': 0.12,
        'GST 18%': 0.18,
        'GST 28%': 0.28,
      };

      const taxGroup = finalInvoiceMaster.taxGroup || 'No Tax';
      const billingState = finalInvoiceMaster.billingState || '';
      const warehouseId = finalInvoiceMaster.warehouseId;
      let whState = '';
      if (warehouseId) {
        const warehouseQuery: any = {
          _id: ObjectId.isValid(warehouseId) ? new ObjectId(warehouseId) : warehouseId
        };
        const warehouse = await db.collection('warehouses').findOne(warehouseQuery);
        if (warehouse) {
          whState = warehouse.state || '';
        }
      }

      taxType = whState && billingState
        ? (whState.trim().toLowerCase() === billingState.trim().toLowerCase() ? 'CGST_SGST' : 'IGST')
        : '';

      const rentAmount = Number(finalInvoiceMaster.totalAmount ?? finalInvoiceMaster.totalRent ?? 0);
      const taxableAmount = rentAmount + chargeTotal;
      const taxRate = TAX_RATES[taxGroup] || 0;
      totalTaxAmount = Number((taxableAmount * taxRate).toFixed(2));

      if (totalTaxAmount > 0 && taxType) {
        if (taxType === 'CGST_SGST') {
          cgstAmount = Number((totalTaxAmount / 2).toFixed(2));
          sgstAmount = Number((totalTaxAmount / 2).toFixed(2));
        } else {
          igstAmount = totalTaxAmount;
        }
      }

      const taxUpdates = {
        totalTaxAmount,
        cgstAmount,
        sgstAmount,
        igstAmount,
        taxType,
        updatedAt: new Date(),
      };

      await db.collection('invoice_master').updateOne(
        { _id: finalInvoiceMaster._id },
        { $set: taxUpdates }
      );

      if (invoiceDoc) {
        await db.collection('invoices').updateOne(
          { _id: invoiceDoc._id },
          { $set: taxUpdates }
        );
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        invoiceId: parsed.invoiceId,
        additionalChargeItems: normalizedCharges.map((item) => ({
          name: item.description,
          amount: item.amount,
          sacCode: item.sacCode,
        })),
        additionalCharges: Number(chargeTotal.toFixed(2)),
        totalTaxAmount,
        cgstAmount,
        sgstAmount,
        igstAmount,
        taxType,
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
