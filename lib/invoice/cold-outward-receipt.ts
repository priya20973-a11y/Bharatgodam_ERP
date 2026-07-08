import { toGujaratiDigits } from '@/lib/utils/cold-numbers';
import { format } from 'date-fns';
import { en } from '@/lib/i18n/cold/en';
import { gu } from '@/lib/i18n/cold/gu';

export function generateColdOutwardReceiptHTML(
  batchData: any | any[],
  userDetails?: { companyLogo: string, phoneNumber: string },
  lang: string = 'en'
): string {
  const formatNum = (num: number | string) => lang === 'gu' ? toGujaratiDigits(num) : String(num);

  const outwards = Array.isArray(batchData) ? batchData : [batchData];
  const firstData = outwards[0] || {};

  const dateStr = firstData.date ? format(new Date(firstData.date), 'dd-MM-yyyy') : '';
  const dateFormatted = formatNum(dateStr);

  const receiptNo = firstData.batchId 
    ? firstData.batchId.slice(-4).toUpperCase() 
    : (firstData.receiptNo ? firstData.receiptNo.toString() : (firstData._id ? firstData._id.toString().slice(-4).toUpperCase() : ''));
  const receiptNoFormatted = formatNum(receiptNo);

  const clientName = firstData.clientId?.name || '';
  const clientVillage = firstData.clientId?.address || firstData.clientId?.village || '';

  const commodityNameBase = firstData.commodityId?.name || '';
  const commodityType = firstData.commodityId?.type || '';
  let commodityDisplay = commodityNameBase;
  if (commodityType) {
    commodityDisplay += ` (${commodityType})`;
  }

  // Sum Quantities
  const rawBags = outwards.reduce((acc, curr) => acc + (curr.bagsCount || 0), 0);
  const rawJin = outwards.reduce((acc, curr) => acc + (curr.jin || 0), 0);
  const rawMixed = outwards.reduce((acc, curr) => acc + (curr.mixed || 0), 0);
  const rawPlusMinus = outwards.reduce((acc, curr) => acc + (curr.plusMinus || 0), 0);
  const rawTotalBags = outwards.reduce((acc, curr) => acc + (curr.totalBags || 0), 0);
  const rawNetWeight = outwards.reduce((acc, curr) => acc + (curr.quantityKg || 0), 0);
  const rawRentRs = outwards.reduce((acc, curr) => acc + (curr.rentRs || 0), 0);

  const bags = formatNum(rawBags);
  const jin = formatNum(rawJin);
  const mixed = formatNum(rawMixed);
  
  let plusMinusStr = '';
  if (rawPlusMinus > 0) {
    plusMinusStr = '+' + formatNum(rawPlusMinus);
  } else if (rawPlusMinus < 0) {
    plusMinusStr = '-' + formatNum(Math.abs(rawPlusMinus));
  } else {
    plusMinusStr = formatNum(0);
  }

  const totalBags = formatNum(rawTotalBags);
  const netWeight = formatNum(rawNetWeight.toFixed(2));
  const rentRsDisplay = rawRentRs > 0 ? formatNum(rawRentRs.toFixed(2)) : '';

  const truckNo = formatNum(firstData.truckNo || '');
  const remarks = firstData.remarks || '';
  const note = firstData.note || '';

  const warehouseName = firstData.warehouseId?.name || (lang === 'gu' ? 'સ્વાગત કોલ્ડ સ્ટોરેજ' : 'Swagat Cold Storage');
  const warehouseAddress = firstData.warehouseId?.address || (lang === 'gu' ? 'મુ.ખેંટવા, ડીસા-ભીલડી હાઇવે, તા.ડીસા, જિ.બનાસકાંઠા' : 'Deesa-Bhildi Highway, Deesa, Banaskantha');
  const mobile = userDetails?.phoneNumber ? formatNum(userDetails.phoneNumber) : '96240 39195';


  // Custom strings based on language to match the image exactly
  const t = {
    jurisdiction: lang === 'gu' ? 'Subject To DEESA Jurisdiction' : 'Subject To DEESA Jurisdiction',
    shree1: lang === 'gu' ? '॥ શ્રી ૧ ॥' : '|| Shree 1 ||',
    shreeGanesh: lang === 'gu' ? '॥ શ્રી ગણેશાય નમઃ ॥' : '|| Shree Ganeshay Namah ||',
    mo: 'Mo.',
    titleBox: lang === 'gu' ? 'ગેટ પાસ' : 'GATE PASS',
    receiptNoLabel: lang === 'gu' ? 'પાવતી નં.' : 'Receipt No.',
    dateLabel: lang === 'gu' ? 'તા.' : 'Date',
    nameShree: lang === 'gu' ? 'નામશ્રી,' : 'Name,',
    addressLabel: lang === 'gu' ? 'સરનામું' : 'Address',
    detailsHeader: lang === 'gu' ? 'બહાર કાઢેલ માલની વિગત' : 'Details of Outward Goods',
    bagsHeader: lang === 'gu' ? 'થોરી (કટ્ટા)' : 'Bags (Sacks)',
    weightHeader: lang === 'gu' ? 'વજન (નેટ)' : 'Weight (Net)',
    totalLabel: lang === 'gu' ? 'કુલ' : 'Total',
    truckNoLabel: lang === 'gu' ? 'ગાડી નં.' : 'Vehicle No.',
    remarkLabel: lang === 'gu' ? 'રીમાર્ક' : 'Remark',
    rentLabel: lang === 'gu' ? 'ભાડુ રૂા.' : 'Rent Rs.',
    noteLabel: lang === 'gu' ? 'નોંધ :' : 'Note :',
    qtyLarge: lang === 'gu' ? '(૧) સારા' : '(1) Good/Large',
    qtySmall: lang === 'gu' ? '(૨) જીણ' : '(2) Small',
    qtyMixed: lang === 'gu' ? '(૩) છોલાટ' : '(3) Mixed',
    qtyPlusMinus: lang === 'gu' ? '(૪) વધ/ઘટ' : '(4) Plus/Minus',
    qtyTotal: lang === 'gu' ? '(૫) કુલ...' : '(5) Total...',
    qtyOther: lang === 'gu' ? '(૬) અન્ય વિગત' : '(6) Other Details',
    managerSign: lang === 'gu' ? 'મેનેજર' : 'Manager',
    receiverSign: lang === 'gu' ? 'લેનારની સહી' : 'Receiver Sign'
  };

  return `
<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <title>Cold Storage Outward Receipt</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Mukta+Vaani:wght@400;600;700&display=swap');
    
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: 'Mukta Vaani', sans-serif; 
      background-color: #fff; 
      color: #9e2a2b; /* Maroon/Dark Red color matching the image */
      font-weight: 600;
    }
    
    @page { size: A4; margin: 0; }
    
    @media print {
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        margin: 0;
        padding: 0;
      }
      .hide-on-print { display: none !important; }
      .receipt-container {
        margin: 0 auto !important;
        width: 210mm !important;
        height: 100vh !important;
        max-height: 297mm !important; /* A4 max height */
        page-break-inside: avoid;
        padding: 10px 20px !important;
      }
      .divider { margin-top: 3px !important; margin-bottom: 5px !important; }
      .receipt-line { margin-bottom: 4px !important; }
      .qty-line { margin-bottom: 4px !important; }
      .header-main { margin-top: 2px !important; margin-bottom: 2px !important; }
      .info-boxes { margin-top: 5px !important; }
      .grid-container { margin-top: 5px !important; }
      .signatures { padding-top: 10px !important; }
    }
    
    .receipt-container { 
      width: 210mm; 
      min-height: 148mm;
      margin: 20px auto; 
      padding: 15px 25px; 
      background-color: #ffffff;
      border: 2px solid #7b1e28;
      display: flex;
      flex-direction: column;
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
      font-size: 11px;
      font-weight: bold;
      color: #7b1e28;
    }

    
    .header-main {
      display: flex;
      align-items: center;
      margin-top: 5px;
      margin-bottom: 5px;
    }
    
    .logo-area {
      font-size: 55px;
      font-weight: bold;
      color: #7b1e28;
      width: 15%;
      text-align: center;
      line-height: 0.9;
      position: relative;
      font-family: serif;
    }
    .logo-area img {
      max-width: 100%;
      max-height: 60px;
      object-fit: contain;
    }
    .logo-area span { 
      position: absolute; 
      left: 35px; 
      top: 15px; 
      font-size: 45px; 
    }
    
    .title-area {
      flex: 1;
      text-align: center;
    }
    
    .main-title-box {
      border: 3px solid #7b1e28;
      padding: 2px;
      display: inline-block;
      width: 100%;
    }
    
    .main-title {
      background-color: #7b1e28;
      color: #fff;
      font-size: 32px;
      font-weight: 700;
      padding: 2px 10px;
      width: 100%;
      text-align: center;
      letter-spacing: 1px;
    }
    
    .sub-title {
      color: #7b1e28;
      font-size: 14px;
      font-weight: bold;
      margin-top: 5px;
    }

    .info-boxes {
      display: flex;
      justify-content: space-between;
      margin-top: 10px;
      font-size: 18px;
    }

    .info-box {
      border: 2px solid #7b1e28;
      padding: 2px 10px;
      font-weight: bold;
      min-width: 150px;
    }
    .info-box-center {
      font-size: 20px;
      font-weight: bold;
      margin-top: -5px;
    }

    .divider {
      border-bottom: 2px solid #7b1e28;
      margin-top: 5px;
      margin-bottom: 10px;
    }
    
    .form-row {
      display: flex;
      align-items: flex-end;
      margin-bottom: 10px;
      font-size: 16px;
    }
    
    .form-label {
      white-space: nowrap;
      margin-right: 5px;
    }
    
    .form-value {
      flex: 1;
      border-bottom: 1px solid #7b1e28;
      color: #333;
      padding: 0 5px;
      min-width: 50px;
    }
    
    .grid-container {
      display: flex;
      justify-content: space-between;
      margin-top: 10px;
      font-size: 16px;
    }
    
    .left-grid {
      width: 48%;
    }
    
    .right-grid {
      width: 48%;
    }

    .col-header {
      display: flex;
      justify-content: space-between;
      font-weight: bold;
      margin-bottom: 10px;
    }

    .receipt-line {
      display: flex;
      align-items: flex-end;
      margin-bottom: 8px;
    }
    .receipt-line .label {
      min-width: 85px;
      white-space: nowrap;
    }
    .receipt-line .value {
      flex: 1;
      border-bottom: 1px solid #7b1e28;
      margin: 0 10px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .receipt-line .value-small {
      flex: 0.5;
      border-bottom: 1px solid #7b1e28;
      margin: 0 10px;
      white-space: nowrap;
    }

    .qty-line {
      display: flex;
      align-items: flex-end;
      margin-bottom: 8px;
    }
    .qty-line .label {
      min-width: 115px;
      white-space: nowrap;
    }
    .qty-line .value {
      flex: 1;
      border-bottom: 1px solid #7b1e28;
      text-align: center;
      color: #333;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .qty-line .unit {
      width: 30px;
      text-align: right;
      white-space: nowrap;
    }

    .signatures {
      margin-top: auto;
      padding-top: 15px;
      display: flex;
      justify-content: space-between;
      font-size: 16px;
      font-weight: bold;
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
      <div>${t.mo}${mobile}</div>
    </div>
    
    <div class="header-main">
      <div class="logo-area">
        ${userDetails?.companyLogo ? `<img src="${userDetails.companyLogo}" alt="Logo" />` : `S<span>C</span>S`}
      </div>
      <div class="title-area">
        <div class="main-title-box">
          <div class="main-title">${warehouseName}</div>
        </div>
        <div class="sub-title">${warehouseAddress}</div>
        
        <div class="info-boxes">
          <div class="info-box">${t.receiptNoLabel} &nbsp;&nbsp;&nbsp; <span style="color:#333;">${receiptNoFormatted}</span></div>
          <div class="info-box-center">${t.titleBox}</div>
          <div class="info-box">${t.dateLabel} &nbsp;&nbsp;&nbsp; <span style="color:#333;">${dateFormatted}</span></div>
        </div>
      </div>
    </div>
    
    <div class="divider"></div>
    
    <div class="form-row">
      <div class="form-label">${t.nameShree}</div>
      <div class="form-value">${clientName}</div>
      <div class="form-label">${t.addressLabel}</div>
      <div class="form-value" style="flex: 0.5;">${clientVillage}</div>
    </div>
    
    <div class="col-header">
      <div style="width: 48%; display: flex; justify-content: space-between;">
        <span style="width: 50%;">${t.detailsHeader}</span>
        <span style="width: 25%; text-align: center;">${t.bagsHeader}</span>
        <span style="width: 25%; text-align: center;">${t.weightHeader}</span>
      </div>
      <div style="width: 48%;"></div>
    </div>

    <div class="grid-container">
      <div class="left-grid">
        ${outwards.map(o => `
        <div class="receipt-line">
          <div class="label">${t.receiptNoLabel}</div>
          <div class="value">${o.inwardId ? (o.inwardId.receiptNo ? o.inwardId.receiptNo.toString() : o.inwardId._id.toString().slice(-4).toUpperCase()) : (o.weighbridgeSlipNo || '')}</div>
          <div class="value-small text-center">${formatNum(o.totalBags || 0)}</div>
          <div class="value-small text-center">${formatNum((o.quantityKg || 0).toFixed(2))}</div>
        </div>
        `).join('')}
        ${Array.from({length: Math.max(0, 4 - outwards.length)}).map(() => `
        <div class="receipt-line">
          <div class="label">${t.receiptNoLabel}</div>
          <div class="value"></div>
          <div class="value-small"></div>
          <div class="value-small"></div>
        </div>
        `).join('')}
        <div class="receipt-line">
          <div class="label">${t.totalLabel}</div>
          <div class="value" style="border-bottom: none;"></div>
          <div class="value-small" style="text-align:center; color:#333;">${totalBags}</div>
          <div class="value-small" style="text-align:center; color:#333;">${netWeight}</div>
        </div>
        <div class="receipt-line">
          <div class="label">${t.truckNoLabel}</div>
          <div class="value" style="color:#333;">${truckNo}</div>
        </div>
        <div class="receipt-line">
          <div class="label">${t.remarkLabel}</div>
          <div class="value" style="color:#333;">${remarks}</div>
        </div>
        <div class="receipt-line">
          <div class="label">${t.rentLabel}</div>
          <div class="value" style="color:#333;">${rentRsDisplay}</div>
        </div>
        <div class="receipt-line" style="align-items: flex-start;">
          <div class="label" style="padding-top: 2px;">${t.noteLabel}</div>
          <div class="value" style="color:#333; white-space: normal; overflow: visible; word-wrap: break-word; line-height: 1.4;">${note}</div>
        </div>
      </div>
      
      <div class="right-grid">
        <div class="qty-line">
          <div class="label">${t.qtyLarge}</div>
          <div class="value">${bags}</div>
          <div class="unit">Kg.</div>
        </div>
        <div class="qty-line">
          <div class="label">${t.qtySmall}</div>
          <div class="value">${jin}</div>
          <div class="unit">Kg.</div>
        </div>
        <div class="qty-line">
          <div class="label">${t.qtyMixed}</div>
          <div class="value">${mixed}</div>
          <div class="unit">Kg.</div>
        </div>
        <div class="qty-line">
          <div class="label">${t.qtyPlusMinus}</div>
          <div class="value">${plusMinusStr}</div>
          <div class="unit">Kg.</div>
        </div>
        <div class="qty-line">
          <div class="label">${t.qtyTotal}</div>
          <div class="value">${totalBags}</div>
          <div class="unit">Kg.</div>
        </div>
        <div class="qty-line">
          <div class="label">${t.qtyOther}</div>
          <div class="value">${commodityDisplay}</div>
          <div class="unit"></div>
        </div>
      </div>
    </div>

    <div class="signatures">
      <div>${t.receiverSign}</div>
      <div>${t.managerSign}</div>
    </div>
  </div>
</body>
</html>
  `;
}
