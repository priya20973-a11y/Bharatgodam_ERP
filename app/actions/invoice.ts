'use server';

import { getDb } from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ObjectId } from 'mongodb';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

type AdditionalChargeItem = {
  description: string;
  amount: number;
  createdAt: Date;
  updatedAt: Date;
};

type InvoiceDocument = {
  _id: ObjectId;
  invoiceId?: string;
  invoiceNumber?: string;
  additionalChargeItems?: AdditionalChargeItem[];
  additionalCharges?: number;
  grandTotal?: number;
  baseStorageCharges?: number;
  subtotal?: number;
  totalAmount?: number;
  taxAmount?: number;
};

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
  try {
    const parsed = invoiceChargeSchema.parse({ invoiceId, description, amount });
    const safeAmount = Number(parsed.amount);
    if (Number.isNaN(safeAmount)) {
      throw new Error('Amount must be a valid number');
    }

    const session = await getServerSession(authOptions);
    if (!session?.user) {
      throw new Error('Unauthorized');
    }

    const db = await getDb();
    const invoiceCollection = db.collection<InvoiceDocument>('invoices');
    const adjustmentCollection = db.collection('invoice_adjustments');

    const invoiceObjectId = ObjectId.isValid(parsed.invoiceId)
      ? new ObjectId(parsed.invoiceId)
      : undefined;

    const searchFilters: Array<Record<string, unknown>> = [];
    if (invoiceObjectId) {
      searchFilters.push({ _id: invoiceObjectId });
    }
    searchFilters.push({ invoiceNumber: parsed.invoiceId }, { invoiceId: parsed.invoiceId });

    const invoiceDoc = await invoiceCollection.findOne({
      $or: searchFilters,
    });

    const invoiceMaster =
      invoiceDoc ??
      (await db.collection('invoice_master').findOne({ invoiceId: parsed.invoiceId }));

    const additionalCharge = {
      description: parsed.description,
      amount: Number(safeAmount.toFixed(2)),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (invoiceDoc) {
      const existingCharges = Array.isArray(invoiceDoc.additionalChargeItems)
        ? invoiceDoc.additionalChargeItems
        : [];
      const updatedCharges = [...existingCharges, additionalCharge];
      const chargeTotal = updatedCharges.reduce(
        (sum, item) => sum + Number(item.amount || 0),
        0
      );

      const updateResult = await invoiceCollection.updateOne(
        { _id: invoiceDoc._id },
        {
          $push: {
            additionalChargeItems: additionalCharge,
          },
          $inc: {
            totalAmount: Number(safeAmount.toFixed(2)),
          },
          $set: {
            additionalCharges: Number(chargeTotal.toFixed(2)),
            updatedAt: new Date(),
          },
        }
      );

      if (!updateResult.acknowledged || updateResult.modifiedCount === 0) {
        throw new Error('No matching invoice found to update');
      }
    }

    const insertResult = await adjustmentCollection.insertOne({
      invoiceId: parsed.invoiceId,
      masterId: invoiceMaster?._id?.toString(),
      name: parsed.description,
      amount: Number(safeAmount.toFixed(2)),
      note: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    if (!insertResult.acknowledged) {
      throw new Error('Failed to persist additional charge');
    }

    revalidatePath('/dashboard/client-invoices');
    revalidatePath('/dashboard/invoices');

    return {
      success: true,
      data: {
        invoiceId: parsed.invoiceId,
        additionalChargeItems: [
          {
            description: additionalCharge.description,
            amount: additionalCharge.amount,
          },
        ],
        additionalCharges: Number(additionalCharge.amount.toFixed(2)),
      },
    };
  } catch (error) {
    console.error('DETAILED_ERROR:', error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'An unexpected error occurred while saving the charge.',
    };
  }
}

export async function saveAdditionalCharge(
  invoiceId: string,
  description: string,
  amount: number
) {
  return saveInvoiceAdditionalCharge(invoiceId, description, amount);
}

export async function saveInvoiceAdditionalCharges(
  invoiceId: string,
  additionalCharges: Array<{ description: string; amount: number }>
) {
  try {
    const parsed = invoiceChargesBatchSchema.parse({ invoiceId, additionalCharges });

    if (!parsed.additionalCharges || parsed.additionalCharges.length === 0) {
      throw new Error('At least one charge row must be provided.');
    }

    const session = await getServerSession(authOptions);
    if (!session?.user) {
      throw new Error('Unauthorized');
    }

    const db = await getDb();
    const invoiceCollection = db.collection<InvoiceDocument>('invoices');
    const invoiceObjectId = ObjectId.isValid(parsed.invoiceId)
      ? new ObjectId(parsed.invoiceId)
      : undefined;

    const searchFilters: Array<Record<string, unknown>> = [];
    if (invoiceObjectId) {
      searchFilters.push({ _id: invoiceObjectId });
    }
    searchFilters.push({ invoiceNumber: parsed.invoiceId }, { invoiceId: parsed.invoiceId });

    const invoiceDoc = await invoiceCollection.findOne({
      $or: searchFilters,
    });

    const invoiceMaster =
      invoiceDoc ??
      (await db.collection('invoice_master').findOne({ invoiceId: parsed.invoiceId }));

    const normalizedCharges = parsed.additionalCharges.map((item) => {
      const safeAmount = Number(item.amount);
      if (Number.isNaN(safeAmount)) {
        throw new Error('Each charge amount must be a valid number');
      }

      return {
        description: item.description,
        amount: Number(safeAmount.toFixed(2)),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    });

    const chargeTotal = normalizedCharges.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0
    );

    const baseStorageAmount = Number(
      invoiceMaster?.baseStorageCharges ??
        invoiceMaster?.subtotal ??
        invoiceMaster?.totalAmount ??
        0
    );
    const taxAmount = Number(invoiceMaster?.taxAmount ?? 0);
    const grandTotal = Number((baseStorageAmount + chargeTotal + taxAmount).toFixed(2));

    if (invoiceDoc) {
      const previousChargeTotal = Number(invoiceDoc.additionalCharges ?? 0);
      const baseAmount = Number(invoiceDoc.totalAmount ?? 0) - previousChargeTotal;
      const newTotalAmount = Number((baseAmount + chargeTotal).toFixed(2));

      const updateResult = await invoiceCollection.updateOne(
        { _id: invoiceDoc._id },
        {
          $set: {
            additionalCharges: Number(chargeTotal.toFixed(2)),
            additionalChargeItems: normalizedCharges,
            totalAmount: newTotalAmount,
            grandTotal,
            updatedAt: new Date(),
          },
        }
      );

      if (!updateResult.acknowledged || updateResult.modifiedCount === 0) {
        throw new Error('No matching invoice found to update');
      }
    }

    await db.collection('invoice_adjustments').deleteMany({
      invoiceId: parsed.invoiceId,
    });

    if (normalizedCharges.length > 0) {
      const insertResult = await db.collection('invoice_adjustments').insertMany(
        normalizedCharges.map((item) => ({
          invoiceId: parsed.invoiceId,
          masterId: invoiceMaster?._id?.toString(),
          name: item.description,
          amount: item.amount,
          note: '',
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        }))
      );

      if (!insertResult.acknowledged) {
        throw new Error('Failed to persist additional charges');
      }
    }

    revalidatePath('/dashboard/client-invoices');
    revalidatePath('/dashboard/invoices');

    return {
      success: true,
      data: {
        invoiceId: parsed.invoiceId,
        additionalChargeItems: normalizedCharges.map((item) => ({
          name: item.description,
          amount: item.amount,
        })),
        additionalCharges: Number(chargeTotal.toFixed(2)),
        grandTotal,
      },
    };
  } catch (error) {
    console.error('DETAILED_ERROR:', error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'An unexpected error occurred while saving additional charges.',
    };
  }
}
