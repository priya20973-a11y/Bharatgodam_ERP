import { format } from 'date-fns';

export interface WeighmentReceiptData {
  inward?: any;
  outward?: any;
  warehouse: any;
  client: any;
  commodity: any;
  userDoc?: any;
  isWithdrawal?: boolean;
}

export function generateWeighmentReceiptHTML(data: WeighmentReceiptData): string {
  const { warehouse, client, commodity, userDoc } = data;
  const isWithdrawal = data.isWithdrawal !== undefined
    ? data.isWithdrawal
    : Boolean(data.outward && !data.inward);
  const record = (isWithdrawal ? (data.outward || data.inward) : (data.inward || data.outward)) || {};

  const escapeHtml = (str: any) => {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const formatDate = (dateVal: any): string => {
    if (!dateVal) return '';
    try {
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return '';
      return format(d, 'dd/MM/yyyy');
    } catch {
      return '';
    }
  };

  const formatTime = (timeVal: any, fallbackDate?: any): string => {
    if (timeVal && typeof timeVal === 'string' && timeVal.trim() !== '') {
      return timeVal.trim();
    }
    if (fallbackDate) {
      try {
        const d = new Date(fallbackDate);
        if (!isNaN(d.getTime())) {
          return format(d, 'hh:mm a');
        }
      } catch {
        // ignore
      }
    }
    return '';
  };

  const logoUrl = userDoc?.companyLogo || warehouse?.warehouseLogo || warehouse?.logo || '';
  const companyName = userDoc?.companyName?.trim() || userDoc?.fullName?.trim() || warehouse?.name || 'Company Name';

  // Warehouse Address and Mobile Number (Fetched from Warehouse Master / Organization)
  const addressParts: string[] = [];
  if (warehouse?.name && warehouse.name !== companyName) addressParts.push(warehouse.name);
  if (warehouse?.address) addressParts.push(warehouse.address);
  else if (warehouse?.location) addressParts.push(warehouse.location);
  else if (userDoc?.address) addressParts.push(userDoc.address);
  const warehouseAddress = addressParts.join(', ') || 'Warehouse Facility';
  const warehouseMobile = warehouse?.mobile || warehouse?.phone || warehouse?.contactNumber || userDoc?.phoneNumber || userDoc?.phone || userDoc?.mobile || '';

  const receiptNo = record?.gatePass || record?.gatePassNo || record?.dailyReportSrNo || (record?._id ? record._id.toString().slice(-6).toUpperCase() : '001');
  const transactionDate = formatDate(record?.date || record?.createdAt) || format(new Date(), 'dd/MM/yyyy');

  // Party Name and Vehicle Number (reused)
  const partyName = (record?.partyName && String(record.partyName).trim() !== '')
    ? String(record.partyName).trim()
    : (client?.name ? String(client.name).trim() : '');
  const vehicleNumber = (record?.vehicleNumber && String(record.vehicleNumber).trim() !== '')
    ? String(record.vehicleNumber).trim()
    : '';
  const transportName = (record?.transportationName && String(record.transportationName).trim() !== '')
    ? String(record.transportationName).trim()
    : '';
  const driverInfo = (record?.driverName && String(record.driverName).trim() !== '')
    ? String(record.driverName).trim()
    : '';

  // Transport Charges (optional, manual input)
  const transportChargesVal = record?.transportCharges !== undefined && record?.transportCharges !== null && !isNaN(Number(record?.transportCharges)) && Number(record?.transportCharges) > 0
    ? Number(record.transportCharges)
    : undefined;

  // Commodity & Packaging Info
  const commodityName = commodity?.name ? String(commodity.name).trim() : '';
  const variety = record?.variety ? String(record.variety).trim() : (commodity?.variety ? String(commodity.variety).trim() : '');
  const commodityDisplay = variety && commodityName ? `${commodityName} (${variety})` : (commodityName || variety || '');
  const bagsCount = record?.bagsCount !== undefined && record?.bagsCount !== null && Number(record.bagsCount) > 0
    ? `${record.bagsCount} Bags`
    : '';

  // 1st Weightment (Gross)
  const grossWeightNum = record?.grossWeight !== undefined && record?.grossWeight !== null && !isNaN(Number(record?.grossWeight)) && Number(record?.grossWeight) > 0
    ? Number(record.grossWeight)
    : undefined;
  const grossDate = record?.grossWeightDate ? formatDate(record.grossWeightDate) : formatDate(record?.date || record?.createdAt);
  const grossTime = formatTime(record?.inTime, record?.createdAt);

  const rawGrossImages = Array.isArray(record?.grossWeightImages) ? record.grossWeightImages : [];
  const grossImages: string[] = rawGrossImages.filter((img: any) => typeof img === 'string' && img.trim() !== '');

  // 2nd Weightment (Tare)
  const tareWeightNum = record?.tareWeight !== undefined && record?.tareWeight !== null && !isNaN(Number(record?.tareWeight)) && Number(record?.tareWeight) > 0
    ? Number(record.tareWeight)
    : undefined;
  const tareDate = record?.tareWeightDate ? formatDate(record.tareWeightDate) : formatDate(record?.date || record?.createdAt);
  const tareTime = formatTime(record?.outTime, record?.updatedAt);

  const rawTareImages = Array.isArray(record?.tareWeightImages) ? record.tareWeightImages : [];
  const tareImages: string[] = rawTareImages.filter((img: any) => typeof img === 'string' && img.trim() !== '');

  // Net Weight: Gross Weight − Tare Weight
  let netWeightNum: number | undefined;
  let isDirectCalc = false;
  if (grossWeightNum !== undefined && tareWeightNum !== undefined) {
    netWeightNum = Math.max(0, grossWeightNum - tareWeightNum);
    isDirectCalc = true;
  } else if (record?.netWeight !== undefined && record?.netWeight !== null && !isNaN(Number(record.netWeight)) && Number(record.netWeight) > 0) {
    netWeightNum = Number(record.netWeight);
  } else if (record?.quantityMT && Number(record.quantityMT) > 0) {
    netWeightNum = Math.round(Number(record.quantityMT) * 1000);
  }

  // Build Meta Items without empty values
  interface MetaField {
    label: string;
    value: string;
    isHighlight?: boolean;
    isBadge?: boolean;
  }
  const metaFields: MetaField[] = [];

  if (partyName) {
    metaFields.push({ label: 'Party Name', value: partyName, isHighlight: true });
  }
  if (vehicleNumber) {
    metaFields.push({ label: 'Vehicle Number', value: vehicleNumber, isHighlight: true });
  }
  if (transportChargesVal !== undefined) {
    metaFields.push({
      label: 'Transport Charges',
      value: `₹ ${transportChargesVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      isBadge: true,
    });
  }
  if (commodityDisplay) {
    metaFields.push({
      label: 'Commodity',
      value: bagsCount ? `${commodityDisplay} • ${bagsCount}` : commodityDisplay,
    });
  }
  if (transportName) {
    metaFields.push({ label: 'Transporter', value: transportName });
  }
  if (driverInfo) {
    metaFields.push({ label: 'Driver Details', value: driverInfo });
  }
  if (record?.packagingMaterial || record?.packagingSize) {
    const pkg = [record.packagingMaterial, record.packagingSize].filter(Boolean).map((s: string) => String(s).trim()).filter(Boolean).join(' • ');
    if (pkg) {
      metaFields.push({ label: 'Packaging', value: pkg });
    }
  }
  if (record?.gatePassNo || record?.gatePass) {
    const gp = String(record.gatePassNo || record.gatePass).trim();
    if (gp && gp !== receiptNo) {
      metaFields.push({ label: 'Gate Pass', value: gp });
    }
  }

  // Render meta table rows in 2-column layout (no empty cells)
  let metaTableHtml = '';
  if (metaFields.length > 0) {
    const rows: string[] = [];
    for (let i = 0; i < metaFields.length; i += 2) {
      const item1 = metaFields[i];
      const item2 = metaFields[i + 1];

      if (item2) {
        rows.push(`
          <tr>
            <td class="meta-label">${escapeHtml(item1.label)}</td>
            <td class="meta-val ${item1.isHighlight ? 'highlight-val' : ''}">
              ${item1.isBadge ? `<span class="charges-badge">${escapeHtml(item1.value)}</span>` : escapeHtml(item1.value)}
            </td>
            <td class="meta-label">${escapeHtml(item2.label)}</td>
            <td class="meta-val ${item2.isHighlight ? 'highlight-val' : ''}">
              ${item2.isBadge ? `<span class="charges-badge">${escapeHtml(item2.value)}</span>` : escapeHtml(item2.value)}
            </td>
          </tr>
        `);
      } else {
        rows.push(`
          <tr>
            <td class="meta-label">${escapeHtml(item1.label)}</td>
            <td class="meta-val ${item1.isHighlight ? 'highlight-val' : ''}" colspan="3">
              ${item1.isBadge ? `<span class="charges-badge">${escapeHtml(item1.value)}</span>` : escapeHtml(item1.value)}
            </td>
          </tr>
        `);
      }
    }

    metaTableHtml = `
      <table class="meta-table">
        <tbody>
          ${rows.join('')}
        </tbody>
      </table>
    `;
  }

  // Render image boxes only when images actually exist (no placeholder boxes)
  const renderImagesSection = (images: string[], weightTitle: string) => {
    if (!images || images.length === 0) return '';
    const isSingle = images.length === 1;

    const slots = images.map((imgSrc, idx) => `
      <div class="img-slot">
        <div class="img-frame">
          <img src="${imgSrc}" alt="${escapeHtml(weightTitle)} Photo ${idx + 1}" />
        </div>
        <div class="img-caption">${escapeHtml(weightTitle)} — Photo ${idx + 1}</div>
      </div>
    `).join('');

    return `
      <div class="images-grid ${isSingle ? 'single-image' : ''}">
        ${slots}
      </div>
    `;
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Weighment Receipt - Slip No. ${escapeHtml(receiptNo)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
  <style>
    @page {
      size: A4 portrait;
      margin: 4mm 6mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    html, body {
      background: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #0f172a;
      -webkit-font-smoothing: antialiased;
    }

    /* Print / Preview Action Toolbar (Hidden during print) */
    .toolbar {
      position: sticky;
      top: 0;
      background: #1e293b;
      padding: 10px 16px;
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 12px;
      z-index: 1000;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.15);
    }
    .btn {
      background: #4f46e5;
      color: #fff;
      border: none;
      padding: 7px 16px;
      font-size: 12px;
      font-weight: 600;
      border-radius: 6px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background 0.15s ease;
    }
    .btn:hover {
      background: #4338ca;
    }
    .btn-secondary {
      background: #334155;
    }
    .btn-secondary:hover {
      background: #1e293b;
    }
    .btn-close {
      background: #ef4444;
    }
    .btn-close:hover {
      background: #dc2626;
    }

    /* Strict A4 Single-Page Container */
    .sheet {
      width: 200mm;
      max-width: 200mm;
      min-height: 284mm;
      max-height: 287mm;
      padding: 5mm 7mm;
      margin: 10px auto;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow: hidden;
      page-break-inside: avoid !important;
      page-break-after: avoid !important;
      page-break-before: avoid !important;
    }

    @media print {
      html, body {
        background: transparent !important;
        margin: 0 !important;
        padding: 0 !important;
        height: 297mm !important;
        overflow: hidden !important;
      }
      .toolbar {
        display: none !important;
      }
      .sheet {
        margin: 0 !important;
        padding: 4mm 6mm !important;
        border: none !important;
        box-shadow: none !important;
        width: 100% !important;
        max-width: 100% !important;
        height: 297mm !important;
        max-height: 297mm !important;
      }
    }

    /* Header Box */
    .header-box {
      border: 1.5px solid #0f172a;
      border-radius: 4px;
      padding: 6px 12px;
      margin-bottom: 5px;
      background: #ffffff;
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .header-logo-wrap {
      width: 64px;
      height: 64px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .header-logo {
      max-width: 64px;
      max-height: 64px;
      object-fit: contain;
    }
    .header-logo-placeholder {
      width: 58px;
      height: 58px;
      border: 1.5px solid #0f172a;
      border-radius: 4px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 900;
      line-height: 1;
      color: #0f172a;
    }
    .header-info {
      flex: 1;
      text-align: center;
    }
    .header-title {
      font-size: 18px;
      font-weight: 900;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      color: #0f172a;
      line-height: 1.15;
    }
    .header-address {
      font-size: 11px;
      font-weight: 500;
      color: #334155;
      margin-top: 2px;
    }
    .header-mobile {
      font-size: 11px;
      font-weight: 700;
      color: #0f172a;
      margin-top: 2px;
      display: inline-block;
      background: #f1f5f9;
      padding: 1px 8px;
      border-radius: 4px;
      border: 1px solid #e2e8f0;
    }

    /* Sub-bar with Document Title & Slip No */
    .title-banner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #0f172a;
      color: #ffffff;
      padding: 4px 10px;
      border-radius: 4px;
      margin-bottom: 5px;
    }
    .banner-heading {
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.8px;
      text-transform: uppercase;
    }
    .banner-meta {
      font-size: 10.5px;
      font-weight: 600;
      display: flex;
      gap: 14px;
    }
    .banner-badge {
      background: #4f46e5;
      padding: 1px 6px;
      border-radius: 3px;
      color: white;
    }

    /* Party & Vehicle Details Table */
    .meta-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 5px;
      font-size: 10.5px;
      border: 1.5px solid #0f172a;
      border-radius: 4px;
      overflow: hidden;
    }
    .meta-table td {
      padding: 3.5px 7px;
      border: 1px solid #cbd5e1;
      vertical-align: middle;
    }
    .meta-label {
      font-weight: 700;
      color: #475569;
      background: #f8fafc;
      width: 17%;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .meta-val {
      font-weight: 600;
      color: #0f172a;
      width: 33%;
    }
    .highlight-val {
      font-weight: 800;
      color: #0f172a;
    }
    .charges-badge {
      font-weight: 800;
      color: #047857;
      background: #ecfdf5;
      padding: 1.5px 6px;
      border-radius: 3px;
      border: 1px solid #a7f3d0;
      display: inline-block;
    }

    /* Weightment Cards Section */
    .weight-grid {
      display: flex;
      flex-direction: column;
      gap: 5px;
      margin-bottom: 5px;
    }
    .weight-card {
      border: 1.5px solid #0f172a;
      border-radius: 4px;
      overflow: hidden;
      background: #ffffff;
    }
    .weight-card-header {
      background: #f1f5f9;
      border-bottom: 1.5px solid #0f172a;
      padding: 3.5px 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .weight-card-title {
      font-size: 11.5px;
      font-weight: 800;
      color: #0f172a;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }
    .weight-card-metrics {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .weight-pill {
      font-size: 12.5px;
      font-weight: 900;
      background: #0f172a;
      color: #ffffff;
      padding: 1.5px 8px;
      border-radius: 3px;
      letter-spacing: 0.3px;
    }
    .weight-date-pill {
      font-size: 10.5px;
      font-weight: 700;
      color: #334155;
    }

    /* Images Grid (renders strictly uploaded images, no placeholders) */
    .images-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      padding: 4px 6px;
      background: #fafafa;
    }
    .images-grid.single-image {
      grid-template-columns: 1fr;
      max-width: 50%;
      margin: 0 auto;
    }
    .img-slot {
      display: flex;
      flex-direction: column;
      align-items: center;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 2.5px;
    }
    .img-frame {
      width: 100%;
      height: 72px;
      max-height: 72px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #0f172a;
      border-radius: 3px;
      overflow: hidden;
    }
    .img-frame img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
    }
    .img-caption {
      margin-top: 2px;
      font-size: 9px;
      font-weight: 700;
      color: #475569;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    /* Net Weight Calculation Banner (Gross − Tare) */
    .net-weight-banner {
      border: 2px solid #047857;
      background: #ecfdf5;
      border-radius: 5px;
      padding: 6px 10px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 5px;
    }
    .net-weight-calc-text {
      font-size: 10.5px;
      font-weight: 700;
      color: #065f46;
      line-height: 1.25;
    }
    .calc-formula {
      font-size: 9.5px;
      color: #047857;
      font-weight: 600;
      display: block;
      margin-top: 1px;
    }
    .net-weight-number-wrap {
      text-align: right;
    }
    .net-weight-label {
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: #065f46;
    }
    .net-weight-val {
      font-size: 18px;
      font-weight: 900;
      color: #047857;
      line-height: 1.1;
      letter-spacing: 0.4px;
    }
    .net-weight-mt {
      font-size: 10.5px;
      font-weight: 700;
      color: #065f46;
    }

    /* Signatures Block */
    .signatures-block {
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 8px 12px 5px 12px;
      background: #ffffff;
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 10px;
      margin-top: auto;
    }
    .sig-col {
      text-align: center;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      height: 42px;
    }
    .sig-line {
      border-top: 1px dashed #64748b;
      padding-top: 3px;
      font-size: 9.5px;
      font-weight: 700;
      color: #334155;
      text-transform: uppercase;
    }

    /* Footer Note */
    .footer-note {
      text-align: center;
      font-size: 8.5px;
      font-weight: 500;
      color: #64748b;
      margin-top: 3px;
    }
  </style>
</head>
<body>
  <!-- Print / Download Floating Toolbar -->
  <div class="toolbar">
    <button type="button" class="btn" onclick="window.print()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 6 2 18 2 18 9"></polyline>
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
        <rect x="6" y="14" width="12" height="8"></rect>
      </svg>
      Print / Save PDF
    </button>
    <button type="button" class="btn btn-secondary" onclick="downloadReceiptPDF()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
      Download PDF
    </button>
    <button type="button" class="btn btn-close" onclick="window.close()">
      Close
    </button>
  </div>

  <!-- A4 Single-Page Weighment Slip Sheet -->
  <div class="sheet" id="receipt-sheet">
    <div>
      <!-- 1. Header: Warehouse Name, Address, Mobile (from Warehouse Master) -->
      <div class="header-box">
        <div class="header-logo-wrap">
          ${logoUrl ? `
            <img class="header-logo" src="${logoUrl}" alt="Warehouse Logo" />
          ` : `
            <div class="header-logo-placeholder">
              <span>W/H</span>
              <span style="font-size:7px;">LOGISTICS</span>
            </div>
          `}
        </div>
        <div class="header-info">
          <div class="header-title">${escapeHtml(companyName)}</div>
          <div class="header-address">${escapeHtml(warehouseAddress)}</div>
          ${warehouseMobile ? `
            <div class="header-mobile">📞 Mobile / Phone: ${escapeHtml(warehouseMobile)}</div>
          ` : ''}
        </div>
      </div>

      <!-- 2. Title Banner & Metadata -->
      <div class="title-banner">
        <div class="banner-heading">${isWithdrawal ? 'Official Weighment Receipt (Withdrawal)' : 'Official Weighment Receipt'}</div>
        <div class="banner-meta">
          <div>Slip No: <span class="banner-badge">${escapeHtml(receiptNo)}</span></div>
          <div>Date: <strong>${escapeHtml(transactionDate)}</strong></div>
        </div>
      </div>

      <!-- 3. Entry Details: Party Name, Vehicle Number, Transport Charges (only non-empty fields) -->
      ${metaTableHtml}

      <!-- 4. Weights Section with 1st & 2nd Weightment Images (no empty placeholders) -->
      <div class="weight-grid">
        <!-- 1st Weightment (Gross Weight) -->
        <div class="weight-card">
          <div class="weight-card-header">
            <span class="weight-card-title">1st Weightment: Gross Truck Weight</span>
            <div class="weight-card-metrics">
              ${grossDate ? `<span class="weight-date-pill">Date: ${escapeHtml(grossDate)}${grossTime ? ` (${escapeHtml(grossTime)})` : ''}</span>` : ''}
              ${grossWeightNum !== undefined ? `
                <span class="weight-pill">
                  ${grossWeightNum.toLocaleString('en-IN')} KG
                  <span style="font-weight:normal; font-size:9.5px; margin-left:3px;">(${(grossWeightNum / 1000).toFixed(2)} MT)</span>
                </span>
              ` : ''}
            </div>
          </div>
          ${renderImagesSection(grossImages, 'Gross Weight')}
        </div>

        <!-- 2nd Weightment (Tare Weight) -->
        <div class="weight-card">
          <div class="weight-card-header">
            <span class="weight-card-title">2nd Weightment: Tare Truck Weight</span>
            <div class="weight-card-metrics">
              ${tareDate ? `<span class="weight-date-pill">Date: ${escapeHtml(tareDate)}${tareTime ? ` (${escapeHtml(tareTime)})` : ''}</span>` : ''}
              ${tareWeightNum !== undefined ? `
                <span class="weight-pill">
                  ${tareWeightNum.toLocaleString('en-IN')} KG
                  <span style="font-weight:normal; font-size:9.5px; margin-left:3px;">(${(tareWeightNum / 1000).toFixed(2)} MT)</span>
                </span>
              ` : ''}
            </div>
          </div>
          ${renderImagesSection(tareImages, 'Tare Weight')}
        </div>
      </div>

      <!-- 5. Net Weight Calculation (Gross − Tare) -->
      ${netWeightNum !== undefined ? `
        <div class="net-weight-banner">
          <div>
            <div class="net-weight-calc-text">
              <strong>NET WEIGHT CALCULATION</strong>
              ${isDirectCalc && grossWeightNum !== undefined && tareWeightNum !== undefined ? `
                <span class="calc-formula">
                  Gross Weight (${grossWeightNum.toLocaleString('en-IN')} KG) − Tare Weight (${tareWeightNum.toLocaleString('en-IN')} KG)
                </span>
              ` : `
                <span class="calc-formula">Net Material Weight</span>
              `}
            </div>
          </div>
          <div class="net-weight-number-wrap">
            <div class="net-weight-label">Net Material Weight</div>
            <div class="net-weight-val">
              ${netWeightNum.toLocaleString('en-IN')} KG
              <span class="net-weight-mt">(${(netWeightNum / 1000).toFixed(2)} MT)</span>
            </div>
          </div>
        </div>
      ` : ''}
    </div>

    <!-- 6. Signatures and Verification Block -->
    <div>
      <div class="signatures-block">
        <div class="sig-col">
          <div class="sig-line">Weighbridge Operator</div>
        </div>
        <div class="sig-col">
          <div class="sig-line">Driver / Transporter</div>
        </div>
        <div class="sig-col">
          <div class="sig-line">Authorized Signatory</div>
        </div>
      </div>
      <div class="footer-note">
        This is a computer-generated weighment slip issued by ${escapeHtml(companyName)}. Verified &amp; Recorded electronically.
      </div>
    </div>
  </div>

  <script>
    async function downloadReceiptPDF() {
      const sheet = document.getElementById('receipt-sheet');
      if (!sheet) return;

      const opt = {
        margin: [4, 6, 4, 6],
        filename: 'Weighment_Receipt_${escapeHtml(receiptNo)}.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      try {
        if (window.html2pdf) {
          await window.html2pdf().set(opt).from(sheet).save();
        } else {
          window.print();
        }
      } catch (e) {
        console.error('PDF generation error:', e);
        window.print();
      }
    }
  </script>
</body>
</html>`;
}
