'use server';

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
  transactions?: Array<{
    direction?: string;
    date?: string;
    commodityName?: string;
    startDate?: string;
    endDate?: string;
    quantityMT?: number;
    bags?: number | string;
    gatePass?: string;
    status?: string;
    daysTotal?: number;
    rentTotal?: number;
  }>;
  warehouseId?: string;
  warehouseName?: string;
  companyLogo?: string;
  companyName?: string;
  companyAddress?: string;
  companyEmail?: string;
  companyPhone?: string;
  invoiceDate?: string;
  clientAddress?: string;
  clientPhone?: string;
  bankName?: string;
  bankAccountNumber?: string;
  ifscCode?: string;
  bankBranch?: string;
  totalRent: number;
  previousBalance?: number;
  additionalCharges?: number;
  currentPayments?: number;
  newBalance?: number;
}

/**
 * Closes the browser instance when done
 */
export async function closeBrowser(): Promise<void> {
  return;
}

/**
 * Generate PDF from monthly invoice HTML
 */
export async function generateMonthlyInvoicePDF(invoice: MonthlyInvoice): Promise<Buffer> {
  throw new Error('PDF generation is disabled for this deployment. Use HTML preview instead.');
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
function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
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
  const additionalCharges = invoice.additionalCharges || 0;
  const currentPayments = invoice.currentPayments || 0;
  const newBalance = invoice.newBalance !== undefined ? invoice.newBalance : roundCurrency(totalAmount + previousBalance + additionalCharges - currentPayments);
  const grandTotal = roundCurrency(totalAmount + previousBalance + additionalCharges);

  const rows = (Array.isArray(invoice.transactions) && invoice.transactions.length
    ? invoice.transactions
    : Array.isArray(invoice.periods)
      ? invoice.periods
      : []) as any[];

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
            color: #1f2937;
        }
        body {
            font-family: 'Arial', sans-serif;
            line-height: 1.45;
        }
        .invoice-container {
            width: 100%;
            min-height: 100%;
            margin: 0 auto;
            background: white;
            overflow: visible;
        }
        .top-section {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 24px;
            padding: 24px 30px 16px;
        }
        .company-block {
            max-width: 52%;
        }
        .company-logo {
            max-width: 120px;
            margin-bottom: 16px;
        }
        .company-name {
            color: #0d6f2a;
            font-size: 1.9em;
            font-weight: 700;
            margin: 0;
        }
        .company-meta {
            font-size: 0.95em;
            color: #4b5563;
            margin-top: 8px;
        }
        .invoice-meta {
            text-align: right;
            min-width: 220px;
        }
        .invoice-title {
            color: #0d6f2a;
            font-size: 1.9em;
            font-weight: 700;
            margin: 0 0 6px;
        }
        .invoice-meta p {
            margin: 6px 0;
            font-size: 0.95em;
            color: #1f2937;
        }
        .invoice-meta span {
            display: block;
            font-weight: 600;
        }
        .bill-to {
            padding: 22px 30px;
            border-top: 2px solid #e5e7eb;
            border-bottom: 2px solid #e5e7eb;
            margin: 0 30px 24px;
        }
        .bill-to h2 {
            margin: 0 0 10px;
            font-size: 1.2em;
            color: #111827;
        }
        .bill-to p {
            margin: 3px 0;
            font-size: 0.95em;
            color: #4b5563;
        }
        .invoice-table-container {
            padding: 0 30px 24px;
        }
        .invoice-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 12px;
        }
        .invoice-table th,
        .invoice-table td {
            padding: 12px 14px;
            border: 1px solid #d1d5db;
            text-align: left;
            font-size: 0.95em;
        }
        .invoice-table th {
            background: #f3f8f2;
            color: #0d6f2a;
            font-weight: 700;
        }
        .invoice-table tbody tr:nth-child(even) {
            background: #f9fafb;
        }
        .invoice-table tbody tr:hover {
            background: #eef5ea;
        }
        .text-right {
            text-align: right;
        }
        .totals-section {
            display: flex;
            justify-content: space-between;
            gap: 24px;
            align-items: flex-end;
            padding: 0 30px 32px;
            flex-wrap: wrap;
        }
        .bank-details {
            flex: 1 1 320px;
            background: #f8fafc;
            border: 1px solid #e5e7eb;
            border-radius: 10px;
            padding: 18px 20px;
            font-size: 0.95em;
            color: #374151;
        }
        .bank-details h3 {
            margin: 0 0 10px;
            font-size: 1em;
            letter-spacing: 0.01em;
            color: #0d6f2a;
        }
        .bank-details p {
            margin: 6px 0;
        }
        .summary-box {
            min-width: 280px;
            max-width: 360px;
        }
        .summary-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
            font-size: 0.95em;
            color: #111827;
        }
        .summary-row strong {
            color: #0d6f2a;
        }
        .summary-total {
            margin-top: 12px;
            display: flex;
            justify-content: space-between;
            font-size: 1.2em;
            font-weight: 700;
            color: #0d6f2a;
        }
        .footer {
            padding: 20px 30px 28px;
            font-size: 0.85em;
            color: #6b7280;
        }
        .footer p {
            margin: 6px 0;
        }
        .note {
            padding: 0 30px 10px;
            font-size: 0.82em;
            color: #4b5563;
        }
        @media print {
            body {
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
        <div class="top-section">
            <div class="company-block">
                ${invoice.companyLogo ? `<img src="${invoice.companyLogo}" alt="Logo" class="company-logo" />` : ''}
                <h1 class="company-name">${invoice.companyName || 'Company Name'}</h1>
                <div class="company-meta">
                    ${invoice.companyAddress ? `<p>${invoice.companyAddress}</p>` : ''}
                    ${invoice.companyEmail ? `<p>Email: ${invoice.companyEmail}</p>` : ''}
                    ${invoice.companyPhone ? `<p>Phone: ${invoice.companyPhone}</p>` : ''}
                </div>
            </div>
            <div class="invoice-meta">
                <p class="invoice-title">MONTHLY INVOICE</p>
                <p><strong>Invoice Number:</strong> ${getInvoiceNumber(invoice)}</p>
                <p><strong>Month:</strong> ${invoice.month} ${invoice.year}</p>
                <p><strong>Date:</strong> ${invoice.invoiceDate || new Date().toISOString().split('T')[0]}</p>
            </div>
        </div>

        <div class="bill-to">
            <h2>Bill To</h2>
            <p><strong>${invoice.clientName}</strong></p>
            ${invoice.clientAddress ? `<p>${invoice.clientAddress}</p>` : ''}
            ${invoice.clientPhone ? `<p>Phone: ${invoice.clientPhone}</p>` : ''}
            <p><strong>PAN:</strong> ${invoice.panNumber || 'NA'}</p>
            <p><strong>GST:</strong> ${invoice.gstNumber || 'NA'}</p>
        </div>

        <div class="invoice-table-container">
            <table class="invoice-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Direction</th>
                        <th>Commodity</th>
                        <th>No. of Bags</th>
                        <th>Qty (MT)</th>
                        <th class="text-right">Rent (₹)</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.map((row) => {
                      const dateRange = row.startDate
                        ? `${row.startDate} to ${row.endDate || row.startDate}`
                        : row.date || '---';
                      const bagsValue = row.bags !== undefined && row.bags !== ''
                        ? typeof row.bags === 'number' ? row.bags.toLocaleString('en-IN') : row.bags
                        : '---';
                      const qtyValue = Number(row.quantityMT || 0).toFixed(3);
                      const rentValue = Number(row.rentTotal || 0);
                      return `
                        <tr>
                            <td>${dateRange}</td>
                            <td>${row.direction || 'INWARD'}</td>
                            <td>${row.commodityName || 'Unknown'}</td>
                            <td>${bagsValue}</td>
                            <td>${qtyValue}</td>
                            <td class="text-right">₹${rentValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>
                    `}).join('')}
                </tbody>
            </table>
        </div>

        <div class="totals-section">
            <div class="bank-details">
                <h3>BANK DETAILS</h3>
                ${invoice.bankName ? `<p><strong>Bank Name :</strong> ${invoice.bankName}</p>` : ''}
                ${invoice.bankAccountNumber ? `<p><strong>A/c. No. :</strong> ${invoice.bankAccountNumber}</p>` : ''}
                ${invoice.ifscCode ? `<p><strong>IFSC Code :</strong> ${invoice.ifscCode}</p>` : ''}
                ${invoice.bankBranch ? `<p><strong>Branch :</strong> ${invoice.bankBranch}</p>` : ''}
            </div>
            <div class="summary-box">
                <div class="summary-row">
                    <span>Monthly Rent</span>
                    <strong>₹${totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                </div>
                <div class="summary-total">
                    <span>Total Monthly Charges</span>
                    <span>₹${newBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
            </div>
        </div>

        <div class="note">This invoice is generated automatically from monthly storage transactions and reflects the billing month of ${invoice.month} ${invoice.year}.</div>
        <div class="footer">
            <p>${invoice.companyName || 'Company Name'}</p>
            ${invoice.companyAddress ? `<p>${invoice.companyAddress}</p>` : ''}
            ${invoice.companyEmail || invoice.companyPhone ? `<p>${invoice.companyEmail ? `Email: ${invoice.companyEmail}` : ''}${invoice.companyEmail && invoice.companyPhone ? ' | ' : ''}${invoice.companyPhone ? `Phone: ${invoice.companyPhone}` : ''}</p>` : ''}
        </div>
    </div>
</body>
</html>`;

  return html;
}