import { format } from 'date-fns';

export interface DailyTruckReportData {
  inward?: any;
  outward?: any;
  warehouse: any;
  client: any;
  commodity: any;
  userDoc?: any;
  isWithdrawal?: boolean;
}

export function generateDailyTruckReportHTML(data: DailyTruckReportData): string {
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
      return format(d, 'dd/MM/yy');
    } catch {
      return '';
    }
  };

  const logoUrl = warehouse?.warehouseLogo || warehouse?.logo || userDoc?.companyLogo || '';
  const warehouseName = warehouse?.name || userDoc?.companyName || 'Warehouse & Logistics';
  
  // Format address line
  const addressParts: string[] = [];
  if (warehouse?.address) addressParts.push(warehouse.address);
  if (warehouse?.location && warehouse.location !== warehouse.address) addressParts.push(warehouse.location);
  if (warehouse?.email) addressParts.push(`E-mail : ${warehouse.email}`);
  else if (userDoc?.email) addressParts.push(`E-mail : ${userDoc.email}`);
  const warehouseAddressLine = addressParts.join('. ') || 'Warehouse & Logistics Hub';

  const srNo = record?.dailyReportSrNo || '001';
  const stateVal = warehouse?.state || client?.state || 'Gujarat';
  const distVal = warehouse?.district || client?.district || (client?.address ? client.address.split(',').pop()?.trim() : '') || 'Rajkot';
  const dateVal = formatDate(record?.date || record?.createdAt || new Date());
  const locationVal = warehouse?.location || warehouse?.address || '';

  const clientNameVal = client?.name || record?.partyName || '';
  const agentNameVal = record?.agentName || 'SELF';
  const authorityPersonVal = record?.authorityPerson || client?.name || '';

  const addressMobileParts: string[] = [];
  if (client?.address) addressMobileParts.push(client.address);
  if (client?.mobile) addressMobileParts.push(client.mobile);
  const addressMobileVal = addressMobileParts.join(' / ');

  const commodityNameVal = commodity?.name || '';
  const varietyVal = record?.variety || commodity?.variety || '';
  const totalBagsVal = record?.bagsCount !== undefined && record?.bagsCount !== null ? String(record.bagsCount) : '';
  
  // Net weight: if netWeight is given use that, else if actualWeight or quantityMT is in MT, convert to KG
  let netWeightVal = '';
  if (record?.netWeight) {
    netWeightVal = String(record.netWeight);
  } else if (record?.actualWeight) {
    const kg = record.actualWeight * 1000;
    netWeightVal = Number.isInteger(kg) ? String(kg) : kg.toFixed(2);
  } else if (record?.quantityMT) {
    // In reference: 386 bags = 19475 net wt (in kg)
    const kg = record.quantityMT * 1000;
    netWeightVal = Number.isInteger(kg) ? String(kg) : kg.toFixed(2);
  }

  const gatePassNoVal = record?.gatePass || record?.gatePassNo || '';
  
  const rawPackagingMaterial = record?.packagingMaterial || record?.packaging || record?.packageMaterial || '';
  const packagingMaterialVal = rawPackagingMaterial.trim();
  const packagingSizeVal = (record?.packagingSize || record?.packageSize || record?.pkgSize || '').trim();
  const gslNoVal = (record?.gslNo || record?.gslNumber || record?.gsl_no || record?.gsl || '').trim();

  const wbNameAddressVal = record?.weighbridgeNameAddress || '';
  const remarksVal = record?.notes || record?.note || '';
  const idProofNoVal = record?.idProofNo || client?.panNumber || client?.aadharNumber || client?.mobile || '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Daily Truck Transaction Report - Sr. No. ${escapeHtml(srNo)}</title>
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
      font-size: 13px;
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
      padding: 10mm 14mm;
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
        padding: 6mm 10mm;
        border: none;
        box-shadow: none;
        width: 100%;
        min-height: auto;
      }
    }
    
    /* Header layout */
    .header-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 6px;
    }
    .logo-cell {
      width: 75px;
      text-align: center;
      vertical-align: middle;
    }
    .logo-img {
      width: 65px;
      height: 65px;
      object-fit: contain;
      border-radius: 50%;
      border: 1.5px solid #222;
      padding: 2px;
    }
    .logo-placeholder {
      width: 62px;
      height: 62px;
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
      font-size: 21px;
      font-weight: 900;
      letter-spacing: 0.5px;
      color: #000;
      text-transform: uppercase;
      font-family: 'Arial Black', Arial, sans-serif;
    }
    .wh-address {
      font-size: 11px;
      font-weight: 600;
      color: #222;
      margin-top: 3px;
      line-height: 1.3;
    }
    
    .header-divider {
      height: 2px;
      background: #000;
      margin: 4px 0 8px 0;
    }
    
    /* Title bar */
    .title-row {
      display: flex;
      justify-content: center;
      align-items: center;
      position: relative;
      margin-bottom: 8px;
    }
    .pill-title {
      background: #000;
      color: #fff;
      padding: 3px 20px;
      border-radius: 14px;
      font-weight: 700;
      font-size: 13.5px;
      letter-spacing: 0.5px;
      display: inline-block;
    }
    .sr-no-wrap {
      position: absolute;
      right: 0;
      font-size: 14px;
      font-weight: bold;
      display: flex;
      align-items: baseline;
      gap: 4px;
    }
    .sr-no-val {
      font-size: 18px;
      font-weight: 900;
      font-family: Georgia, serif;
      letter-spacing: 1px;
    }
    
    /* Transaction box */
    .txn-box {
      border: 1.5px solid #000;
      border-radius: 12px;
      padding: 8px 14px;
      margin-bottom: 12px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 13px;
    }
    .txn-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .txn-col-state { width: 32%; }
    .txn-col-dist { width: 32%; }
    .txn-col-date { width: 32%; text-align: right; }
    
    .field-label {
      font-weight: bold;
      color: #000;
    }
    .field-val-dotted {
      border-bottom: 1px dotted #000;
      font-weight: 600;
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
      margin-left: 6px;
    }
    
    /* Inward Details rows with full-width dotted writing lines */
    .details-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 10px;
    }
    .details-table tr {
      height: 29px;
    }
    .details-table td {
      vertical-align: middle;
      padding: 2px 0;
    }
    .dotted-line-container {
      display: flex;
      align-items: flex-end;
      width: 100%;
    }
    .dotted-line-fill {
      flex: 1;
      border-bottom: 1.5px dotted #000 !important;
      font-weight: 700;
      font-size: 13px;
      line-height: 1.3;
      padding: 0 4px;
      min-height: 18px;
      color: #000;
      word-break: break-word;
    }
    
    /* Note Box */
    .note-box {
      border: 1.5px solid #000;
      border-radius: 8px;
      padding: 8px 10px;
      font-size: 10px;
      line-height: 1.35;
      text-align: justify;
      margin-top: 8px;
      margin-bottom: 24px;
    }
    .note-box b {
      font-size: 10.5px;
    }
    
    /* Footer Signatures */
    .footer-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 15px;
    }
    .footer-table td {
      vertical-align: bottom;
      text-align: center;
      padding: 0 10px;
    }
    .sig-label {
      font-weight: bold;
      font-size: 13px;
      margin-bottom: 30px;
    }
    .sig-line {
      border-bottom: 1.5px solid #000;
      width: 150px;
      margin: 0 auto 4px auto;
    }
    .id-proof-wrap {
      font-weight: bold;
      font-size: 13px;
      display: flex;
      justify-content: center;
      align-items: baseline;
      gap: 4px;
    }
  </style>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.9.3/html2pdf.bundle.min.js"></script>
</head>
<body>

  <div class="toolbar">
    <button class="btn" onclick="window.print()">
      🖨️ Print Report
    </button>
    <button class="btn btn-secondary" onclick="downloadAsPDF()">
      📥 Download PDF
    </button>
  </div>

  <div class="sheet" id="report-sheet">
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
          <div class="wh-address">${escapeHtml(warehouseAddressLine)}</div>
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

    <div class="header-divider"></div>

    <!-- Title Bar -->
    <div class="title-row">
      <div class="pill-title">:: Daily Truck Transaction Report ::</div>
      <div class="sr-no-wrap">
        <span>Sr. No.:</span>
        <span class="sr-no-val">${escapeHtml(srNo)}</span>
      </div>
    </div>

    <!-- Transaction Details Box -->
    <div class="txn-box">
      <div class="txn-row">
        <div class="txn-col-state">
          <span class="field-label">State:</span>
          <span class="field-val-dotted">&nbsp;${escapeHtml(stateVal)}&nbsp;</span>
        </div>
        <div class="txn-col-dist">
          <span class="field-label">Dist.:</span>
          <span class="field-val-dotted">&nbsp;${escapeHtml(distVal)}&nbsp;</span>
        </div>
        <div class="txn-col-date">
          <span class="field-label">Date :</span>
          <span class="field-val-dotted">&nbsp;${escapeHtml(dateVal)}&nbsp;</span>
        </div>
      </div>
      <div class="txn-row">
        <div style="flex: 1;">
          <span class="field-label">W/h. Name:</span>
          <span class="field-val-dotted">&nbsp;${escapeHtml(warehouseName)}&nbsp;</span>
        </div>
        <div style="width: 140px; text-align: right;">
          <span class="field-label">Deposit :</span>
          <span class="checkbox-box">${isWithdrawal ? '' : '✓'}</span>
        </div>
      </div>
      <div class="txn-row">
        <div style="flex: 1;">
          <span class="field-label">Location :</span>
          <span class="field-val-dotted">&nbsp;${escapeHtml(locationVal)}&nbsp;</span>
        </div>
        <div style="width: 140px; text-align: right;">
          <span class="field-label">Withdrawl :</span>
          <span class="checkbox-box">${isWithdrawal ? '✓' : ''}</span>
        </div>
      </div>
    </div>

    <!-- Inward Details Lines -->
    <table class="details-table">
      <tr>
        <td colspan="2">
          <div class="dotted-line-container">
            <span class="field-label">Client Name:&nbsp;</span>
            <div class="dotted-line-fill">${escapeHtml(clientNameVal)}</div>
          </div>
        </td>
      </tr>
      <tr>
        <td colspan="2">
          <div class="dotted-line-container">
            <span class="field-label">Agent Name:&nbsp;</span>
            <div class="dotted-line-fill">${escapeHtml(agentNameVal)}</div>
          </div>
        </td>
      </tr>
      <tr>
        <td colspan="2">
          <div class="dotted-line-container">
            <span class="field-label">Authority Person:&nbsp;</span>
            <div class="dotted-line-fill">${escapeHtml(authorityPersonVal)}</div>
          </div>
        </td>
      </tr>
      <tr>
        <td colspan="2">
          <div class="dotted-line-container">
            <span class="field-label">Address/Mo. No.:&nbsp;</span>
            <div class="dotted-line-fill">${escapeHtml(addressMobileVal)}</div>
          </div>
        </td>
      </tr>
      <tr>
        <td style="width: 55%; padding-right: 10px;">
          <div class="dotted-line-container">
            <span class="field-label">Commodity Name:&nbsp;</span>
            <div class="dotted-line-fill">${escapeHtml(commodityNameVal)}</div>
          </div>
        </td>
        <td style="width: 45%;">
          <div class="dotted-line-container">
            <span class="field-label">Veriety:&nbsp;</span>
            <div class="dotted-line-fill">${escapeHtml(varietyVal)}</div>
          </div>
        </td>
      </tr>
      <tr>
        <td style="width: 55%; padding-right: 10px;">
          <div class="dotted-line-container">
            <span class="field-label">Total Bags:&nbsp;</span>
            <div class="dotted-line-fill">${escapeHtml(totalBagsVal)}</div>
          </div>
        </td>
        <td style="width: 45%;">
          <div class="dotted-line-container">
            <span class="field-label">Total Net Wt.:&nbsp;</span>
            <div class="dotted-line-fill">${escapeHtml(netWeightVal)}</div>
          </div>
        </td>
      </tr>
      <tr>
        <td colspan="2">
          <div class="dotted-line-container">
            <span class="field-label">Gate Pass No.:&nbsp;</span>
            <div class="dotted-line-fill">${escapeHtml(gatePassNoVal)}</div>
          </div>
        </td>
      </tr>
      <tr>
        <td style="width: 55%; padding-right: 10px;">
          <div class="dotted-line-container">
            <span class="field-label">Packaging Material:&nbsp;</span>
            <span style="font-size: 12px; font-weight: bold; color: #000; margin-right: 4px; white-space: nowrap;">PP Bag / Jute Bag:</span>
            <div class="dotted-line-fill">${escapeHtml(packagingMaterialVal)}</div>
          </div>
        </td>
        <td style="width: 45%;">
          <div class="dotted-line-container">
            <span class="field-label">Packaging Size:&nbsp;</span>
            <div class="dotted-line-fill">${escapeHtml(packagingSizeVal)}</div>
          </div>
        </td>
      </tr>
      <tr>
        <td colspan="2">
          <div class="dotted-line-container">
            <span class="field-label">GSL No.:&nbsp;</span>
            <div class="dotted-line-fill">${escapeHtml(gslNoVal)}</div>
          </div>
        </td>
      </tr>
      <tr>
        <td colspan="2">
          <div class="dotted-line-container">
            <span class="field-label">W/B Name/Address:&nbsp;</span>
            <div class="dotted-line-fill">${escapeHtml(wbNameAddressVal)}</div>
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

    <!-- Standard Declaration Note -->
    <div class="note-box">
      <b>Note :</b> No delivery will be until client signature is given. If client is unable to be present, he/she must provide written consent by him/herself or authorised agent stating his/her request for the commodity to be out loaded from the specific warehouse and delivery request letter to be also provided. The goods will be delivered to the person, carrying the relevant original Warehouse Receipts/Storage Receipt, which is to be submitted to WSP warehouse along with the commodity acceptance document (CAD) and Delivery Order (DO issued by WSP Head office. WSP is not liable for any dispute arising out of commodities dispatched and WSP will not be a party for any such disputes, however, the depositor would at, all times indemnify and keep WSP indemnified for all losses incurred by WSP to such loss.
    </div>

    <!-- Footer Signatures -->
    <table class="footer-table">
      <tr>
        <td style="width: 32%;">
          <div class="sig-label">Signature</div>
          <div class="sig-line"></div>
          <div style="font-size: 11px; font-weight: bold; color: #444;">Warehouse Incharge</div>
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
          <div style="font-size: 11px; font-weight: bold; color: #444;">Client / Depositor</div>
        </td>
      </tr>
    </table>
  </div>

  <script>
    function downloadAsPDF() {
      const element = document.getElementById('report-sheet');
      const opt = {
        margin: [6, 10, 6, 10],
        filename: 'Daily_Truck_Transaction_Report_${escapeHtml(srNo)}.pdf',
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

