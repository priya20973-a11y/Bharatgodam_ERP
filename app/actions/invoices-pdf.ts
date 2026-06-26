/**
 * Invoice Generation Server Action
 * Example usage for generating invoices in a Next.js application
 */

'use server';

import {
  generateInvoicePDF,
  closeBrowser,
  InvoiceData,
  InvoiceValidator,
} from '@/lib/invoice';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

/**
 * Get invoice data from database by invoice ID
 */
export async function getInvoiceData(invoiceId: string): Promise<InvoiceData | null> {
  try {
    const db = await getDb();

    // Get invoice from the invoices collection
    let invoice;
    try {
      invoice = await db.collection('invoices').findOne({
        _id: new ObjectId(invoiceId)
      });
    } catch (err) {
      // If ID is not a valid ObjectId, try finding by invoiceId field
      invoice = await db.collection('invoices').findOne({
        invoiceId: invoiceId
      });
    }

    if (!invoice) {
      console.warn(`Invoice not found: ${invoiceId}`);
      return null;
    }

    // Get client and warehouse info
    const client = await db.collection('clients').findOne({
      _id: invoice.clientId
    });

    const warehouse = await db.collection('warehouses').findOne({
      _id: invoice.warehouseId
    });

    if (!client || !warehouse) {
      console.error('Client or warehouse not found for invoice');
      return null;
    }

    // Convert to InvoiceData format
    const invoiceData: InvoiceData = {
      company: {
        name: 'POSSIBLE WAREHOUSING LLP',
        address: '123 Warehouse Complex, Industrial Area, Mumbai - 400088',
        email: 'info@possiblewarehousing.com',
        website: 'www.possiblewarehousing.com',
        phone: '+91-22-XXXX-XXXX',
        gstin: '24AAWFP7490F1ZN',
      },
      customer: {
        name: client.name || 'Unknown Client',
        area: warehouse.location || warehouse.name || 'Unknown Location',
        city: 'Mumbai',
        district: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
        contact: client.mobile || '+91-XXXX-XXXXXX',
      },
      metadata: {
        invoiceNo: invoice.invoiceId || `INV-${invoice.cycleName}`,
        invoiceDate: new Date().toLocaleDateString('en-IN', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        }),
        gstin: '24AAWFP7490F1ZN',
      },
      lineItems: (invoice.items || []).map((item: any, index: number) => ({
        whCode: `WH-${index + 1}`,
        billFrom: warehouse.name || 'Main Warehouse',
        itemName: `${item.commodityName} Storage`,
        corNo: `COR-${invoiceId.slice(-6)}`,
        billTo: client.name || 'Client',
        quantity: item.quantityMT || 0,
        weight: item.quantityMT || 0,
        month: invoice.cycleName || new Date().toISOString().slice(0, 7),
        days: item.durationDays || 0,
        ratePerUnit: item.rateApplied || 0,
        storageChargesPerMonth: item.rateApplied ? (item.rateApplied * 30) : 0,
        amount: item.subtotal || 0,
      })),
      financial: {
        basicTotal: invoice.totalAmount || 0,
        roundOff: 0,
        netAmount: invoice.totalAmount || 0,
      },
      bankDetails: {
        bankName: 'State Bank of India',
        accountName: 'ABC Warehousing Pvt. Ltd.',
        branchName: 'Industrial Area Branch',
        accountNumber: '123456789012',
        ifscCode: 'SBIN0001234',
      },
      termsAndConditions: [
        {
          title: 'Payment Terms',
          description: 'Payment due within 30 days of invoice date.',
        },
        {
          title: 'Late Payment',
          description: 'Late payments may incur additional charges.',
        },
        {
          title: 'Storage Terms',
          description: 'Goods stored at owner\'s risk. Warehouse not liable for loss or damage.',
        },
      ],
    };

    return invoiceData;
  } catch (error) {
    console.error('Failed to get invoice data:', error);
    return null;
  }
}

/**
 * Generate invoice and save to the public directory
 * Returns the URL to download
 */
export async function generateAndSaveInvoice(invoiceData: InvoiceData): Promise<string> {
  try {
    const pdfBuffer = await generateInvoicePDF(invoiceData);

    // Save to public directory for download
    const publicDir = join(process.cwd(), 'public', 'invoices');
    const fileName = `${invoiceData.metadata.invoiceNo.replace(/\//g, '-')}_${Date.now()}.pdf`;
    const filePath = join(publicDir, fileName);

    await writeFile(filePath, pdfBuffer);

    // Return public URL
    return `/invoices/${fileName}`;
  } catch (error) {
    console.error('Failed to generate and save invoice:', error);
    throw error;
  }
}

/**
 * Example API route handler
 * Usage: POST /api/invoices/generate
 * Body: { invoiceData: InvoiceData }
 */
export async function handleGenerateInvoiceAPI(invoiceData: InvoiceData): Promise<Buffer> {
  try {
    const pdfBuffer = await generateInvoicePDF(invoiceData);
    return pdfBuffer;
  } catch (error) {
    throw error;
  } finally {
    // Close browser when done to free resources
    await closeBrowser();
  }
}
