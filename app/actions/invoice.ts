'use server';

import { getDb } from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ObjectId } from 'mongodb';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const invoiceChargeSchema = z.object({
  invoiceId: z.string().min(1, 'Invoice ID is required'),
  description: z.string().trim().min(1, 'Description is required'),
  amount: z.number().nonnegative('Amount must be zero or greater'),
});

const invoiceChargesBatchSchema = z.object({
  invoiceId: z.string().min(1, 'Invoice ID is required'),
  additionalCharges: z
    .array(
      z.object({
        description: z.string().trim().min(1, 'Description is required'),
        amount: z.number().nonnegative('Amount must be zero or greater'),
      })
    )
    .optional(),
});

export async function saveInvoiceAdditionalCharge(
  invoiceId: string,
  description: string,
  amount: number
) {
  const parsed = invoiceChargeSchema.parse({ invoiceId, description, amount });

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    throw new Error('Unauthorized');
  }

  const db = await getDb();

  const invoiceDoc = await db.collection('invoices').findOne({
    $or: [
      { _id: ObjectId.isValid(parsed.invoiceId) ? new ObjectId(parsed.invoiceId) : undefined },
      { invoiceNumber: parsed.invoiceId },
      { invoiceId: parsed.invoiceId },
    ].filter(Boolean),
  });

  const invoiceMaster =
    invoiceDoc ??
    (await db.collection('invoice_master').findOne({ invoiceId: parsed.invoiceId }));

  if (!invoiceMaster) {
    throw new Error('Please save the baseline invoice before adding extra charges.');
  }

  const additionalCharge = {
    description: parsed.description,
    amount: Number(parsed.amount.toFixed(2)),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const existingCharges = Array.isArray(invoiceRecord.additionalChargeItems)
    ? invoiceRecord.additionalChargeItems
    : [];

  const updatedCharges = [...existingCharges, additionalCharge];
  const chargeTotal = updatedCharges.reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0
  );

  const baseStorageAmount = Number(
    invoiceMaster.baseStorageCharges ??
      invoiceMaster.subtotal ??
      invoiceMaster.totalAmount ??
      0
  );
  const taxAmount = Number(invoiceMaster.taxAmount ?? 0);

  const grandTotal = Number(
    (baseStorageAmount + chargeTotal + taxAmount).toFixed(2)
  );

  if (invoiceDoc) {
    await db.collection('invoices').updateOne(
      { _id: invoiceDoc._id },
      {
        $push: {
          additionalChargeItems: additionalCharge,
        },
        $set: {
          additionalCharges: Number(chargeTotal.toFixed(2)),
          grandTotal,
          updatedAt: new Date(),
        },
      }
    );
  }

  // Maintain compatibility with the current invoice preview / adjustment lookup path.
  await db.collection('invoice_adjustments').insertOne({
    invoiceId: parsed.invoiceId,
    name: parsed.description,
    amount: Number(parsed.amount.toFixed(2)),
    note: '',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  revalidatePath('/dashboard/client-invoices');
  revalidatePath('/dashboard/invoices');

  return {
    success: true,
    additionalCharge: additionalCharge,
    additionalCharges: Number(chargeTotal.toFixed(2)),
    grandTotal,
  };
}

export async function saveInvoiceAdditionalCharges(
  invoiceId: string,
  additionalCharges: Array<{ description: string; amount: number }>
) {
  const parsed = invoiceChargesBatchSchema.parse({ invoiceId, additionalCharges });

  if (!parsed.additionalCharges || parsed.additionalCharges.length === 0) {
    throw new Error('At least one charge row must be provided.');
  }

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    throw new Error('Unauthorized');
  }

  const db = await getDb();

  const invoiceDoc = await db.collection('invoices').findOne({
    $or: [
      { _id: ObjectId.isValid(parsed.invoiceId) ? new ObjectId(parsed.invoiceId) : undefined },
      { invoiceNumber: parsed.invoiceId },
      { invoiceId: parsed.invoiceId },
    ].filter(Boolean),
  });

  const invoiceMaster =
    invoiceDoc ??
    (await db.collection('invoice_master').findOne({ invoiceId: parsed.invoiceId }));

  if (!invoiceMaster) {
    throw new Error('Please save the baseline invoice before adding extra charges.');
  }

  const normalizedCharges = parsed.additionalCharges.map((item) => ({
    description: item.description,
    amount: Number(item.amount.toFixed(2)),
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  const chargeTotal = normalizedCharges.reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0
  );

  const baseStorageAmount = Number(
    invoiceMaster.baseStorageCharges ??
      invoiceMaster.subtotal ??
      invoiceMaster.totalAmount ??
      0
  );
  const taxAmount = Number(invoiceMaster.taxAmount ?? 0);
  const grandTotal = Number((baseStorageAmount + chargeTotal + taxAmount).toFixed(2));

  if (invoiceDoc) {
    await db.collection('invoices').updateOne(
      { _id: invoiceDoc._id },
      {
        $set: {
          additionalChargeItems: normalizedCharges,
          additionalCharges: Number(chargeTotal.toFixed(2)),
          grandTotal,
          updatedAt: new Date(),
        },
      }
    );
  }

  await db.collection('invoice_adjustments').deleteMany({
    invoiceId: parsed.invoiceId,
  });

  if (normalizedCharges.length > 0) {
    await db.collection('invoice_adjustments').insertMany(
      normalizedCharges.map((item) => ({
        invoiceId: parsed.invoiceId,
        name: item.description,
        amount: item.amount,
        note: '',
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }))
    );
  }

  revalidatePath('/dashboard/client-invoices');
  revalidatePath('/dashboard/invoices');

  return {
    success: true,
    additionalCharges: Number(chargeTotal.toFixed(2)),
    grandTotal,
  };
}
