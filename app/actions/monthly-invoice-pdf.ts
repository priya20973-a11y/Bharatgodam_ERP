'use server';

import { MonthlyInvoiceData } from './monthly-invoices';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

function numberToWords(num: number): string {
  if (num === 0) return 'Zero';
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const formatNumber = (n: number): string => {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : '');
    if (n < 1000) return a[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' ' + formatNumber(n % 100) : '');
    return '';
  };
  let words = '';
  const crores = Math.floor(num / 10000000);
  num %= 10000000;
  const lakhs = Math.floor(num / 100000);
  num %= 100000;
  const thousands = Math.floor(num / 1000);
  num %= 1000;
  const hundreds = Math.floor(num);
  if (crores > 0) words += formatNumber(crores) + ' Crore ';
  if (lakhs > 0) words += formatNumber(lakhs) + ' Lakh ';
  if (thousands > 0) words += formatNumber(thousands) + ' Thousand ';
  if (hundreds > 0) words += formatNumber(hundreds);
  return words.trim();
}

let cachedLogoDataUri: string | null = null;

async function getLogoDataUri(logoUrl?: string): Promise<string> {
  if (logoUrl && logoUrl.startsWith('data:')) {
    return logoUrl;
  }

  if (!logoUrl && cachedLogoDataUri) return cachedLogoDataUri;

  const defaultLogoUrl = 'https://drive.google.com/uc?export=download&id=1wto5h8b-d-Cp6qJVnbaJWcCg_VBtWZrj';
  const fetchUrl = logoUrl || defaultLogoUrl;

  try {
    const response = await fetch(fetchUrl);
    if (!response.ok) {
      throw new Error(`Failed to download logo: ${response.status}`);
    }
    const contentType = response.headers.get('content-type') || 'image/png';
    const buffer = Buffer.from(await response.arrayBuffer());
    const dataUri = `data:${contentType};base64,${buffer.toString('base64')}`;

    if (!logoUrl) {
      cachedLogoDataUri = dataUri;
    }

    return dataUri;
  } catch (error) {
    console.error('Logo fetch failed:', error);
    if (!logoUrl && cachedLogoDataUri) {
      return cachedLogoDataUri;
    }
    return '';
  }
}

function formatAmount(value: number): string {
  return value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatQty(value: number): string {
  return value.toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function formatInvoiceDate(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return dateString;
  }
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatInvoiceRowDate(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return dateString;
  }
  return date.toLocaleDateString('en-IN');
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
  const previous = invoice.previousBalance || 0;
  const payments = invoice.currentPayments || 0;
  const adjustment = invoice.additionalCharges || 0;
  if (invoice.newBalance !== undefined && invoice.newBalance !== null) {
    return invoice.newBalance + adjustment;
  }
  return Math.max(0, invoice.totalRent + adjustment + previous - payments);
}

function getTotalMonthlyCharges(invoice: MonthlyInvoiceData): number {
  return Number(invoice.totalRent || 0) + Number(invoice.additionalCharges || 0);
}

export async function generateMonthlyInvoiceHTML(invoice: MonthlyInvoiceData): Promise<string> {
  const companyName = invoice.companyName || 'AGRI CROP CARE';
  const companyAddress =
    invoice.companyAddress ||
    'Agri crop care Warehouse, Vraj 3, Patidad road, Gundala, Gondal';
  const contactEmail = invoice.invoiceEmail || invoice.companyEmail || 'agricropwl@outlook.com';
  const contactPhone = invoice.companyPhone || '+91 9913305200';
  const logoSrc = await getLogoDataUri(invoice.companyLogo || undefined);
  const logoAlt = `${companyName} Logo`;
  const companyGst = invoice.companyGst || '';
  const companyPan = invoice.companyPan || '';
  const iecCode = invoice.iecCode || '';
  const invoiceDate = formatInvoiceDate(invoice.invoiceDate);
  const TAX_RATES: Record<string, number> = {
    'Non-GST Supply': 0,
    'GST 5%': 0.05,
    'GST 12%': 0.12,
    'GST 18%': 0.18,
    'GST 28%': 0.28,
  };

  const adjustmentTotal = invoice.additionalCharges !== undefined
    ? Number(invoice.additionalCharges)
    : (invoice.additionalChargeItems || []).reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0
    );

  const invoiceRowSource = ((invoice.transactions?.length
    ? invoice.transactions
    : invoice.periods || []) as any[]);

  const billingTotal = invoiceRowSource.reduce(
    (sum, row) => sum + Number(row.rentTotal || 0),
    0
  );

  const taxableAmount = billingTotal + adjustmentTotal;
  let totalTaxAmount = Number(invoice.totalTaxAmount || 0);
  const taxAdjustment = Number(invoice.adjustment || invoice.adjustmentAmount || 0);
  if (companyGst.trim().toUpperCase() === 'NA') {
    totalTaxAmount = 0;
  }

  const finalTotal = taxableAmount + totalTaxAmount + taxAdjustment;

  const taxGroup = invoice.taxGroup || 'No Tax';
  const taxType = invoice.taxType || 'IGST';
  let cgstAmount = Number(invoice.cgstAmount || 0);
  let sgstAmount = Number(invoice.sgstAmount || 0);
  let igstAmount = Number(invoice.igstAmount || 0);

  if (companyGst.trim().toUpperCase() === 'NA') {
    cgstAmount = 0;
    sgstAmount = 0;
    igstAmount = 0;
  }

  let gstRate = 0;
  const taxGroupMatch = taxGroup.match(/\d+(\.\d+)?/);
  if (taxGroupMatch) {
    gstRate = Number(taxGroupMatch[0]);
  }
  const halfRate = gstRate / 2;

  const cgstLabel = gstRate > 0 ? `CGST${halfRate} (${halfRate}%)` : 'CGST';
  const sgstLabel = gstRate > 0 ? `SGST${halfRate} (${halfRate}%)` : 'SGST';
  const igstLabel = gstRate > 0 ? `IGST${gstRate} (${gstRate}%)` : 'IGST';

  const previousBalance = Number(invoice.previousBalance || 0);
  const paymentsReceived = Number(invoice.currentPayments || 0);
  const outstandingBalance = invoice.newBalance !== undefined && invoice.newBalance !== null
    ? Number(invoice.newBalance || 0)
    : Math.max(0, billingTotal + adjustmentTotal + previousBalance - paymentsReceived);

  const panNumber = invoice.panNumber ? invoice.panNumber : '';
  const gstNumber = invoice.gstNumber ? invoice.gstNumber : '';

  const db = await getDb();
  let clientAddress = '';
  let clientMobile = '';
  const clientState = invoice.billingState || '';

  let clientUserId: ObjectId | string | null = null;
  if (invoice.bookingId) {
    try {
      const client = await db.collection('clients').findOne({
        _id: (ObjectId.isValid(invoice.bookingId) ? new ObjectId(invoice.bookingId) : invoice.bookingId) as any
      });
      if (client) {
        clientAddress = client.address || '';
        clientMobile = client.mobile || '';
        clientUserId = client.userId || null;
      }
    } catch (err) {
      console.error('Error fetching client details in HTML generator:', err);
    }
  }

  // Fetch commodities to map HSN codes
  const hsnMap: Record<string, string> = {};
  try {
    const query: any = {};
    if (clientUserId) {
      query.userId = clientUserId;
    } else if (invoice.companyEmail) {
      query.userEmail = invoice.companyEmail;
    }
    const commodities = await db.collection('commodities').find(query).toArray();
    for (const c of commodities) {
      if (c.name) {
        hsnMap[c.name.toUpperCase()] = c.hsnCode || '-';
      }
    }
  } catch (err) {
    console.error('Error fetching commodities in HTML generator:', err);
  }

  const adjustmentRows = (invoice.additionalChargeItems || [])
    .map(
      (item) => `
        <tr>
          <td>${item.name || 'Additional Charge'}</td>
          <td class="text-right">₹${formatAmount(Number(item.amount || 0))}</td>
        </tr>
      `
    )
    .join('');

  const hasAdditionalCharges =
    (invoice.additionalChargeItems && invoice.additionalChargeItems.length > 0) ||
    adjustmentTotal > 0;

  const adjustmentBody = adjustmentRows || `
        <tr>
          <td>Additional Charges</td>
          <td class="text-right">₹${formatAmount(adjustmentTotal)}</td>
        </tr>
      `;

  const invoiceRows = ((invoice.transactions?.length
    ? invoice.transactions
    : invoice.periods || []) as any[]).map((p) => ({
      date: p.date || p.startDate || '',
      direction: p.direction || 'INWARD',
      commodityName: p.commodityName || 'Unknown',
      warehouseName: p.warehouseName || 'Unknown',
      startDate: p.startDate || '',
      endDate: p.endDate || '',
      quantityMT: Number(p.quantityMT ?? p.quantity ?? 0),
      bags: p.bags !== undefined
        ? p.bags
        : p.bagCount ?? p.bagsCount ?? '',
      rentTotal: Number(p.rentTotal || 0),
      daysTotal: Number(p.daysTotal ?? p.daysOccupied ?? 0),
      ratePerMTPerDay: Number(p.rate || p.ratePerMTPerDay || 0),
      gatePass: p.gatePass || p.gatepass || '-',
      status: p.status || '',
    }));

  let showWarehouseColumn = false;
  
  const invoiceRowsWithId = invoiceRows.map((row) => {
    let customWarehouseId = '';
    const name = row.warehouseName || '';
    if (name.includes(' - ')) {
      customWarehouseId = name.split(' - ')[0].trim();
    }
    
    if (customWarehouseId) {
      showWarehouseColumn = true;
    }
    
    return {
      ...row,
      customWarehouseId
    };
  });

  const invoiceRowsList = invoiceRowsWithId
    .map((row) => {
      const dateRange = row.startDate && row.endDate
        ? `${row.startDate} to ${row.endDate}`
        : row.date || `${row.startDate || ''}`;
      const bagsValue = row.bags !== undefined && row.bags !== ''
        ? (typeof row.bags === 'number' ? row.bags.toLocaleString('en-IN') : row.bags)
        : '-';
      const daysValue = row.daysTotal !== undefined && row.daysTotal !== null
        ? row.daysTotal
        : '-';
      const rateValue = row.ratePerMTPerDay
        ? `₹${formatAmount(row.ratePerMTPerDay)}`
        : '-';
      const commodityLabel = row.commodityName || 'Unknown';
      const hsnValue = hsnMap[commodityLabel.toUpperCase()] || '-';
      const warehouseCell = showWarehouseColumn 
        ? `<td>${row.customWarehouseId || ''}</td>` 
        : '';
        
      return `
        <tr>
          <td>${dateRange}</td>
          <td>${row.direction}</td>
          <td>${commodityLabel}</td>
          <td>${hsnValue}</td>
          ${warehouseCell}
          <td class="text-right">${bagsValue}</td>
          <td class="text-right">${formatQty(row.quantityMT)}</td>
          <td class="text-right">${daysValue}</td>
          <td class="text-right">${rateValue}</td>
          <td class="text-right font-medium text-dark">₹${formatAmount(row.rentTotal)}</td>
        </tr>
      `;
    })
    .join('');

  const formattedInvoiceNumber = await getInvoiceNumber(invoice);
  const formattedInvoiceMonth = `${invoice.month} ${invoice.year}`;

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${totalTaxAmount > 0 ? 'Tax Invoice' : 'Bill of Supply'} - ${invoice.clientName}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            padding: 0;
            background-color: #fff;
            font-family: 'Inter', sans-serif;
            color: #1F2937;
            line-height: 1.4;
            -webkit-font-smoothing: antialiased;
            font-size: 8px;
          }

          @page {
            size: A4;
            margin: 0;
          }

          @media print {
            .print-banner, .hide-on-print {
              display: none !important;
            }
            body {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
              margin: 10mm 15mm !important;
            }
            .invoice-container {
              box-shadow: none !important;
              margin: 0 !important;
            }
          }

          .print-banner {
            padding: 8px;
            background: #0F2D52;
            color: white;
            font-size: 10px;
            font-weight: 500;
            text-align: center;
            margin-bottom: 20px;
          }

          .invoice-container {
            width: 100%;
            max-width: 900px;
            margin: 0 auto;
            background: white;
          }

          .invoice-body {
            padding: 30px;
          }

          /* Header Section */
          .header-container {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 20px;
            margin-bottom: 20px;
            padding-bottom: 20px;
            border-bottom: 1px solid #D9DDE3;
          }

          .header-left {
            display: flex;
            align-items: center;
            gap: 15px;
            flex: 1;
          }

          .logo-image {
            width: 80px;
            height: 80px;
            object-fit: contain;
          }

          .company-info {
            flex: 1;
          }

          .company-name {
            font-size: 16px;
            font-weight: 700;
            color: #0F2D52;
            margin-bottom: 4px;
            text-transform: uppercase;
          }

          .company-details {
            font-size: 8px;
            color: #1F2937;
          }

          .company-details p {
            margin: 2px 0;
          }
          
          .gstin-badge {
            display: inline-block;
            font-weight: 600;
            margin-top: 4px;
          }

          .header-right {
            text-align: right;
            min-width: 200px;
          }

          .invoice-title {
            font-size: 26px;
            font-weight: 700;
            color: #0F2D52;
            margin-bottom: 10px;
            text-transform: uppercase;
          }

          .invoice-details-grid {
            display: grid;
            grid-template-columns: auto 1fr;
            gap: 4px 10px;
            font-size: 9px;
            text-align: right;
          }

          .detail-label {
            color: #1F2937;
            font-weight: 600;
          }

          .detail-value {
            color: #1F2937;
          }

          .highlight-text {
            font-weight: 700;
          }

          /* Sections General */
          .addresses-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 20px;
          }

          .bill-to-card, .table-card, .bank-details-card {
            border: 1px solid #D9DDE3;
            margin-bottom: 20px;
            background: transparent;
          }

          .addresses-grid .bill-to-card {
            margin-bottom: 0;
          }

          .card-header, .table-header-bar, .card-header-sub {
            background: rgba(245, 247, 250, 0.8);
            color: #0F2D52;
            font-size: 10px;
            font-weight: 700;
            padding: 6px 10px;
            border-bottom: 1px solid #D9DDE3;
            text-transform: uppercase;
          }

          .bill-to-card .card-body, .bank-details-card .card-body {
            padding: 8px 10px;
          }

          .client-name {
            font-size: 10px;
            font-weight: 700;
            color: #0F2D52;
            margin-bottom: 4px;
          }

          .client-stacked-address {
            font-size: 8px;
            color: #1F2937;
            line-height: 1.4;
          }

          .font-mono {
            font-family: inherit;
          }

          /* Table */
          .items-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 8px;
            color: #1F2937;
          }

          .items-table th,
          .items-table td {
            padding: 6px 8px;
            border-bottom: 1px solid #D9DDE3;
            border-right: 1px solid #D9DDE3;
          }

          .items-table th:last-child,
          .items-table td:last-child {
            border-right: none;
          }

          .items-table th {
            text-align: left;
            font-weight: 700;
            color: #0F2D52;
            background: rgba(245, 247, 250, 0.8);
            font-size: 9px;
            text-transform: uppercase;
          }

          .items-table th.text-right,
          .items-table td.text-right {
            text-align: right;
          }

          .items-table tbody tr:last-child td {
            border-bottom: none;
          }

          .items-table tbody tr:nth-child(even) {
            background: rgba(250, 250, 250, 0.6);
          }

          /* Bottom Grid Layout */
          .bottom-grid {
            display: flex;
            gap: 40px;
            margin-bottom: 20px;
          }

          .bottom-left-panel, .bottom-right-panel {
            flex: 1;
            display: flex;
            flex-direction: column;
          }

          .horizontal-divider {
            border-top: 1px solid #D9DDE3;
            margin: 12px 0;
            width: 100%;
          }

          .info-block {
            margin-bottom: 12px;
          }

          .info-block .info-label {
            font-size: 9px;
            font-weight: 700;
            color: #0F2D52;
            margin-bottom: 4px;
          }

          .info-block .info-value {
            font-size: 8px;
            color: #1F2937;
          }

          .info-block .italic {
            font-style: italic;
          }

          /* Bank Details */
          .bank-info-grid {
            display: grid;
            grid-template-columns: auto 1fr;
            gap: 6px 10px;
            font-size: 8px;
          }

          .bank-label {
            color: #1F2937;
            font-weight: 600;
          }

          .bank-value {
            color: #1F2937;
          }

          /* Invoice Summary */
          .invoice-summary-card {
            display: flex;
            flex-direction: column;
            gap: 6px;
          }

          .summary-row-item {
            display: flex;
            justify-content: space-between;
            font-size: 9px;
            color: #1F2937;
            font-weight: 500;
          }

          .summary-row-item.separator-top {
            border-top: 1px solid #D9DDE3;
            padding-top: 6px;
          }

          .summary-row-item.outstanding-row {
            border-top: 1px solid #D9DDE3;
            padding-top: 6px;
            font-weight: 700;
            color: #1F2937;
            font-size: 10px;
          }

          .summary-row-item.grand-total-row {
            border-top: 2px solid #0F2D52;
            background: rgba(245, 247, 250, 0.8);
            padding: 8px 10px;
            margin-top: 6px;
            font-size: 11px;
            font-weight: 700;
            color: #0F2D52;
          }

          /* GST Breakdown Section */
          .gst-breakdown-card {
            border: 1px solid #D9DDE3;
            margin-bottom: 20px;
            background: transparent;
          }

          .gst-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 8px;
            color: #1F2937;
          }

          .gst-table th,
          .gst-table td {
            padding: 6px 8px;
            border-bottom: 1px solid #D9DDE3;
            border-right: 1px solid #D9DDE3;
          }

          .gst-table th:last-child,
          .gst-table td:last-child {
            border-right: none;
          }

          .gst-table th {
            text-align: left;
            font-weight: 700;
            color: #0F2D52;
            background: rgba(245, 247, 250, 0.8);
            font-size: 9px;
            text-transform: uppercase;
          }

          .gst-table th.text-center,
          .gst-table td.text-center {
            text-align: center;
          }

          .gst-table th.text-right,
          .gst-table td.text-right {
            text-align: right;
          }

          .gst-table tbody tr:last-child td {
            border-bottom: none;
          }

          /* Footer Section */
          .footer-section {
            text-align: center;
            margin-top: 20px;
            padding-top: 10px;
            border-top: 1px solid #D9DDE3;
          }

          .signature-note {
            font-size: 8px;
            color: #1F2937;
          }

          /* Print Styles */
          @media print {
            body {
              padding: 0 !important;
              background: white !important;
            }
            .print-banner {
              display: none !important;
            }
            .invoice-container {
              border: none !important;
              box-shadow: none !important;
              max-width: 100% !important;
            }
            .invoice-body {
              padding: 0 !important;
            }
            .bill-to-card, .table-card, .bottom-grid, .bank-details-card, .invoice-summary-card {
              page-break-inside: avoid;
            }
          }
        </style>
      </head>
      <body>
        
        <!-- invoice-html-version: 3 | transactions:${invoice.transactions?.length || 0} | periods:${invoice.periods?.length || 0} | adjustmentTotal: ${formatAmount(adjustmentTotal)} | additionalCharges: ${formatAmount(Number(invoice.additionalCharges || 0))} | additionalChargeItemsCount: ${(invoice.additionalChargeItems || []).length} -->
        <div class="invoice-container" style="position: relative; z-index: 1;">
          ${logoSrc ? `
          <!-- Watermark -->
          <div class="watermark" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; opacity: 0.08; filter: grayscale(100%);">
            <img src="${logoSrc}" style="width: 70%; height: auto; max-height: 70%; object-fit: contain;" alt="Watermark" />
          </div>
          ` : ''}
          <div class="invoice-body" style="position: relative; z-index: 1;">
            
            <!-- Header Section -->
            <div class="header-container">
              <div class="header-left">
                ${logoSrc ? `<img class="logo-image" src="${logoSrc}" alt="${logoAlt}" />` : ''}
                <div class="company-info">
                  <div class="company-name">${companyName}</div>
                    <div class="company-details">
                      <p>📍 ${companyAddress}</p>
                      <p>📞 ${contactPhone} &nbsp;|&nbsp; ✉️ ${contactEmail}</p>
                      ${companyGst ? `<p class="gstin-badge">GSTIN: ${companyGst}</p>` : ''}
                      ${companyPan ? `<p class="pan-badge">PAN: ${companyPan}</p>` : ''}
                      ${iecCode ? `<p class="iec-badge">IEC Code: ${iecCode}</p>` : ''}
                    </div>
                  ${(invoice as any).warehouses && (invoice as any).warehouses.length > 0 ? `
                  <div style="margin-top: 10px; font-size: 10px; font-weight: 600; color: #0F2D52;">
                    Warehouses: 
                    ${(invoice as any).warehouses.map((w: any) => `${w.warehouseId || 'WH'} - ${w.name}`).join(', ')}
                  </div>
                  ` : ''}
                </div>
              </div>
              <div class="header-right">
                <div class="invoice-title">${totalTaxAmount > 0 ? 'Tax Invoice' : 'Bill of Supply'}</div>
                <div class="invoice-details-grid">
                  <div class="detail-label">Invoice Number:</div>
                  <div class="detail-value highlight-text">${formattedInvoiceNumber}</div>
                  
                  <div class="detail-label">Invoice Date:</div>
                  <div class="detail-value">${invoiceDate}</div>
                  
                  <div class="detail-label">Invoice Month:</div>
                  <div class="detail-value">${formattedInvoiceMonth}</div>
                  
                  ${(invoice as any).dueDate ? `
                    <div class="detail-label">Due Date:</div>
                    <div class="detail-value">${formatInvoiceDate((invoice as any).dueDate)}</div>
                  ` : ''}
                </div>
              </div>
            </div>

            <!-- Addresses Section -->
            <div class="addresses-grid">
              <!-- Bill To Section -->
              <div class="bill-to-card">
                <div class="card-header">
                  Bill To
                </div>
                <div class="card-body">
                  <div class="client-name">${invoice.clientName}</div>
                  <div class="client-stacked-address">
                    ${clientAddress ? `<div>${clientAddress.replace(/\n/g, '<br>')}</div>` : ''}
                    ${clientState ? `<div>${clientState}</div>` : ''}
                    <div>India</div>
                    ${gstNumber ? `<div>GSTIN ${gstNumber}</div>` : ''}
                    ${panNumber ? `<div>PAN ${panNumber}</div>` : ''}
                    ${clientMobile ? `<div>Mobile ${clientMobile}</div>` : ''}
                  </div>
                </div>
              </div>

            </div>

            <!-- Storage Transactions Section -->
            <div class="table-card">
              <div class="table-header-bar">
                STORAGE TRANSACTION ENTRIES
              </div>
              <div class="table-wrapper">
                <table class="items-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Direction</th>
                      <th>Commodity</th>
                      <th>HSN Code</th>
                      ${showWarehouseColumn ? '<th>Warehouse</th>' : ''}
                      <th class="text-right">No. of Bags</th>
                      <th class="text-right">Qty (MT)</th>
                      <th class="text-right">Days</th>
                      <th class="text-right">Rate (₹)</th>
                      <th class="text-right">Rent (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${invoiceRowsList}
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Additional Charges Details Section -->
            ${hasAdditionalCharges ? `
              <div class="table-card">
                <div class="table-header-bar">
                  ADDITIONAL CHARGES DETAILS
                </div>
                <div class="table-wrapper">
                  <table class="items-table">
                    <thead>
                      <tr>
                        <th>Description</th>
                        <th class="text-right">Charge Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${adjustmentBody}
                    </tbody>
                  </table>
                </div>
              </div>
            ` : ''}

            <!-- Bottom Section Layout -->
            <div class="bottom-grid">
              
              <!-- Left Panel -->
              <div class="bottom-left-panel" style="border: 1px solid #D9DDE3; display: flex; flex-direction: column;">
                <div style="padding: 12px 16px;">
                  <div class="info-block" style="margin-bottom: 0;">
                    <div class="info-label" style="font-size: 10px;">Total In Words</div>
                    <div class="info-value italic" style="margin-top: 6px; font-size: 11px; font-weight: 500;">Indian Rupee ${numberToWords(Math.floor(finalTotal))} Only</div>
                  </div>
                </div>
                
                <div class="horizontal-divider" style="margin: 0 16px; width: auto;"></div>
                
                <div style="padding: 12px 16px;">
                  <div class="info-block" style="margin-bottom: 0;">
                    <div class="info-label" style="font-size: 10px;">Notes</div>
                    <div class="info-value" style="margin-top: 6px; font-size: 11px; font-weight: 500;">${invoice.notes || 'Thanks for your business.'}</div>
                  </div>
                </div>
                
                <!-- Bottom Split for Bank & Terms -->
                <div style="display: flex; border-top: 1px solid #D9DDE3;">
                  <!-- Bank Details -->
                  <div class="bank-details-card" style="flex: 1; margin-bottom: 0; border: none; border-right: 1px solid #D9DDE3;">
                    <div class="card-header" style="border-bottom: 1px solid #D9DDE3; padding: 8px 16px;">
                      Bank Details
                    </div>
                    <div class="card-body" style="padding: 12px 16px;">
                      <div class="bank-info-grid">
                        <div class="bank-label">Bank Name:</div>
                        <div class="bank-value">${invoice.bankName || 'ICICI BANK GONDAL'}</div>
                        
                        ${invoice.accountName ? `
                        <div class="bank-label">Account Name:</div>
                        <div class="bank-value">${invoice.accountName}</div>
                        ` : ''}
                        
                        <div class="bank-label">Account No:</div>
                        <div class="bank-value font-mono highlight-text">${invoice.bankAccountNumber || '048605008597'}</div>
                        
                        <div class="bank-label">IFSC Code:</div>
                        <div class="bank-value font-mono">${invoice.ifscCode || 'ICIC0000486'}</div>
                        
                        ${invoice.bankBranch ? `
                          <div class="bank-label">Branch Name:</div>
                          <div class="bank-value">${invoice.bankBranch}</div>
                        ` : ''}
                      </div>
                    </div>
                  </div>
                  
                  ${invoice.companyTermsAndConditions && invoice.companyTermsAndConditions.trim() !== '' ? `
                  <!-- Terms & Conditions -->
                  <div style="flex: 1; display: flex; flex-direction: column;">
                    <div class="card-header" style="border-bottom: 1px solid #D9DDE3; padding: 8px 16px;">
                      Terms & Conditions
                    </div>
                    <div class="card-body" style="padding: 12px 16px; font-size: 8.5px; line-height: 1.5; color: #1F2937; white-space: pre-wrap;">${invoice.companyTermsAndConditions}</div>
                  </div>
                  ` : ''}
                </div>
              </div>

              <div class="bottom-right-panel">
                <div style="flex: 1;"></div>
                <div class="horizontal-divider"></div>
                
                <!-- Invoice Summary -->
                <div class="invoice-summary-card">
                  <div class="summary-row-item">
                    <span>Monthly Storage Rent</span>
                    <span>₹${formatAmount(billingTotal)}</span>
                  </div>
                  ${hasAdditionalCharges ? `
                    <div class="summary-row-item">
                      <span>Additional Charges</span>
                      <span>₹${formatAmount(adjustmentTotal)}</span>
                    </div>
                  ` : ''}
                  
                  ${totalTaxAmount > 0 ? `
                  <div class="summary-row-item separator-top">
                    <span>Taxable Amount</span>
                    <span>₹${formatAmount(taxableAmount)}</span>
                  </div>
                  ` : ''}
                  
                  ${cgstAmount > 0 ? `
                    <div class="summary-row-item">
                      <span>${cgstLabel}</span>
                      <span>₹${formatAmount(cgstAmount)}</span>
                    </div>
                  ` : ''}
                  ${sgstAmount > 0 ? `
                    <div class="summary-row-item">
                      <span>${sgstLabel}</span>
                      <span>₹${formatAmount(sgstAmount)}</span>
                    </div>
                  ` : ''}
                  ${igstAmount > 0 ? `
                    <div class="summary-row-item">
                      <span>${igstLabel}</span>
                      <span>₹${formatAmount(igstAmount)}</span>
                    </div>
                  ` : ''}
                  ${taxAdjustment !== 0 ? `
                    <div class="summary-row-item">
                      <span>Adjustment</span>
                      <span>₹${formatAmount(taxAdjustment)}</span>
                    </div>
                  ` : ''}
                  

                  <div class="summary-row-item grand-total-row">
                    <span>Grand Total</span>
                    <span>₹${formatAmount(finalTotal)}</span>
                  </div>
                </div>

                <!-- Signature Box -->
                <div style="margin-top: 12px;">
                  <div style="border: 1px solid #D9DDE3; height: 90px; position: relative; background: #fff;">
                    <div style="position: absolute; bottom: 8px; width: 100%; text-align: center; font-size: 9px; color: #1F2937; font-weight: 500;">
                      Authorized Signature
                    </div>
                  </div>
                </div>
              </div>
            </div>

            

            <!-- Footer Section -->
            <div class="footer-section">
              <div class="signature-note">
                This is a computer-generated invoice.
              </div>
            </div>

          </div>
        </div>
      </body>
    </html>
  `;
}
export async function generateMonthlyInvoicePDF(invoice: MonthlyInvoiceData): Promise<Buffer> {
  throw new Error(
    'PDF generation is disabled for this deployment. Use generateMonthlyInvoiceHTML to render invoice previews instead.'
  );
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
  return {
    success: false,
    message: 'PDF generation is disabled for this deployment. Please use the HTML invoice preview route instead.',
  };
}
