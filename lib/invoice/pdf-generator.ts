/**
 * Invoice PDF Generator
 * Disabled in this deployment. Use HTML preview instead.
 */

import { InvoiceData } from './types';

export async function closeBrowser(): Promise<void> {
  return;
}

export async function generateInvoicePDF(
  invoiceData: InvoiceData,
  outputPath?: string,
  summary?: boolean
): Promise<Buffer> {
  throw new Error(
    'PDF generation is disabled for this deployment. Use HTML preview instead.'
  );
}

export async function generateInvoicesPDF(
  invoicesData: InvoiceData[],
  outputDirectory?: string
): Promise<Map<string, Buffer>> {
  throw new Error('PDF generation is disabled for this deployment.');
}

export async function saveInvoicePDF(invoiceData: InvoiceData, filePath: string): Promise<void> {
  throw new Error('PDF generation is disabled for this deployment.');
}
