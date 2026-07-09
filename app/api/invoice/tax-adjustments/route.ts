import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { requireSession, getTenantFilterForMongo } from '@/lib/ownership';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { findInvoiceMasterByIdentifier, buildMonthlyInvoiceFromLedger, buildMonthlyInvoiceFromTransactions } from '@/app/api/invoice/utils';

const taxAdjustmentSchema = z.object({
  invoiceId: z.string().min(1),
  billingState: z.string(),
  taxGroup: z.string().min(1),
  adjustment: z.number().optional(),
  notes: z.string().optional(),
});

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa",
  "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala",
  "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland",
  "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands",
  "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir",
  "Ladakh", "Lakshadweep", "Puducherry"
];

const TAX_RATES: Record<string, number> = {
  'Non-GST Supply': 0,
  'GST 5%': 0.05,
  'GST 12%': 0.12,
  'GST 18%': 0.18,
  'GST 28%': 0.28,
};

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const payload = await request.json();
    const parsed = taxAdjustmentSchema.parse(payload);

    const db = await getDb();
    const tenantFilter = getTenantFilterForMongo(session);

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
      invoiceDoc = await db.collection('invoices').findOne({ $or: searchFilters });
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
      invoiceDoc = await db.collection('invoices').findOne(invoiceQuery);
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
      return NextResponse.json({ success: false, message: 'Invoice not found' }, { status: 404 });
    }

    // 1. Get warehouse state from dedicated field
    const warehouseId = invoiceMaster.warehouseId;
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

    // Determine GST split type based on Warehouse State and Billing State
    const safeWhState = typeof whState === 'string' ? whState.trim().toLowerCase() : '';
    const safeBillingState = typeof parsed.billingState === 'string' ? parsed.billingState.trim().toLowerCase() : '';
    
    const taxType = safeWhState && safeBillingState
      ? (safeWhState === safeBillingState ? 'CGST_SGST' : 'IGST')
      : 'IGST';

    // 2. Fetch or compute the base rent and additional charges
    const rentAmount = Number(invoiceMaster.totalAmount ?? invoiceMaster.totalRent ?? 0) || 0;
    // Find additional charges total (from invoice_adjustments)
    const adjustments = await db.collection('invoice_adjustments').find({
      invoiceId: parsed.invoiceId
    }).toArray();
    const additionalCharges = adjustments.reduce((sum: number, item: any) => sum + (Number(item.amount) || 0), 0);

    const taxableAmount = rentAmount + additionalCharges;
    const taxRate = TAX_RATES[parsed.taxGroup] || 0;
    const totalTaxAmount = Number((taxableAmount * taxRate).toFixed(2)) || 0;

    let cgstAmount = 0;
    let sgstAmount = 0;
    let igstAmount = 0;

    if (totalTaxAmount > 0 && taxType) {
      if (taxType === 'CGST_SGST') {
        cgstAmount = Number((totalTaxAmount / 2).toFixed(2)) || 0;
        sgstAmount = Number((totalTaxAmount / 2).toFixed(2)) || 0;
      } else {
        igstAmount = totalTaxAmount;
      }
    }

    const adjustmentAmount = 0;
    const finalTotal = Number((taxableAmount + totalTaxAmount).toFixed(2));

    if (finalTotal < 0) {
      return NextResponse.json({ success: false, message: 'Total amount cannot be negative' }, { status: 400 });
    }

    const updateFields: any = {
      billingState: parsed.billingState,
      taxGroup: parsed.taxGroup,
      taxType,
      cgstAmount,
      sgstAmount,
      igstAmount,
      totalTaxAmount,
      adjustmentAmount,
      ...(parsed.notes !== undefined ? { notes: parsed.notes } : {}),
      updatedAt: new Date(),
    };

    // Update in invoice_master
    await db.collection('invoice_master').updateOne(
      { _id: invoiceMaster._id },
      { $set: updateFields }
    );

    // Update in invoices
    if (invoiceDoc) {
      await db.collection('invoices').updateOne(
        { _id: invoiceDoc._id },
        { $set: updateFields }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        invoiceId: parsed.invoiceId,
        billingState: parsed.billingState,
        taxGroup: parsed.taxGroup,
        taxType,
        cgstAmount,
        sgstAmount,
        igstAmount,
        totalTaxAmount,
        adjustmentAmount,
        notes: parsed.notes,
      }
    });

  } catch (error: any) {
    console.error('[POST /api/invoice/tax-adjustments] error:', error);
    return NextResponse.json({ success: false, message: error.message || 'Server error' }, { status: 500 });
  }
}
