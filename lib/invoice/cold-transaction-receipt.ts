import { toGujaratiDigits } from '@/lib/utils/cold-numbers';
import { format } from 'date-fns';
import { en } from '@/lib/i18n/cold/en';
import { gu } from '@/lib/i18n/cold/gu';

export function generateColdTransactionReceiptHTML(
  data: any,
  type: 'inward' | 'outward',
  userDetails?: { companyLogo: string, phoneNumber: string },
  lang: string = 'en'
): string {
  const l = (lang === 'gu' ? gu.receipt : en.receipt) as any;
  const formatNum = (num: number | string) => lang === 'gu' ? toGujaratiDigits(num) : String(num);

  // Convert dates and numbers safely
  const dateStr = data.date ? format(new Date(data.date), 'dd/MM/yyyy') : '';
  const dateFormatted = formatNum(dateStr);

  // Use sequential inward number if available, else fallback to slice of ID
  const receiptNo = data.receiptNo ? data.receiptNo.toString() : data._id.toString().slice(-4).toUpperCase();
  const receiptNoFormatted = formatNum(receiptNo);

  const clientName = data.clientId?.name || '';
  const clientVillage = data.clientId?.address || data.clientId?.village || '';
  const commodityNameBase = data.commodityId?.name || '';
  const commodityType = data.commodityId?.type || '';
  
  let commodityDisplay = commodityNameBase;
  if (commodityType) {
    commodityDisplay += ` (${commodityType})`;
  }

  if (data.gradingType && !commodityDisplay.includes(data.gradingType)) {
    commodityDisplay += ` (${data.gradingType})`;
  }

  const tableLabel = data.tableLabel || '';
  const seed = data.seed || '';

  const bags = formatNum(data.bagsCount || 0);
  const jin = formatNum(data.jin || 0);
  const mixed = formatNum(data.mixed || 0);
  const totalBags = formatNum(data.totalBags || 0);
  const farmerName = data.farmerName || '';

  const marko = data.marko || '';
  const truckNo = formatNum(data.truckNo || '');
  const remarks = data.remarks || '';
  const note = data.note || '';
  const wbSlip = formatNum(data.weighbridgeSlipNo || '');

  const chamber = formatNum(data.chamberNo || '');
  const floor = formatNum(data.floorNo || '');
  const stack = formatNum(data.stackNo || '');

  const grossWeight = formatNum(data.grossWeight || 0);
  const emptyWeight = formatNum(data.emptyWeight || 0);
  const netWeight = formatNum(data.quantityKg || 0); // Net weight is stored as quantityKg

  // Format Kata Bharati safely
  let kataBharatiRaw = data.kataBharati || 0;
  if (!kataBharatiRaw && data.totalBags > 0 && data.quantityKg) {
    kataBharatiRaw = data.quantityKg / data.totalBags;
  }
  const kataBharatiStr = Number.isInteger(kataBharatiRaw) ? kataBharatiRaw.toString() : kataBharatiRaw.toFixed(3);
  const kataBharati = formatNum(kataBharatiStr);

  const warehouseName = data.warehouseId?.name || (lang === 'gu' ? 'સ્વાગત કોલ્ડ સ્ટોરેજ' : 'Swagat Cold Storage');
  const warehouseAddress = data.warehouseId?.address || (lang === 'gu' ? 'મુ.ખેંટવા, ડીસા-ભીલડી હાઇવે, તા.ડીસા-૩૮૫૫૩૫, જિ.બનાસકાંઠા' : 'Deesa-Bhildi Highway, Deesa - 385535, Banaskantha');
  const mobile = userDetails?.phoneNumber ? formatNum(userDetails.phoneNumber) : '96240 39195';
  const logoUrl = userDetails?.companyLogo || '';

  const title = type === 'inward'
    ? (lang === 'gu' ? 'ભાડા પાવતી' : 'RENT RECEIPT')
    : (lang === 'gu' ? 'જાવક પાવતી' : 'OUTWARD RECEIPT');

  return `
<!DOCTYPE html>
<html lang="gu">
<head>
  <meta charset="UTF-8">
  <title>Cold Storage Receipt</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Mukta+Vaani:wght@400;600;700&display=swap');
    
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: 'Mukta Vaani', sans-serif; 
      background-color: #fff; 
      color: #333; 
    }
    
    @page { size: A5; margin: 0; }
    
    @media print {
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .hide-on-print { display: none !important; }
    }
    
    .receipt-container { 
      width: 148mm; 
      min-height: 210mm;
      margin: 0 auto; 
      padding: 15px; 
      background-color: #ffffff;
      border: 1px solid #ccc;
      position: relative;
    }
    
    .print-banner {
      background-color: #333;
      color: #fff;
      text-align: center;
      padding: 10px;
      font-family: sans-serif;
      margin-bottom: 20px;
    }
    
    .header-top {
      display: flex;
      justify-content: flex-end;
      color: #0b4b8a;
      font-size: 11px;
      font-weight: 600;
      margin-bottom: 5px;
    }
    
    .header-main {
      display: flex;
      align-items: center;
      border: 2px solid #b89735;
      background: #fff;
      padding: 5px;
      margin-bottom: 15px;
    }
    
    .logo-area {
      font-size: 32px;
      font-weight: bold;
      color: #0b4b8a;
      width: 60px;
      text-align: center;
      line-height: 1;
      position: relative;
    }
    .logo-area span { color: #d63333; position: absolute; left: 25px; top: 10px; font-size: 36px; }
    
    .title-area {
      flex: 1;
      text-align: center;
    }
    
    .main-title {
      background-color: #d63333;
      color: #fff;
      font-size: 26px;
      font-weight: 700;
      padding: 2px 10px;
      display: inline-block;
      border-radius: 4px;
      margin-bottom: 4px;
    }
    
    .sub-title {
      color: #0b4b8a;
      font-size: 11px;
      font-weight: 600;
    }
    
    .badge-container {
      text-align: center;
      margin-bottom: 15px;
    }
    
    .badge {
      background-color: #557960;
      color: #fff;
      display: inline-block;
      padding: 4px 20px;
      border-radius: 20px;
      font-size: 16px;
      font-weight: bold;
    }
    
    .receipt-info {
      display: flex;
      justify-content: space-between;
      color: #d63333;
      font-weight: bold;
      font-size: 13px;
      margin-bottom: 20px;
    }
    
    .form-row {
      display: flex;
      align-items: flex-end;
      margin-bottom: 12px;
      font-size: 13px;
      font-weight: 600;
      color: #9e2a2b;
    }
    
    .form-label {
      white-space: nowrap;
      margin-right: 5px;
    }
    
    .form-value {
      flex: 1;
      border-bottom: 1px solid #333;
      color: #333;
      padding: 0 5px;
      min-width: 50px;
    }
    
    .grid-container {
      display: flex;
      justify-content: space-between;
      margin-top: 15px;
    }
    
    .left-grid {
      width: 48%;
    }
    
    .right-grid {
      width: 48%;
    }
    
    .data-table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #8b5a2b;
      margin-bottom: 10px;
      background-color: transparent;
    }
    
    .data-table td {
      border: 1px solid #8b5a2b;
      padding: 6px;
      font-size: 13px;
      font-weight: 600;
    }
    
    .data-table td:first-child {
      color: #9e2a2b;
      width: 50%;
    }
    
    .data-table td:last-child {
      text-align: center;
      color: #333;
    }
    
    .stack-table th {
      border: 1px solid #8b5a2b;
      padding: 6px;
      font-size: 13px;
      background: #fdfbf7;
      color: #9e2a2b;
      text-align: center;
    }
    
    .stack-table td {
      text-align: center !important;
      color: #333 !important;
      width: auto !important;
    }
    
    .footer-note {
      margin-top: 20px;
      font-size: 12px;
      font-weight: 600;
      text-align: center;
      line-height: 1.4;
    }
    
    .conditions-box {
      border: 1px solid #8b5a2b;
      border-radius: 10px;
      padding: 8px;
      text-align: center;
      font-size: 12px;
      font-weight: 600;
      margin-top: 15px;
      background-color: rgba(255, 255, 255, 0.4);
    }
    
    .signatures {
      display: flex;
      justify-content: space-between;
      margin-top: 40px;
      font-size: 13px;
      color: #9e2a2b;
      font-weight: bold;
    }
    
    .signature-line {
      display: inline-block;
      width: 100px;
      border-bottom: 1px solid #333;
      margin-left: 5px;
    }
  </style>
</head>
<body>
  <div class="print-banner hide-on-print">
    Press Ctrl+P (or ⌘+P on Mac) to print this receipt.
    <br/>
    <button onclick="window.print()" style="margin-top:10px; padding: 5px 15px; cursor:pointer;">Print Now</button>
  </div>
  
  <div class="receipt-container">
    <div class="header-top">
      <div>Mo.${mobile}</div>
    </div>
    
    <div class="header-main">
      <div class="logo-area">
        ${logoUrl
      ? `<img src="${logoUrl}" style="max-width: 100%; max-height: 100%; object-fit: contain;" alt="Logo" />`
      : `S<span>C</span>S`}
      </div>
      <div class="title-area">
        <div class="main-title">${warehouseName}</div>
        <div class="sub-title">${warehouseAddress}</div>
      </div>
    </div>
    
    <div class="badge-container">
      <div class="badge">${title}</div>
    </div>
    
    <div class="receipt-info">
      <div>${l.receiptNo} ${receiptNoFormatted}</div>
      <div>${l.date} ${dateFormatted}</div>
    </div>
    
    <div class="form-row">
      <div class="form-label">${l.nameShree}</div>
      <div class="form-value">${clientName}</div>
    </div>
    
    <div class="form-row">
      <div class="form-label">${l.farmerNameLabel}</div>
      <div class="form-value" style="flex: 2;">${farmerName}</div>
      <div class="form-label">${l.addressLabel}</div>
      <div class="form-value">${clientVillage}</div>
    </div>
    
    <div class="form-row">
      <div class="form-label">${l.commodityVarietyLabel}</div>
      <div class="form-value">${commodityDisplay}</div>
      <div class="form-label">${l.tableLabel}</div>
      <div class="form-value">${tableLabel}</div>
      <div class="form-label">${l.seedLabel}</div>
      <div class="form-value">${seed}</div>
    </div>
    
    <div class="form-row">
      <div class="form-label">${l.qtyLargeLabel}</div>
      <div class="form-value">${bags}</div>
      <div class="form-label">${l.qtySmallLabel}</div>
      <div class="form-value">${jin}</div>
      <div class="form-label">${l.mixed || 'Mixed'}</div>
      <div class="form-value">${mixed}</div>
      <div class="form-label">${l.qtyTotalLabel}</div>
      <div class="form-value">${totalBags}</div>
    </div>
    
    <div class="grid-container">
      <div class="left-grid">
        <div class="form-row">
          <div class="form-label">${l.markoLabel}</div>
          <div class="form-value">${marko}</div>
        </div>
        <div class="form-row">
          <div class="form-label">${l.tractorTruckNoLabel}</div>
          <div class="form-value">${truckNo}</div>
        </div>
        <div class="form-row">
          <div class="form-label">${l.remarkLabel}</div>
          <div class="form-value">${remarks}</div>
        </div>
        <div class="form-row">
          <div class="form-label">${l.weighbridgeSlipNoLabel}</div>
          <div class="form-value">${wbSlip}</div>
        </div>
        
        <table class="data-table stack-table" style="margin-top: 15px;">
          <tr>
            <th>${l.chamberNoLabel}</th>
            <th>${l.floorNoLabel}</th>
            <th>${l.stackNoLabel}</th>
            <th>${l.netWeightLabel}</th>
          </tr>
          ${data.stacksInfo && data.stacksInfo.length > 0 ? 
            data.stacksInfo.map((s: any) => `
            <tr>
              <td>${formatNum(s.chamberNo)}</td>
              <td>${formatNum(s.floorNo)}</td>
              <td>${formatNum(s.stackNo)}</td>
              <td>${formatNum(s.quantityKg)}</td>
            </tr>
            `).join('')
          : `
            <tr>
              <td>${chamber}</td>
              <td>${floor}</td>
              <td>${stack}</td>
              <td>${netWeight}</td>
            </tr>
          `}
        </table>
      </div>
      
      <div class="right-grid">
        <table class="data-table">
          <tr>
            <td>${l.grossWeightLabel}</td>
            <td>${grossWeight}</td>
          </tr>
          <tr>
            <td>${l.emptyWeightLabel}</td>
            <td>${emptyWeight}</td>
          </tr>
          <tr>
            <td>${l.netWeightLabel}</td>
            <td>${netWeight}</td>
          </tr>
        </table>
        
        <div style="padding-left: 5px; margin-bottom: 10px;">
          <span style="color: #9e2a2b; font-weight: bold; font-size: 13px;">${l.kataBharatiLabel}</span>
          <span style="font-weight: bold; font-size: 13px; margin-left: 10px;">${kataBharati}</span>
        </div>
        
        <div style="font-size: 12px; font-weight: 600; line-height: 1.4;">
          ${note ? `<strong>${l.noteLabel}:</strong> ${note}` : `<strong>${l.noteGunnyBag}</strong>`}
        </div>
      </div>
    </div>
    
    <div class="conditions-box">
      ${l.conditionsBox}
    </div>
    
    <div class="signatures">
      <div>${l.depositorSignature} <span class="signature-line"></span></div>
      <div style="margin-right:20px;">${l.managerSignature} <span class="signature-line"></span></div>
    </div>
  </div>
</body>
</html>
  `;
}
