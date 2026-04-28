'use server';

import { getDb } from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { calculateRent } from '@/lib/pricing-engine';
import { DetailedLogisticsValues, DetailedLogisticsSchema } from '@/lib/validations/booking';

// Static rate fallback — mirrors the STATIC_COMMODITIES in booking-form.tsx.
// Used when the commodity hasn't been added to the DB Master yet.
const STATIC_RATE_FALLBACK: Record<string, number> = {
  WHEAT: 85,
  RICE: 90,
  CHANA: 95,
  SOYABEAN: 80,
  MUSTARD: 88,
  CORN: 75,
  COTTON: 120,
};

export async function createDetailedBooking(formData: DetailedLogisticsValues) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return { success: false, message: 'Unauthorized session.' };
    }

    // ── FULL PAYLOAD DEBUG ────────────────────────────────────────────────────
    // Shows the complete un-truncated object (replaces "16 items not stringified")
    console.log('\n=== [billing.ts] createDetailedBooking received ===');
    console.dir(formData, { depth: null });
    console.log('===================================================\n');

    // ── ZOD SERVER-SIDE VALIDATION ────────────────────────────────────────────
    // Double-checks the payload that crossed the network boundary
    const parsed = DetailedLogisticsSchema.safeParse(formData);
    if (!parsed.success) {
      console.error('[billing.ts] Server-side Zod validation failed:', parsed.error.flatten());
      return {
        success: false,
        message: 'Data validation failed on server. Check console for field errors.',
      };
    }
    const data = parsed.data; // Use the clean, coerced data from here on

    const db = await getDb();

    // ── 1. ATOMIC AUTO-INCREMENT SNO ──────────────────────────────────────────
    const counterDoc = await db.collection<{ _id: string; seq: number }>('counters').findOneAndUpdate(
      { _id: 'ledgerSerialNo' },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after' }
    );
    const sNo = counterDoc?.seq ?? 1;

    // ── 2. RATE LOOKUP (DB first, static fallback second) ─────────────────────
    // This prevents the "Rate not found" hard-fail when using static commodity names
    // before they've been added to the Commodity Master dashboard.
    const commodityName = data.commodityName.toUpperCase();
    const commodityDoc = await db.collection('commodities').findOne({ name: commodityName });

    let ratePerTon: number;
    if (commodityDoc?.baseRate) {
      ratePerTon = commodityDoc.baseRate;
      console.log(`[billing.ts] Rate from DB: ₹${ratePerTon}/MT for ${commodityName}`);
    } else if (STATIC_RATE_FALLBACK[commodityName] !== undefined) {
      ratePerTon = STATIC_RATE_FALLBACK[commodityName];
      console.warn(`[billing.ts] Using static fallback rate: ₹${ratePerTon}/MT for ${commodityName}. Add it to /dashboard/commodities for a live rate.`);
    } else {
      return {
        success: false,
        message: `No rate found for "${data.commodityName}". Please add it to the Commodity Master first.`,
      };
    }

    // ── 3. PRO-RATA BILLING CALCULATION ──────────────────────────────────────
    const inwardDate = data.date;
    const outwardDate = new Date(new Date(data.date).getTime() + data.storageDays * 86400000)
      .toISOString()
      .slice(0, 10);

    const rent = calculateRent(data.mt, ratePerTon, inwardDate, outwardDate);

    console.log(
      `[billing.ts] Pro-Rata: ${rent.totalDays}d × ${data.mt}MT × ₹${ratePerTon}/mo = ` +
      `Storage ₹${rent.storageRent} = ₹${rent.totalAmount}`
    );
    console.log('[billing.ts] Full Rent Breakdown:', rent);

    // ── 4. MONGO LEDGER INSERTION (all 16+ fields) ────────────────────────────
    const newBooking = {
      sNo,
      userId:    (session.user as any).id,
      userEmail: session.user.email,

      // Direct spread of coerced, validated data — all 16 fields present
      direction:     data.direction,
      date:          data.date,
      warehouseName: data.warehouseName,
      location:      data.location,
      clientName:    data.clientName,
      clientLocation: data.clientLocation ?? '',
      suppliers:     data.suppliers ?? '',
      commodityName: commodityName, // Always stored uppercase
      cadNo:         data.cadNo ?? '',
      stackNo:       data.stackNo ?? '',
      lotNo:         data.lotNo ?? '',
      doNumber:      data.doNumber ?? '',
      cdfNo:         data.cdfNo ?? '',
      gatePass:      data.gatePass,
      pass:          data.pass ?? '',
      bags:          Number(data.bags),
      palaBags:      Number(data.palaBags),
      mt:            Number(data.mt),
      storageDays:   Number(data.storageDays),

      status:    'PENDING_APPROVAL',
      createdAt: new Date(),
    };

    const bookingRes = await db.collection('bookings').insertOne(newBooking);
    console.log(`[billing.ts] Booking inserted: ID ${bookingRes.insertedId}, S.No #${sNo}`);

    // ── 5. GENERATE IMMUTABLE INVOICE ─────────────────────────────────────────
    const invoiceDoc = {
      bookingId:    bookingRes.insertedId,
      sNo,
      clientEmail:  session.user.email,
      customerName: data.clientName,
      commodity:    commodityName,

      // Pro-rata breakdown stored for transparent customer invoicing
      totalDays:          rent.totalDays,
      weightMT:           rent.weightMT,
      appliedRate:        rent.appliedRate,
      dailyRate:          rent.dailyRate,
      monthlyRent:        rent.monthlyRent,
      storageRent:        rent.storageRent,
      totalAmount:        rent.totalAmount,

      // Legacy field aliases for backward compat with invoice-table / PDF
      rateApplied:        rent.appliedRate,
      subtotal:           rent.storageRent,
      durationDays:       rent.totalDays,

      // Initialize payment fields
      paidAmount:         0,
      pendingAmount:      rent.totalAmount,

      status:       'UNPAID',
      generatedAt:  new Date(),
    };

    // DISABLED: Invoice auto-generation stopped as per user request
    // const invoiceRes = await db.collection('invoices').insertOne(invoiceDoc);
    // console.log(`[billing.ts] Invoice inserted: ID ${invoiceRes.insertedId}`);
    // console.log(`[billing.ts] Invoice Amount: ₹${invoiceDoc.totalAmount} (matches rent.totalAmount: ${invoiceDoc.totalAmount === rent.totalAmount ? '✓' : '✗'})`);

    return {
      success: true,
      serialNo: sNo,
      // invoiceId: invoiceRes.insertedId.toString(),
      message: `Booking S.No #${sNo} saved successfully.`,
    };

  } catch (error: any) {
    console.error('[billing.ts] FATAL SERVER ACTION ERROR:', error);
    return { success: false, message: error.message || 'Internal Database Exception.' };
  }
}
