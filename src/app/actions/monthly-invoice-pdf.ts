'use server';

import puppeteer, { Browser } from 'puppeteer';

interface MonthlyInvoice {
  bookingId: string;
  clientName: string;
  invoiceNumber?: string;
  panNumber?: string;
  gstNumber?: string;
  month: string;
  year: number;
  periods: Array<{
    startDate: string;
    endDate: string;
    quantityMT: number;
    daysTotal: number;
    rentTotal: number;
    status: string;
    commodityName: string;
  }>;
  warehouseId?: string;
  warehouseName?: string;
  totalRent: number;
  previousBalance?: number;
}

let browserInstance: Browser | null = null;

/**
 * Get or create a singleton browser instance for performance
 */
async function getBrowser(): Promise<Browser> {
  if (!browserInstance) {
    browserInstance = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
  return browserInstance;
}

/**
 * Closes the browser instance when done
 */
export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

/**
 * Generate PDF from monthly invoice HTML
 */
export async function generateMonthlyInvoicePDF(invoice: MonthlyInvoice): Promise<Buffer> {
  try {
    const html = await generateMonthlyInvoiceHTML(invoice);

    // Launch browser and generate PDF
    const browser = await getBrowser();
    const page = await browser.newPage();

    // Set content and wait for rendering
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // Generate PDF with precise formatting
    const rawPdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
      width: '210mm',
      height: '297mm',
      preferCSSPageSize: true,
    });

    await page.close();

    return Buffer.from(rawPdf);
  } catch (error) {
    console.error('Failed to generate monthly invoice PDF:', error);
    throw error;
  }
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

function getInvoiceNumber(invoice: MonthlyInvoice): string {
  if (invoice.invoiceNumber) {
    return invoice.invoiceNumber;
  }

  const initials = invoice.clientName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((word) => word[0].toUpperCase())
    .join('');
  const monthPart = formatBillingMonth(invoice.month);
  const yearPart = invoice.year ? String(invoice.year).trim() : 'UNKNOWN';
  return `INV-${initials}-${monthPart}-${yearPart}`;
}

export async function generateMonthlyInvoiceHTML(invoice: MonthlyInvoice): Promise<string> {
  const totalAmount = invoice.totalRent || 0;
  const previousBalance = invoice.previousBalance || 0;
  const grandTotal = totalAmount + previousBalance;

  const periods = invoice.periods || [];

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Monthly Invoice - ${invoice.clientName}</title>
    <style>
        @page {
            size: A4;
            margin: 10mm;
        }
        html, body {
            width: 210mm;
            min-height: 297mm;
            margin: 0;
            padding: 0;
            background-color: white;
            color: #333;
        }
        body {
            font-family: 'Arial', sans-serif;
        }
        .invoice-container {
            width: 100%;
            min-height: 100%;
            margin: 0;
            background: white;
            border-radius: 0;
            box-shadow: none;
            overflow: visible;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
            position: relative;
        }
        .logo {
            position: absolute;
            top: 20px;
            left: 30px;
            font-size: 2em;
            font-weight: bold;
            color: white;
        }
        .header h1 {
            margin: 0;
            font-size: 2.5em;
            font-weight: 300;
        }
        .header p {
            margin: 10px 0 0 0;
            opacity: 0.9;
            font-size: 1.1em;
        }
        .invoice-details {
            padding: 30px;
            border-bottom: 1px solid #eee;
        }
        .detail-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 15px;
        }
        .detail-label {
            font-weight: bold;
            color: #666;
        }
        .detail-value {
            color: #333;
        }
        .periods-section {
            padding: 30px;
        }
        .section-title {
            font-size: 1.5em;
            color: #333;
            margin-bottom: 20px;
            border-bottom: 2px solid #667eea;
            padding-bottom: 10px;
        }
        .periods-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }
        .periods-table th,
        .periods-table td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #ddd;
        }
        .periods-table th {
            background-color: #f8f9fa;
            font-weight: 600;
            color: #333;
        }
        .periods-table tr:hover {
            background-color: #f8f9fa;
        }
        .total-section {
            background: #f8f9fa;
            padding: 30px;
            border-top: 2px solid #667eea;
            display: flex;
            gap: 30px;
            flex-wrap: wrap;
            align-items: flex-start;
            overflow: hidden;
        }
        .amount-block {
            flex: 1 1 360px;
            min-width: 280px;
        }
        .total-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 1.2em;
            margin-bottom: 10px;
        }
        .grand-total {
            font-size: 1.8em;
            font-weight: bold;
            color: #667eea;
            border-top: 2px solid #ddd;
            padding-top: 15px;
            margin-top: 15px;
        }
        .footer {
            background: #333;
            color: white;
            padding: 20px;
            text-align: center;
            font-size: 0.9em;
        }
        .footer p {
            margin: 5px 0;
        }
        .note {
            display: block;
            width: 100%;
            padding: 10px 0 0 0;
            font-size: 10px;
            color: #000000;
            text-align: center;
            margin-top: 14px;
            font-weight: 400;
        }
        .amount {
            font-weight: bold;
            color: #28a745;
        }
        .currency {
            font-size: 0.9em;
        }
        @media print {
                background: white;
            }
            .invoice-container {
                box-shadow: none;
            }
        }
    </style>
</head>
<body>
    <div class="invoice-container">
        <!-- Header -->
        <div class="header">
            <div class="logo">POSSIBLE WAREHOUSING LLP</div>
            <h1>WAREHOUSE STORAGE INVOICE</h1>
            <p>Monthly Billing Statement</p>
        </div>

        <!-- Invoice Details -->
        <div class="invoice-details">
            <div class="detail-row">
                <span class="detail-label">Bill To:</span>
                <span class="detail-value">${invoice.clientName}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">PAN:</span>
                <span class="detail-value">${invoice.panNumber || '---'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">GSTIN:</span>
                <span class="detail-value">${invoice.gstNumber || '---'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Invoice Period:</span>
                <span class="detail-value">${invoice.month} ${invoice.year}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Warehouse:</span>
                <span class="detail-value">${invoice.warehouseName || 'General'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Invoice Number:</span>
                <span class="detail-value">${getInvoiceNumber(invoice)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Generated Date:</span>
                <span class="detail-value">${new Date().toLocaleDateString()}</span>
            </div>
        </div>

        <!-- Storage Period Details -->
        <div class="periods-section">
            <h2 class="section-title">Storage Period Details</h2>
            <table class="periods-table">
                <thead>
                    <tr>
                        <th>Commodity</th>
                        <th>From Date</th>
                        <th>To Date</th>
                        <th>Qty (MT)</th>
                        <th>Days</th>
                        <th>Rent (₹)</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${periods.map((period) => `
                        <tr>
                            <td>${period.commodityName || 'Unknown'}</td>
                            <td>${period.startDate || '---'}</td>
                            <td>${period.endDate || '---'}</td>
                            <td>${Number(period.quantityMT || 0).toFixed(2)}</td>
                            <td>${Number(period.daysTotal || 0)}</td>
                            <td class="amount">₹${Number(period.rentTotal || 0).toLocaleString('en-IN')}</td>
                            <td>${period.status || 'UNKNOWN'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <!-- Total Section -->
        <div class="total-section">
            <div class="amount-block">
                <div class="total-row">
                    <span>Total Monthly Rent (All Commodities):</span>
                    <span class="amount">₹${totalAmount.toLocaleString('en-IN')}</span>
                </div>
                ${previousBalance > 0 ? `
                <div class="total-row">
                    <span>Previous Balance:</span>
                    <span class="amount">₹${previousBalance.toLocaleString('en-IN')}</span>
                </div>
                ` : ''}
                <div class="total-row grand-total">
                    <span>Total Amount Due:</span>
                    <span class="amount">₹${grandTotal.toLocaleString('en-IN')}</span>
                </div>
            </div>
        </div>
        <div class="note">This is system generated invoice</div>

        <!-- Footer -->
        <div class="footer">
            <p><strong>POSSIBLE WAREHOUSING LLP</strong></p>
            <p>123 Warehouse Complex, Industrial Area, Mumbai - 400088</p>
            <p>Email: info@possiblewarehousing.com | Phone: +91-22-XXXX-XXXX</p>
            <p>GSTIN: 24AAWFP7490F1ZN</p>
            <p>Generated on ${new Date().toLocaleString()}</p>
            <p>Thank you for your business!</p>
        </div>
    </div>
</body>
</html>`;

  return html;
}