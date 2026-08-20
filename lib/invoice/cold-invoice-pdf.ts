import { format } from 'date-fns';
import { formatCurrency, amountInWords, formatNumber } from './formatters';

/**
 * Generates a professional real-world Indian Cold Storage Commercial Invoice HTML.
 * Supports warehouse logo (if uploaded), complete address, GSTIN, PAN, SAC Code 998612,
 * structured line items, additional charges, financial totals, amount in words, bank details,
 * and print/PDF optimization.
 */
export function generateColdInvoiceHTML(
  invoice: any,
  client: any,
  warehouse: any,
  userDetails?: { companyLogo?: string; phoneNumber?: string; companyName?: string; address?: string; coldLanguage?: string; termsAndConditions?: string },
  lang: string = 'en'
): string {
  const logoUrl = warehouse?.warehouseLogo || warehouse?.logo || userDetails?.companyLogo || '';
  const warehouseName = warehouse?.name || userDetails?.companyName || 'Cold Storage Warehouse';
  const warehouseAddress = warehouse?.address || userDetails?.address || '';
  const warehouseGstin = warehouse?.gstin || '';
  const warehousePan = warehouse?.panNo || warehouse?.pan || '';
  
  // Ref persons / Phone / Email for warehouse header
  const refPersonMobile = warehouse?.referencePersons?.[0]?.mobile || userDetails?.phoneNumber || '';
  const refPersonEmail = warehouse?.referencePersons?.[0]?.email || warehouse?.userEmail || '';

  // Invoice Number & Dates
  const invoiceNo = invoice.invoiceId || invoice.invoiceNo || (invoice._id ? `CIN-${String(invoice._id).slice(-6).toUpperCase()}` : 'CIN-000000');
  
  const rawDate = invoice.createdAt || invoice.generatedAt || invoice.date;
  const invoiceDateStr = rawDate ? format(new Date(rawDate), 'dd/MM/yyyy') : format(new Date(), 'dd/MM/yyyy');

  const storageFrom = invoice.fromDate ? format(new Date(invoice.fromDate), 'dd/MM/yyyy') : '';
  const storageTo = invoice.toDate ? format(new Date(invoice.toDate), 'dd/MM/yyyy') : '';
  const storagePeriod = (storageFrom && storageTo) ? `${storageFrom} to ${storageTo}` : (storageFrom || storageTo || 'N/A');

  // Customer / Bill To Details
  const customerName = client?.name || 'Valued Customer';
  const addressParts = [
    client?.shopNo ? `Shop No: ${client.shopNo}` : '',
    client?.marketYard,
    client?.address,
    client?.village,
    client?.area,
    client?.city,
    client?.district,
    client?.state ? `${client.state}${client.pincode ? ` - ${client.pincode}` : ''}` : client?.pincode
  ].filter(Boolean);
  const customerAddress = addressParts.length > 0 ? addressParts.join(', ') : 'N/A';
  const customerContact = client?.mobile || client?.phone || '';
  const customerGstin = client?.gstin || '';
  const customerPan = client?.pan || '';

  // Line items
  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const lineItems = items.map((it: any, idx: number) => {
    const inwardDateFormatted = it.inwardDate ? format(new Date(it.inwardDate), 'dd/MM/yyyy') : '-';
    let outwardDateFormatted = '-';
    if (it.outwardDate) {
      outwardDateFormatted = format(new Date(it.outwardDate), 'dd/MM/yyyy');
    } else if (it.outwardKg > 0) {
      outwardDateFormatted = 'Completed';
    }

    const inKg = Number(it.quantityKg || 0);
    const outKg = Number(it.outwardKg || 0);
    const balKg = Number(it.balanceKg || 0);
    const totalBags = Number(it.totalBags || it.bagsCount || (it.bagsLarge || 0) + (it.bagsSmall || 0) + (it.bagsMixed || 0));
    const days = Number(it.days || 0);
    const subtotal = Number(it.subtotal || it.amount || 0);
    const rate = Number(it.rateApplied || it.rate || 0);

    return {
      srNo: idx + 1,
      commodityName: it.commodityName || it.commodity || 'Commodity',
      sacCode: it.sacCode || '998612',
      inwardDate: inwardDateFormatted,
      outwardDate: outwardDateFormatted,
      inwardKg: inKg,
      outwardKg: outKg,
      balanceKg: balKg,
      totalBags: totalBags,
      days: days,
      rate: rate,
      calculationPath: it.calculationPath || '',
      subtotal: subtotal
    };
  });

  // Additional Charges
  const additionalCharges = Array.isArray(invoice.additionalCharges) ? invoice.additionalCharges : [];
  const rentTotal = lineItems.reduce((sum: number, item: any) => sum + item.subtotal, 0);
  const additionalTotal = additionalCharges.reduce((sum: number, chg: any) => sum + (Number(chg.amount) || 0), 0);
  
  const basicTotal = rentTotal + additionalTotal;
  const netAmount = Math.round(basicTotal);
  const roundOff = netAmount - basicTotal;

  // Bank Details
  const bankName = warehouse?.bankDetails?.bankName || '';
  const accountNo = warehouse?.bankDetails?.accountNo || warehouse?.bankDetails?.accountNumber || '';
  const ifscCode = warehouse?.bankDetails?.ifsc || warehouse?.bankDetails?.ifscCode || '';
  const branch = warehouse?.bankDetails?.branch || '';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Cold Storage Invoice - ${invoiceNo}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 9.5pt;
      color: #0f172a;
      background: #fff;
      line-height: 1.4;
    }

    @page {
      size: A4 portrait;
      margin: 10mm 12mm 12mm 12mm;
    }

    @media print {
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .hide-on-print {
        display: none !important;
      }
      .invoice-container {
        padding: 0 !important;
        margin: 0 !important;
        width: 100% !important;
        max-width: none !important;
        box-shadow: none !important;
      }
    }

    .invoice-container {
      width: 100%;
      max-width: 8.5in;
      margin: 0 auto;
      padding: 16px 20px;
      background: #ffffff;
    }

    /* Top Title Bar */
    .invoice-banner {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 8px;
      margin-bottom: 14px;
    }
    .banner-title {
      font-size: 16pt;
      font-weight: 800;
      letter-spacing: 0.8px;
      color: #0f172a;
      text-transform: uppercase;
    }
    .banner-subtitle {
      font-size: 8.5pt;
      font-weight: 600;
      color: #475569;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* Header section */
    .header-grid {
      display: grid;
      grid-template-columns: ${logoUrl ? '140px 1fr 220px' : '1fr 220px'};
      gap: 16px;
      margin-bottom: 16px;
      align-items: start;
    }

    ${logoUrl ? `
    .logo-box {
      display: flex;
      align-items: center;
      justify-content: flex-start;
    }
    .logo-img {
      max-width: 130px;
      max-height: 80px;
      object-fit: contain;
    }
    ` : ''}

    .company-box {
      font-size: 9pt;
      line-height: 1.45;
    }
    .company-name {
      font-size: 14pt;
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 3px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .company-address {
      color: #334155;
      font-size: 8.8pt;
      margin-bottom: 3px;
    }
    .company-tax-info {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      font-size: 8.5pt;
      color: #1e293b;
      margin-top: 4px;
      font-weight: 600;
    }
    .tax-badge {
      background: #f1f5f9;
      padding: 2px 6px;
      border-radius: 4px;
      border: 1px solid #cbd5e1;
    }

    .metadata-card {
      border: 1.5px solid #0f172a;
      border-radius: 6px;
      overflow: hidden;
    }
    .metadata-card-header {
      background: #0f172a;
      color: #ffffff;
      font-size: 8.5pt;
      font-weight: 700;
      text-align: center;
      padding: 4px 8px;
      letter-spacing: 0.5px;
    }
    .metadata-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8.5pt;
    }
    .metadata-table td {
      padding: 4px 8px;
      border-bottom: 1px solid #e2e8f0;
    }
    .metadata-table tr:last-child td {
      border-bottom: none;
    }
    .meta-label {
      font-weight: 600;
      color: #475569;
      width: 45%;
    }
    .meta-value {
      font-weight: 700;
      color: #0f172a;
      text-align: right;
    }

    /* Bill To section */
    .bill-to-section {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 16px;
    }
    .bill-box {
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 10px 12px;
      background: #fafafa;
    }
    .bill-box-title {
      font-size: 8pt;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 3px;
    }
    .client-name {
      font-size: 10.5pt;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 2px;
    }
    .client-detail {
      font-size: 8.5pt;
      color: #334155;
      line-height: 1.4;
    }

    /* Table styling */
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
      font-size: 8.5pt;
    }
    .items-table th {
      background: #f1f5f9;
      color: #0f172a;
      font-weight: 700;
      text-align: left;
      padding: 7px 8px;
      border: 1px solid #cbd5e1;
      font-size: 8pt;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .items-table td {
      padding: 7px 8px;
      border: 1px solid #e2e8f0;
      color: #1e293b;
      vertical-align: top;
    }
    .items-table tbody tr:nth-child(even) {
      background: #f8fafc;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .font-semibold { font-weight: 600; }
    .font-bold { font-weight: 700; }

    /* Summary & Financial section */
    .summary-grid {
      display: grid;
      grid-template-columns: 1fr 280px;
      gap: 16px;
      margin-bottom: 16px;
      align-items: start;
    }

    .words-box {
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 10px 12px;
      background: #f8fafc;
      font-size: 8.5pt;
    }
    .words-title {
      font-weight: 700;
      color: #475569;
      font-size: 8pt;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .words-value {
      font-weight: 700;
      color: #0f172a;
      font-size: 9.5pt;
    }

    .financial-table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      overflow: hidden;
      font-size: 8.8pt;
    }
    .financial-table td {
      padding: 6px 10px;
      border-bottom: 1px solid #e2e8f0;
    }
    .financial-table tr:last-child td {
      border-bottom: none;
    }
    .fin-label { font-weight: 600; color: #475569; }
    .fin-val { text-align: right; font-weight: 700; color: #0f172a; }
    .grand-total-row {
      background: #0f172a !important;
      color: #ffffff !important;
    }
    .grand-total-row td {
      color: #ffffff !important;
      font-size: 10.5pt !important;
      padding: 8px 10px !important;
    }

    /* Bank Details & Terms */
    .bottom-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 20px;
    }
    .info-card {
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 10px 12px;
      font-size: 8.2pt;
      background: #ffffff;
    }
    .info-card-title {
      font-weight: 700;
      color: #0f172a;
      font-size: 8.5pt;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      margin-bottom: 6px;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 4px;
    }
    .bank-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
    }
    .terms-list {
      padding-left: 14px;
      margin: 0;
      line-height: 1.45;
      color: #334155;
    }
    .terms-list li {
      margin-bottom: 3px;
    }

    /* Signature footer */
    .footer-signatures {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-top: 28px;
      padding-top: 10px;
    }
    .sig-box {
      text-align: center;
      width: 200px;
    }
    .sig-line {
      border-top: 1.5px dashed #475569;
      margin-bottom: 6px;
    }
    .sig-title {
      font-size: 8.5pt;
      font-weight: 700;
      color: #0f172a;
    }
    .sig-subtitle {
      font-size: 7.8pt;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="invoice-container">
    <!-- Top Banner -->
    <div class="invoice-banner">
      <div class="banner-title">Tax Invoice</div>
      <div class="banner-subtitle">Cold Storage & Warehousing Services</div>
    </div>

    <!-- Header Grid -->
    <div class="header-grid">
      ${logoUrl ? `
      <div class="logo-box">
        <img src="${logoUrl}" alt="Warehouse Logo" class="logo-img" />
      </div>
      ` : ''}
      <div class="company-box">
        <div class="company-name">${warehouseName}</div>
        <div class="company-address">${warehouseAddress}</div>
        ${(refPersonMobile || refPersonEmail) ? `
          <div class="company-address">
            ${refPersonMobile ? `<strong>Mobile:</strong> ${refPersonMobile}` : ''}
            ${(refPersonMobile && refPersonEmail) ? ' | ' : ''}
            ${refPersonEmail ? `<strong>Email:</strong> ${refPersonEmail}` : ''}
          </div>
        ` : ''}
        <div class="company-tax-info">
          ${warehouseGstin ? `<span class="tax-badge"><strong>GSTIN:</strong> ${warehouseGstin}</span>` : ''}
          ${warehousePan ? `<span class="tax-badge"><strong>PAN:</strong> ${warehousePan}</span>` : ''}
        </div>
      </div>
      <div class="metadata-card">
        <div class="metadata-card-header">INVOICE DETAILS</div>
        <table class="metadata-table">
          <tr>
            <td class="meta-label">Invoice No:</td>
            <td class="meta-value">${invoiceNo}</td>
          </tr>
          <tr>
            <td class="meta-label">Invoice Date:</td>
            <td class="meta-value">${invoiceDateStr}</td>
          </tr>
          <tr>
            <td class="meta-label">Storage Period:</td>
            <td class="meta-value" style="font-size: 7.8pt;">${storagePeriod}</td>
          </tr>
        </table>
      </div>
    </div>

    <!-- Bill To Section -->
    <div class="bill-to-section">
      <div class="bill-box">
        <div class="bill-box-title">Bill To (Customer Details)</div>
        <div class="client-name">${customerName}</div>
        <div class="client-detail">${customerAddress}</div>
        ${customerContact ? `<div class="client-detail"><strong>Mobile:</strong> ${customerContact}</div>` : ''}
      </div>
      <div class="bill-box">
        <div class="bill-box-title">Tax Registration Details</div>
        <div class="client-detail" style="margin-top: 4px;">
          <strong>GSTIN:</strong> ${customerGstin || 'Unregistered / NA'}
        </div>
        <div class="client-detail" style="margin-top: 4px;">
          <strong>PAN:</strong> ${customerPan || 'NA'}
        </div>
        <div class="client-detail" style="margin-top: 4px;">
          <strong>Place of Supply:</strong> ${client?.state || 'State Jurisdiction'}
        </div>
      </div>
    </div>

    <!-- Items Table -->
    <table class="items-table">
      <thead>
        <tr>
          <th style="width: 30px;" class="text-center">#</th>
          <th>Commodity / Description</th>
          <th class="text-center" style="width: 75px;">Inward</th>
          <th class="text-center" style="width: 75px;">Outward</th>
          <th class="text-right" style="width: 80px;">Qty (Kg)</th>
          <th class="text-center" style="width: 55px;">Bags</th>
          <th class="text-right" style="width: 75px;">Rate (₹)</th>
          <th class="text-right" style="width: 90px;">Amount (₹)</th>
        </tr>
      </thead>
      <tbody>
        ${lineItems.map((item: any) => `
          <tr>
            <td class="text-center font-semibold">${item.srNo}</td>
            <td>
              <div class="font-bold">${item.commodityName}</div>
              ${item.calculationPath ? `<div style="font-size: 7.5pt; color: #64748b; margin-top: 2px;">${item.calculationPath}</div>` : ''}
            </td>
            <td class="text-center">${item.inwardDate}</td>
            <td class="text-center">${item.outwardDate}</td>
            <td class="text-right font-semibold">${formatNumber(item.inwardKg, 2)}</td>
            <td class="text-center font-semibold">${item.totalBags}</td>
            <td class="text-right">${item.rate > 0 ? formatNumber(item.rate, 2) : 'Variable'}</td>
            <td class="text-right font-bold">${formatCurrency(item.subtotal, false)}</td>
          </tr>
        `).join('')}

        ${additionalCharges.map((chg: any, idx: number) => `
          <tr style="background: #fff9f5;">
            <td class="text-center font-semibold">${lineItems.length + idx + 1}</td>
            <td colspan="6">
              <div class="font-bold" style="color: #c2410c;">Additional Charge: ${chg.name}</div>
            </td>
            <td class="text-right font-bold" style="color: #c2410c;">${formatCurrency(Number(chg.amount || 0), false)}</td>
          </tr>
        `).join('')}

        ${(lineItems.length === 0 && additionalCharges.length === 0) ? `
          <tr>
            <td colspan="9" class="text-center" style="padding: 16px; color: #64748b;">No billing items recorded.</td>
          </tr>
        ` : ''}
      </tbody>
    </table>

    <!-- Summary Section -->
    <div class="summary-grid">
      <div class="words-box">
        <div class="words-title">Amount in Words</div>
        <div class="words-value">${amountInWords(netAmount)}</div>
      </div>
      <div>
        <table class="financial-table">
          <tr>
            <td class="fin-label">Storage Rent Subtotal:</td>
            <td class="fin-val">${formatCurrency(rentTotal, false)}</td>
          </tr>
          ${additionalCharges.length > 0 ? `
          <tr>
            <td class="fin-label">Additional Charges:</td>
            <td class="fin-val">${formatCurrency(additionalTotal, false)}</td>
          </tr>
          ` : ''}
          <tr>
            <td class="fin-label">Basic Total:</td>
            <td class="fin-val">${formatCurrency(basicTotal, false)}</td>
          </tr>
          ${Math.abs(roundOff) > 0.001 ? `
          <tr>
            <td class="fin-label">Round Off:</td>
            <td class="fin-val">${roundOff >= 0 ? `+${formatCurrency(roundOff, false)}` : formatCurrency(roundOff, false)}</td>
          </tr>
          ` : ''}
          <tr class="grand-total-row">
            <td class="fin-label">NET AMOUNT PAYABLE:</td>
            <td class="fin-val">${formatCurrency(netAmount, true)}</td>
          </tr>
        </table>
      </div>
    </div>

    <!-- Bank Details & Terms -->
    <div class="bottom-grid">
      <div class="info-card">
        <div class="info-card-title">Bank Account Details</div>
        ${bankName ? `
          <div class="bank-row"><span><strong>Bank Name:</strong></span> <span>${bankName}</span></div>
          <div class="bank-row"><span><strong>A/c Number:</strong></span> <span>${accountNo || 'N/A'}</span></div>
          <div class="bank-row"><span><strong>IFSC Code:</strong></span> <span>${ifscCode || 'N/A'}</span></div>
          <div class="bank-row"><span><strong>Branch:</strong></span> <span>${branch || 'N/A'}</span></div>
        ` : `
          <div style="color: #64748b; font-style: italic;">Bank details available upon request.</div>
        `}
      </div>
      <div class="info-card">
        <div class="info-card-title">Terms & Conditions</div>
        ${(() => {
          const termsText = (warehouse?.termsAndConditions || userDetails?.termsAndConditions || '').trim();
          if (!termsText) return '';
          const lines = termsText.split('\n').map((l: string) => l.trim()).filter(Boolean);
          if (lines.length > 1) {
            return `
              <ol class="terms-list" style="margin: 0; padding-left: 14px;">
                ${lines.map((line: string) => `<li>${line.replace(/^[0-9]+[\.\)\-]\s*/, '')}</li>`).join('')}
              </ol>
            `;
          }
          return `<div style="font-size: 8.5pt; color: #334155; white-space: pre-line; line-height: 1.4;">${termsText}</div>`;
        })()}
      </div>
    </div>

    <!-- Signatures -->
    <div class="footer-signatures">
      <div class="sig-box">
        <div class="sig-line"></div>
        <div class="sig-title">Depositor / Customer Signature</div>
      </div>
      <div class="sig-box">
        <div class="sig-line"></div>
        <div class="sig-title">For ${warehouseName}</div>
        <div class="sig-subtitle">Authorized Signatory</div>
      </div>
    </div>
  </div>
</body>
</html>
  `;
}

