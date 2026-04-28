'use server';

import { MonthlyInvoiceData } from './monthly-invoices';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

let cachedLogoDataUri: string | null = null;

async function getLogoDataUri(): Promise<string> {
  if (cachedLogoDataUri) return cachedLogoDataUri;

  const logoUrl = 'https://drive.google.com/uc?export=download&id=1wto5h8b-d-Cp6qJVnbaJWcCg_VBtWZrj';
  try {
    const response = await fetch(logoUrl);
    if (!response.ok) {
      throw new Error(`Failed to download logo: ${response.status}`);
    }
    const contentType = response.headers.get('content-type') || 'image/png';
    const buffer = Buffer.from(await response.arrayBuffer());
    cachedLogoDataUri = `data:${contentType};base64,${buffer.toString('base64')}`;
    return cachedLogoDataUri;
  } catch (error) {
    console.error('Logo fetch failed:', error);
    return '';
  }
}

function formatAmount(value: number): string {
  return value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatInvoiceDate(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return dateString;
  }
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatBillingMonth(month: string | number | undefined): string {
  const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  if (month === undefined || month === null) return 'UNKNOWN';
  const value = String(month).trim();
  const numeric = Number(value);
  if (!Number.isNaN(numeric) && numeric >= 1 && numeric <= 12) {
    return monthNames[numeric - 1];
  }
  const normalized = value.replace(/[^a-zA-Z ]/g, '').trim().toUpperCase();
  const key = normalized.split(' ')[0];
  const mapping: Record<string, string> = {
    JANUARY: 'JAN', FEBRUARY: 'FEB', MARCH: 'MAR', APRIL: 'APR', MAY: 'MAY', JUNE: 'JUN',
    JULY: 'JUL', AUGUST: 'AUG', SEPTEMBER: 'SEP', OCTOBER: 'OCT', NOVEMBER: 'NOV', DECEMBER: 'DEC',
    JAN: 'JAN', FEB: 'FEB', MAR: 'MAR', APR: 'APR', JUN: 'JUN', JUL: 'JUL', AUG: 'AUG', SEP: 'SEP', OCT: 'OCT', NOV: 'NOV', DEC: 'DEC',
  };
  return mapping[key] || normalized.replace(/\s+/g, '').toUpperCase();
}

function normalizeMonthForInvoiceMonth(month: string | number | undefined): string {
  if (month === undefined || month === null) return '00';
  const value = String(month).trim().toUpperCase();
  const numeric = Number(value);
  if (!Number.isNaN(numeric) && numeric >= 1 && numeric <= 12) {
    return String(numeric).padStart(2, '0');
  }
  const mapping: Record<string, string> = {
    JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
    JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
    JANUARY: '01', FEBRUARY: '02', MARCH: '03', APRIL: '04', JUNE: '06',
    JULY: '07', AUGUST: '08', SEPTEMBER: '09', OCTOBER: '10', NOVEMBER: '11', DECEMBER: '12',
  };
  return mapping[value] || value.padStart(2, '0');
}

async function getInvoiceNumber(invoice: MonthlyInvoiceData): Promise<string> {
  if (invoice.invoiceNumber) {
    return invoice.invoiceNumber;
  }

  if (!invoice.warehouseId) {
    return 'INV/UNKNOWN/00000';
  }

  const db = await getDb();
  const warehouse = await db.collection('warehouses').findOne({ _id: new ObjectId(invoice.warehouseId) });
  if (!warehouse) {
    return 'INV/UNKNOWN/00000';
  }

  const warehouseName = warehouse.name || 'UNKNOWN';
  const wspInitials = warehouseName.split(' ').map((word: string) => word.charAt(0).toUpperCase()).join('');

  const monthPart = formatBillingMonth(invoice.month);
  const yearPart = invoice.year ? String(invoice.year).trim() : 'UNKNOWN';

  const invoiceMonth = `${yearPart}-${normalizeMonthForInvoiceMonth(invoice.month)}`;

  const query = {
    warehouseId: new ObjectId(invoice.warehouseId),
    invoiceMonth,
    invoiceId: { $regex: `^${wspInitials}/${monthPart}/${yearPart}/\\d{5}$` }
  };

  const existingInvoices = await db.collection('invoice_master')
    .find(query)
    .project({ invoiceId: 1 })
    .toArray();

  const maxSerial = existingInvoices.reduce((max: number, inv: any) => {
    const match = inv.invoiceId?.match(/\/(\d{5})$/);
    if (!match) return max;
    return Math.max(max, Number(match[1]));
  }, 0);

  const serial = String(maxSerial + 1).padStart(5, '0');
  return `${wspInitials}/${monthPart}/${yearPart}/${serial}`;
}

function getTotalDue(invoice: MonthlyInvoiceData): number {
  if (invoice.newBalance !== undefined && invoice.newBalance !== null) {
    return invoice.newBalance;
  }
  const previous = invoice.previousBalance || 0;
  const payments = invoice.currentPayments || 0;
  return Math.max(0, invoice.totalRent + previous - payments);
}

export async function generateMonthlyInvoiceHTML(invoice: MonthlyInvoiceData): Promise<string> {
  const companyName = 'AGRI CROP CARE';
  const companyAddress = 'Agri crop care Warehouse, Vraj 3, Patidad road, Gundala, Gondal';
  const contactEmail = 'agricropwl@outlook.com';
  const contactPhone = '+91 9913305200';
  const logoSrc = await getLogoDataUri();
  const invoiceDate = formatInvoiceDate(invoice.invoiceDate);
  const totalDue = getTotalDue(invoice);
  const totalQty = invoice.periods.reduce((sum, period) => sum + (period.quantityMT || 0), 0);
  const firstCommodity = invoice.periods[0]?.commodityName || 'General';
  const panNumber = invoice.panNumber ? invoice.panNumber : '';
  const gstNumber = invoice.gstNumber ? invoice.gstNumber : '';

  const periodsList = invoice.periods
    .map(
      (p) => `
        <tr>
          <td>${p.commodityName || 'Unknown'}</td>
          <td>${p.startDate}</td>
          <td>${p.endDate}</td>
          <td style="text-align: right;">${formatAmount(p.quantityMT)}</td>
          <td style="text-align: right;">${p.daysTotal}</td>
          <td style="text-align: right;">₹${formatAmount(p.rentTotal)}</td>
          <td>${p.status}</td>
        </tr>
      `
    )
    .join('');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Monthly Invoice - ${invoice.clientName}</title>
      <style>
        * {
          box-sizing: border-box;
          font-family: 'Arial', sans-serif;
        }
        body {
          margin: 0;
          padding: 20px;
          background: white;
          color: #111827;
        }
        .invoice-container {
          width: 100%;
          max-width: none;
          margin: 0;
          background: white;
          border-radius: 0;
          overflow: visible;
          box-shadow: none;
        }
        .invoice-body {
          padding: 32px 40px;
        }
        .header-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 20px;
        }
        .logo-block {
          display: flex;
          flex-direction: column;
          gap: 16px;
          max-width: 320px;
        }
        .logo-image {
          width: 150px;
          object-fit: contain;
        }
        .company-name {
          font-size: 18px;
          font-weight: 800;
          color: #0f6f2c;
          margin-bottom: 8px;
        }
        .company-details {
          font-size: 12px;
          color: #475569;
          line-height: 1.6;
        }
        .invoice-meta {
          text-align: right;
          min-width: 180px;
          font-size: 12px;
          color: #475569;
        }
        .invoice-meta-title {
          color: #0f6f2c;
          font-size: 16px;
          font-weight: 700;
          text-transform: uppercase;
          margin-bottom: 16px;
        }
        .invoice-meta p {
          margin: 4px 0;
        }
        .separator {
          height: 2px;
          background: #0f6f2c;
          margin: 26px 0;
          border: none;
        }
        .bill-section {
          padding: 0 0 0 0;
        }
        .bill-title {
          font-size: 18px;
          font-weight: 800;
          margin-bottom: 12px;
        }
        .bill-name {
          font-size: 14px;
          font-weight: 700;
          color: #111827;
          margin-bottom: 12px;
        }
        .bill-detail {
          font-size: 12px;
          color: #475569;
          margin: 0 0 4px;
        }
        .commodity-info {
          font-size: 12px;
          color: #475569;
          margin: 18px 0 18px;
        }
        .table-wrapper {
          overflow-x: auto;
        }
        .items-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
          color: #475569;
        }
        .items-table th,
        .items-table td {
          padding: 12px 10px;
          border-bottom: 1px solid #e2e8f0;
        }
        .items-table th {
          text-align: left;
          font-weight: 700;
          color: #111827;
          background: #f8fafc;
        }
        .items-table td {
          vertical-align: middle;
        }
        .items-table td.amount,
        .items-table td.days,
        .items-table td.qty {
          text-align: right;
        }
        .summary-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 24px;
          margin-top: 18px;
          flex-wrap: wrap;
        }
        .summary-box {
          min-width: 240px;
          max-width: 320px;
        }
        .bank-details {
          flex: 1 1 320px;
          min-width: 260px;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 18px;
          background: #f8fafc;
        }
        .bank-details strong {
          display: block;
          margin-bottom: 10px;
          font-size: 13px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #0f6f2c;
        }
        .bank-details p {
          margin: 4px 0;
          color: #475569;
          font-size: 12px;
          line-height: 1.6;
        }
        .summary-item {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
          color: #475569;
          margin-bottom: 10px;
        }
        .summary-item.total {
          font-weight: 800;
          color: #0f6f2c;
          font-size: 15px;
          margin-top: 8px;
          border-top: 1px solid #e2e8f0;
          padding-top: 10px;
        }
        .bank-details {
          width: 320px;
          font-size: 12px;
          color: #111827;
          line-height: 1.6;
        }
        .bank-details strong {
          display: block;
          margin-bottom: 10px;
          font-size: 13px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .bank-details p {
          margin: 4px 0;
        }
        .note {
          display: block;
          width: 100%;
          padding: 10px 0 0 0;
          font-size: 10px;
          color: #000000;
          text-align: center;
          margin: 14px auto 0;
          font-weight: 400;
        }
      </style>
    </head>
    <body>
      <div class="invoice-container">
        <div class="invoice-body">
          <div class="header-row">
            <div class="logo-block">
              ${logoSrc ? `<img class="logo-image" src="${logoSrc}" alt="Agri Crop Care Logo" />` : `<div class="company-name">${companyName}</div>`}
              <div>
                <div class="company-name">${companyName}</div>
                <div class="company-details">
                  ${companyAddress}<br />
                  Email: ${contactEmail}<br />
                  Phone: ${contactPhone}
                </div>
              </div>
            </div>
            <div class="invoice-meta">
              <div class="invoice-meta-title">Monthly Invoice</div>
              <p><strong>Invoice Number:</strong> ${await getInvoiceNumber(invoice)}</p>
              <p><strong>Month:</strong> ${invoice.month} ${invoice.year}</p>
              <p><strong>Date:</strong> ${invoiceDate}</p>
            </div>
          </div>
          <hr class="separator" />

          <div class="bill-section">
            <div class="bill-title">Bill To</div>
            <div class="bill-name">${invoice.clientName}</div>
            ${panNumber ? `<div class="bill-detail"><strong>PAN:</strong> ${panNumber}</div>` : ''}
            ${gstNumber ? `<div class="bill-detail"><strong>GST:</strong> ${gstNumber}</div>` : ''}
          </div>

          <div class="table-wrapper">
            <table class="items-table">
              <thead>
                <tr>
                  <th>Commodity</th>
                  <th>From Date</th>
                  <th>To Date</th>
                  <th class="qty">Qty (MT)</th>
                  <th class="days">Days</th>
                  <th class="amount">Rent (₹)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${periodsList}
              </tbody>
            </table>
          </div>

          <div class="summary-row">
            <div class="bank-details">
              <strong>Bank Details</strong>
              <p>Bank Name : ICICI BANK GONDAL</p>
              <p>A/c. No. : 048605008597</p>
              <p>IFSC Code : ICIC0000486</p>
              <p>PAN No. : BGNPR6060H</p>
            </div>
            <div class="summary-box">
              <div class="summary-item">
                <span>Monthly Rent</span>
                <span>₹${formatAmount(invoice.totalRent)}</span>
              </div>
              <div class="summary-item total">
                <span>Total Due</span>
                <span>₹${formatAmount(totalDue)}</span>
              </div>
            </div>
          </div>
          <div class="note">This is system generated invoice</div>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generate invoice PDF using server-side rendering
 * Returns buffer that can be sent to client for download
 */
export async function generateMonthlyInvoicePDF(invoice: MonthlyInvoiceData): Promise<Buffer> {
  try {
    // Dynamic import for puppeteer to avoid bundling issues
    const puppeteer = await import('puppeteer');

    const html = await generateMonthlyInvoiceHTML(invoice);

    // Launch browser
    const browser = await puppeteer.default.launch({
      headless: true,
    });

    const page = await browser.newPage();

    // Set content and generate PDF
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfData = await page.pdf({
      format: 'A4',
      margin: {
        top: '10mm',
        right: '10mm',
        bottom: '10mm',
        left: '10mm',
      },
      preferCSSPageSize: true,
    });

    await browser.close();

    return Buffer.from(pdfData);
  } catch (error) {
    console.error('PDF generation error:', error);
    // If puppeteer fails, return HTML as fallback
    throw new Error(
      'PDF generation not available. Please check server configuration.'
    );
  }
}

/**
 * Generate PDF and return download URL
 */
export async function generateInvoicePDFAndSave(
  invoice: MonthlyInvoiceData
): Promise<{
  success: boolean;
  url?: string;
  filename?: string;
  message: string;
}> {
  try {
    const pdfBuffer = await generateMonthlyInvoicePDF(invoice);

    // Create filename
    const filename = `Invoice_${invoice.clientName.replace(/\s+/g, '_')}_${invoice.month}_${invoice.year}_${Date.now()}.pdf`;

    return {
      success: true,
      url: `/api/invoices/download?filename=${encodeURIComponent(filename)}`,
      filename,
      message: 'Invoice PDF generated successfully',
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate invoice PDF';
    return {
      success: false,
      message: errorMessage,
    };
  }
}
