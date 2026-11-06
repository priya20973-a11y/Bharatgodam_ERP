import { format } from 'date-fns';

export interface GatePassData {
  inward?: any;
  outward?: any;
  warehouse: any;
  client: any;
  commodity: any;
  userDoc?: any;
  isWithdrawal?: boolean;
}

export function generateGatePassHTML(data: GatePassData): string {
  const { warehouse, client, commodity, userDoc } = data;
  const record = data.outward || data.inward || {};
  const isWithdrawal = data.isWithdrawal !== undefined
    ? data.isWithdrawal
    : Boolean(data.outward || record.direction === 'OUTWARD' || record.type === 'OUTWARD' || record.sourceType === 'outward');

  const escapeHtml = (str: any) => {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const formatDate = (dateVal: any) => {
    if (!dateVal) return '';
    try {
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return '';
      return format(d, 'dd/M/yy');
    } catch {
      return '';
    }
  };

  const logoUrl = warehouse?.warehouseLogo || warehouse?.logo || userDoc?.companyLogo || '';
  const warehouseName = warehouse?.name || userDoc?.companyName || 'Warehouse & Logistics';

  const dateVal = formatDate(record?.date || record?.createdAt || new Date());
  const gatePassNoVal = record?.gatePass || record?.gatePassNo || '001';

  // Times
  const inTimeVal = record?.inTime || (record?.createdAt ? format(new Date(record.createdAt), 'h:mm a') : '');
  const outTimeVal = record?.outTime || '';

  const clientNameVal = client?.name || record?.partyName || '';
  const agentNameVal = record?.agentName || 'SELF';
  const rawCommodityName = commodity?.name || '';
  const varietyVal = record?.variety || commodity?.variety || '';
  const commodityNameVal = varietyVal && rawCommodityName
    ? `${rawCommodityName} (${varietyVal})`
    : (rawCommodityName || varietyVal || '');

  // Moisture: check direct field or gradingResults
  let moistureVal = record?.moisture || '';
  if (!moistureVal && record?.gradingResults && Array.isArray(record.gradingResults)) {
    const moistureParam = record.gradingResults.find((p: any) => 
      p.parameterName?.toLowerCase()?.includes('moist')
    );
    if (moistureParam) {
      moistureVal = moistureParam.observedValue ? `${moistureParam.observedValue}%` : '';
    }
  }

  const bagsVal = record?.bagsCount !== undefined && record?.bagsCount !== null ? String(record.bagsCount) : '';

  const rawPackagingMaterial = record?.packagingMaterial || record?.packaging || record?.packageMaterial || '';
  const packagingMaterialVal = rawPackagingMaterial.trim();
  const packagingSizeVal = (record?.packagingSize || record?.packageSize || record?.pkgSize || '').trim();
  const gslNoVal = (record?.gslNo || record?.gslNumber || record?.gsl_no || record?.gsl || '').trim();

  const truckNoVal = record?.vehicleNumber || '';
  const rsnNoVal = record?.rsnNo || record?.rstNo || '';

  // Weights (Gross, Tare, Net)
  let grossWeightVal = record?.grossWeight !== undefined && record?.grossWeight !== null ? String(record.grossWeight) : '';
  let tareWeightVal = record?.tareWeight !== undefined && record?.tareWeight !== null ? String(record.tareWeight) : '';
  
  let netWeightVal = '';
  if (record?.netWeight !== undefined && record?.netWeight !== null) {
    netWeightVal = String(record.netWeight);
  } else if (record?.actualWeight) {
    const kg = record.actualWeight * 1000;
    netWeightVal = Number.isInteger(kg) ? String(kg) : kg.toFixed(2);
  } else if (record?.quantityMT) {
    const kg = record.quantityMT * 1000;
    netWeightVal = Number.isInteger(kg) ? String(kg) : kg.toFixed(2);
  }

  // If gross and tare are not specified, but user provided quantityMT, tare is calculated or left blank
  if (grossWeightVal && tareWeightVal && !netWeightVal) {
    const g = parseFloat(grossWeightVal);
    const t = parseFloat(tareWeightVal);
    if (!isNaN(g) && !isNaN(t)) {
      netWeightVal = String(g - t);
    }
  }

  const deliveryOrderVal = record?.deliveryOrderNo || '';
  const remarksVal = record?.notes || record?.note || '';
  const idProofNoVal = record?.idProofNo || client?.panNumber || client?.aadharNumber || client?.mobile || '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Gate Pass - No. ${escapeHtml(gatePassNoVal)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm 12mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: 'Segoe UI', Arial, Helvetica, sans-serif;
      color: #111;
      background-color: #f3f4f6;
      font-size: 13.5px;
      line-height: 1.4;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .toolbar {
      position: sticky;
      top: 0;
      background: #1e293b;
      color: white;
      padding: 12px 20px;
      display: flex;
      justify-content: center;
      gap: 16px;
      z-index: 1000;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }
    .btn {
      background: #4f46e5;
      color: #fff;
      border: none;
      padding: 8px 20px;
      font-size: 13px;
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
      background: #475569;
    }
    .btn-secondary:hover {
      background: #334155;
    }
    .sheet {
      width: 210mm;
      min-height: 297mm;
      padding: 12mm 14mm;
      margin: 20px auto;
      background: white;
      border: 1px solid #d1d5db;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
      position: relative;
    }
    @media print {
      body {
        background: transparent;
      }
      .toolbar {
        display: none !important;
      }
      .sheet {
        margin: 0;
        padding: 8mm 12mm;
        border: none;
        box-shadow: none;
        width: 100%;
        min-height: auto;
      }
    }

    /* Header */
    .header-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 8px;
    }
    .logo-cell {
      width: 80px;
      text-align: center;
      vertical-align: middle;
    }
    .logo-img {
      width: 70px;
      height: 70px;
      object-fit: contain;
      border-radius: 50%;
      border: 1.5px solid #222;
      padding: 2px;
    }
    .logo-placeholder {
      width: 68px;
      height: 68px;
      border-radius: 50%;
      border: 2px solid #222;
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-size: 8px;
      font-weight: bold;
      text-align: center;
      line-height: 1.1;
      padding: 2px;
    }
    .wh-title-cell {
      text-align: center;
      vertical-align: middle;
      padding: 0 10px;
    }
    .wh-name {
      font-size: 22px;
      font-weight: 900;
      letter-spacing: 0.5px;
      color: #000;
      text-transform: uppercase;
      font-family: 'Arial Black', Arial, sans-serif;
    }

    /* Subheader Row: Date, GATE PASS, No */
    .subheader-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 8px;
      padding: 4px 6px;
    }
    .sub-date {
      width: 25%;
      font-size: 14px;
      font-weight: bold;
    }
    .sub-title {
      width: 50%;
      text-align: center;
      font-size: 24px;
      font-weight: 900;
      letter-spacing: 2px;
      font-family: Arial, sans-serif;
    }
    .sub-no {
      width: 25%;
      text-align: right;
      font-size: 15px;
      font-weight: bold;
    }
    .sub-no-val {
      font-size: 22px;
      font-weight: 900;
      letter-spacing: 1px;
      font-family: Georgia, serif;
    }

    .header-divider {
      height: 2px;
      background: #000;
      margin: 6px 0 14px 0;
    }

    /* Time and Type Row */
    .time-type-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 18px;
      font-size: 14px;
      font-weight: bold;
      padding: 0 4px;
    }
    .checkbox-box {
      display: inline-block;
      width: 17px;
      height: 17px;
      border: 1.5px solid #000;
      text-align: center;
      line-height: 15px;
      font-size: 13px;
      font-weight: bold;
      vertical-align: middle;
      margin-left: 4px;
    }

    /* Dotted Writing Lines */
    .details-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
    }
    .details-table tr {
      height: 36px;
    }
    .details-table td {
      vertical-align: middle;
      padding: 4px 0;
    }
    .dotted-line-container {
      display: flex;
      align-items: flex-end;
      width: 100%;
    }
    .field-label {
      font-weight: bold;
      color: #000;
      font-size: 14px;
      white-space: nowrap;
    }
    .dotted-line-fill {
      flex: 1;
      border-bottom: 1.5px dotted #000 !important;
      font-weight: 700;
      font-size: 14px;
      line-height: 1.3;
      padding: 0 8px;
      min-height: 20px;
      color: #111;
      word-break: break-word;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    /* Weight Table Box */
    .weight-container {
      display: flex;
      align-items: center;
      gap: 14px;
      width: 100%;
    }
    .weight-box {
      display: inline-flex;
      border: 2px solid #000;
      border-collapse: collapse;
      background: #fff;
    }
    .weight-cell-title {
      background: #000;
      color: #fff;
      font-weight: 900;
      padding: 6px 14px;
      font-size: 14px;
      display: flex;
      align-items: center;
      letter-spacing: 0.5px;
    }
    .weight-cell {
      border-left: 2px solid #000;
      padding: 6px 14px;
      font-size: 14px;
      font-weight: 800;
      display: flex;
      align-items: center;
      min-width: 85px;
      background: #fff;
    }

    /* Footer Signatures */
    .footer-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 40px;
    }
    .footer-table td {
      vertical-align: bottom;
      text-align: center;
      padding: 0 10px;
    }
    .sig-label {
      font-weight: bold;
      font-size: 14px;
      margin-bottom: 40px;
    }
    .sig-line {
      border-bottom: 1.5px solid #000;
      width: 170px;
      margin: 0 auto 6px auto;
    }
    .sig-subtext {
      font-size: 12px;
      font-weight: bold;
      color: #333;
    }
    .id-proof-wrap {
      font-weight: bold;
      font-size: 14px;
      display: flex;
      justify-content: center;
      align-items: baseline;
      gap: 6px;
    }
    .field-val-dotted {
      border-bottom: 1.5px dotted #000;
      font-weight: 700;
      padding: 0 8px;
    }
  </style>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
</head>
<body>

  <div class="toolbar">
    <button class="btn" onclick="window.print()">
      🖨️ Print Gate Pass
    </button>
    <button class="btn btn-secondary" onclick="downloadAsPDF()">
      📥 Download PDF
    </button>
  </div>

  <div class="sheet" id="gate-pass-sheet">
    <!-- Header -->
    <table class="header-table">
      <tr>
        <td class="logo-cell">
          ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" class="logo-img" alt="Logo" />` : `
            <div class="logo-placeholder">
              <span>AGRI</span>
              <span>CROP</span>
            </div>
          `}
        </td>
        <td class="wh-title-cell">
          <div class="wh-name">${escapeHtml(warehouseName)}</div>
        </td>
        <td class="logo-cell">
          ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" class="logo-img" alt="Logo" />` : `
            <div class="logo-placeholder">
              <span>AGRI</span>
              <span>LOGISTICS</span>
            </div>
          `}
        </td>
      </tr>
    </table>

    <!-- Subheader: Date, GATE PASS, No -->
    <div class="subheader-row">
      <div class="sub-date">
        <span>Date :</span>
        <span class="field-val-dotted">&nbsp;${escapeHtml(dateVal)}&nbsp;</span>
      </div>
      <div class="sub-title">GATE PASS</div>
      <div class="sub-no">
        <span>No.:</span>
        <span class="sub-no-val">&nbsp;${escapeHtml(gatePassNoVal)}</span>
      </div>
    </div>

    <div class="header-divider"></div>

    <!-- Time and Transaction Type Row -->
    <div class="time-type-row">
      <div>
        <span>In Time:</span>
        <span class="field-val-dotted">&nbsp;${escapeHtml(inTimeVal)}&nbsp;</span>
      </div>
      <div>
        <span>Deposit</span>
        <span class="checkbox-box">${isWithdrawal ? '' : '✓'}</span>
        <span style="margin-left: 16px;">Withdrawal</span>
        <span class="checkbox-box">${isWithdrawal ? '✓' : ''}</span>
      </div>
      <div>
        <span>Out Time:</span>
        <span class="field-val-dotted">&nbsp;${escapeHtml(outTimeVal)}&nbsp;</span>
      </div>
    </div>

    <!-- Inward Details with Dotted Writing Lines -->
    <table class="details-table">
      <tr>
        <td colspan="2">
          <div class="dotted-line-container">
            <span class="field-label">Warehouse Name:&nbsp;</span>
            <div class="dotted-line-fill">${escapeHtml(warehouseName)}</div>
          </div>
        </td>
      </tr>
      <tr>
        <td colspan="2">
          <div class="dotted-line-container">
            <span class="field-label">Client Name :&nbsp;</span>
            <div class="dotted-line-fill">${escapeHtml(clientNameVal)}</div>
          </div>
        </td>
      </tr>
      <tr>
        <td colspan="2">
          <div class="dotted-line-container">
            <span class="field-label">Agent Name :&nbsp;</span>
            <div class="dotted-line-fill">${escapeHtml(agentNameVal)}</div>
          </div>
        </td>
      </tr>
      <tr>
        <td style="width: 55%; padding-right: 12px;">
          <div class="dotted-line-container">
            <span class="field-label">Commodity Name :&nbsp;</span>
            <div class="dotted-line-fill">${escapeHtml(commodityNameVal)}</div>
          </div>
        </td>
        <td style="width: 45%;">
          <div class="dotted-line-container">
            <span class="field-label">Mousture:&nbsp;</span>
            <div class="dotted-line-fill">${escapeHtml(moistureVal)}</div>
          </div>
        </td>
      </tr>
      <tr>
        <td style="width: 55%; padding-right: 12px;">
          <div class="dotted-line-container">
            <span class="field-label">Bags :&nbsp;</span>
            <div class="dotted-line-fill">${escapeHtml(bagsVal)}</div>
          </div>
        </td>
        <td style="width: 45%;">
          <div class="dotted-line-container">
            <span class="field-label">G/S/L No.:&nbsp;</span>
            <div class="dotted-line-fill">${escapeHtml(gslNoVal)}</div>
          </div>
        </td>
      </tr>
      <tr>
        <td style="width: 55%; padding-right: 12px;">
          <div class="dotted-line-container">
            <span class="field-label">Truck No.:&nbsp;</span>
            <div class="dotted-line-fill">${escapeHtml(truckNoVal)}</div>
          </div>
        </td>
        <td style="width: 45%;">
          <div class="dotted-line-container">
            <span class="field-label">Rst No.:&nbsp;</span>
            <div class="dotted-line-fill">${escapeHtml(rsnNoVal)}</div>
          </div>
        </td>
      </tr>
      <tr>
        <td style="width: 55%; padding-right: 12px;">
          <div class="dotted-line-container">
            <span class="field-label">Packaging Material :&nbsp;</span>
            <div class="dotted-line-fill">${escapeHtml(packagingMaterialVal)}</div>
          </div>
        </td>
        <td style="width: 45%;">
          <div class="dotted-line-container">
            <span class="field-label">Packaging Size :&nbsp;</span>
            <div class="dotted-line-fill">${escapeHtml(packagingSizeVal)}</div>
          </div>
        </td>
      </tr>
      <tr>
        <td colspan="2" style="padding-top: 10px; padding-bottom: 10px;">
          <div class="weight-container">
            <div class="weight-box">
              <div class="weight-cell-title">Weight</div>
              <div class="weight-cell">G- &nbsp;${escapeHtml(grossWeightVal)}</div>
              <div class="weight-cell">T- &nbsp;${escapeHtml(tareWeightVal)}</div>
              <div class="weight-cell">N- &nbsp;${escapeHtml(netWeightVal)}</div>
            </div>
            <div class="dotted-line-container" style="flex: 1;">
              <span class="field-label" style="font-size: 13px;">Delivery Order No. &amp; Date:&nbsp;</span>
              <div class="dotted-line-fill">${escapeHtml(deliveryOrderVal)}</div>
            </div>
          </div>
        </td>
      </tr>
      <tr>
        <td colspan="2">
          <div class="dotted-line-container">
            <span class="field-label">Remarks:&nbsp;</span>
            <div class="dotted-line-fill">${escapeHtml(remarksVal)}</div>
          </div>
        </td>
      </tr>
    </table>

    <!-- Footer Signatures -->
    <table class="footer-table">
      <tr>
        <td style="width: 32%;">
          <div class="sig-label">Signature</div>
          <div class="sig-line"></div>
          <div class="sig-subtext">W/h Supervisor &amp; Manager</div>
        </td>
        <td style="width: 36%;">
          <div class="id-proof-wrap">
            <span>ID Proof No.:</span>
            <span class="field-val-dotted">&nbsp;${escapeHtml(idProofNoVal)}&nbsp;</span>
          </div>
        </td>
        <td style="width: 32%;">
          <div class="sig-label">Signature</div>
          <div class="sig-line"></div>
          <div class="sig-subtext">Client / Agent / Driver</div>
        </td>
      </tr>
    </table>
  </div>

  <script>
    function downloadAsPDF() {
      const element = document.getElementById('gate-pass-sheet');
      const opt = {
        margin: [6, 10, 6, 10],
        filename: 'Gate_Pass_${escapeHtml(gatePassNoVal)}.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };
      if (window.html2pdf) {
        window.html2pdf().set(opt).from(element).save();
      } else {
        window.print();
      }
    }
  </script>
</body>
</html>`;
}

