import { toGujaratiDigits } from '@/lib/utils/cold-numbers';
import { format } from 'date-fns';
import { en } from '@/lib/i18n/cold/en';
import { gu } from '@/lib/i18n/cold/gu';
import { getDynamicUnitLabel } from '@/lib/utils';

export function generateColdTransactionReceiptHTML(
  data: any,
  type: 'inward' | 'outward',
  userDetails?: { companyLogo: string, phoneNumber: string },
  lang: string = 'en',
  qrDataUrl?: string
): string {
  const l = (lang === 'gu' ? gu.receipt : en.receipt) as any;
  const formatNum = (num: number | string) => lang === 'gu' ? toGujaratiDigits(num) : String(num);

  // Convert dates and numbers safely
  const dateStr = data.date ? format(new Date(data.date), 'dd/MM/yyyy') : '';
  const dateFormatted = formatNum(dateStr);

  // Use generated receiptNumber if available, fallback to legacy receiptNo or empty
  const receiptNo = data.receiptNumber ? data.receiptNumber.toString() : (data.receiptNo ? data.receiptNo.toString() : '-');
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

  let actualLarge = data.bagsCount || 0;
  let actualTotal = data.totalBags || 0;
  
  // Check if we are facing the backend bug where bagsCount holds Total Bags (e.g. 8)
  // and totalBags was mistakenly saved as bagsCount + jin + mixed (e.g. 12).
  if (data.totalBags === (data.bagsCount || 0) + (data.jin || 0) + (data.mixed || 0) && data.totalBags > (data.bagsCount || 0) && ((data.jin || 0) > 0 || (data.mixed || 0) > 0)) {
    actualLarge = (data.bagsCount || 0) - (data.jin || 0) - (data.mixed || 0);
    actualTotal = data.bagsCount || 0;
  } else if (!data.totalBags) {
    actualTotal = actualLarge + (data.jin || 0) + (data.mixed || 0);
  }

  // Fallback to actually stored 'large' field if the user provided one, else use our logic.
  const bags = formatNum(data.large ?? data.largeBags ?? data.bagsLarge ?? actualLarge);
  const jin = formatNum(data.jin || 0);
  const mixed = formatNum(data.mixed || 0);
  const totalBags = formatNum(actualTotal);
  const farmerName = data.farmerName ? (data.farmerId ? `${data.farmerName} - ${data.farmerId}` : data.farmerName) : '';

  const marko = data.marko || '';
  const truckNo = data.truckNo || '';
  const remarks = data.remarks || '';
  const note = data.note || '';
  const wbSlip = formatNum(data.weighbridgeSlipNo || '');

  const chamber = formatNum(data.chamberName || data.chamberNo || '');
  const floor = formatNum(data.floorNo || '');
  const stack = formatNum(data.stackNo || '');

  const unitStr = data.unit || data.commodityId?.unit || 'KG';
  const grossWeight = formatNum(data.grossWeight || 0) + ' KG';
  const emptyWeight = formatNum((Number(data.emptyWeight) || 0).toFixed(2)) + ' KG';
  let calculatedSelfQty = Number(data.selfQuantityKg) || 0;
  let calculatedPurchaseQty = Number(data.purchaseQuantityKg) || 0;
  let calculatedStockType = data.stockType || 'Self';
  let actualNetWeight = Number(data.quantityKg) || 0;

  const stacksList = (data.stacksInfo && data.stacksInfo.length > 0)
    ? data.stacksInfo
    : (data.stackAllocations && data.stackAllocations.length > 0
      ? data.stackAllocations.map((a: any) => ({
          stockType: a.stockType || 'Self',
          chamberNo: a.chamberName || a.chamberNo,
          floorNo: a.floorNo,
          stackNo: a.stackNo,
          bagsCount: a.bagsCount || a.allocatedBags || 0,
          isStockShifting: a.isStockShifting,
          quantityKg: a.allocatedWeight || a.quantityKg
        }))
      : null);

  const stackCount = stacksList ? stacksList.length : 1;

  if (stacksList && stacksList.length > 0) {
    calculatedSelfQty = 0;
    calculatedPurchaseQty = 0;

    stacksList.forEach((s: any) => {
      const sType = s.stockType || 'Self';
      const sQty = Number(s.quantityKg) || 0;
      if (sType === 'Purchase') {
        calculatedPurchaseQty += sQty;
      } else {
        calculatedSelfQty += sQty;
      }
    });

    calculatedSelfQty = parseFloat(calculatedSelfQty.toFixed(3));
    calculatedPurchaseQty = parseFloat(calculatedPurchaseQty.toFixed(3));
    actualNetWeight = parseFloat((calculatedSelfQty + calculatedPurchaseQty).toFixed(3));

    if (calculatedSelfQty > 0 && calculatedPurchaseQty === 0) {
      calculatedStockType = 'Self';
    } else if (calculatedPurchaseQty > 0 && calculatedSelfQty === 0) {
      calculatedStockType = 'Purchase';
    } else if (calculatedSelfQty > 0 && calculatedPurchaseQty > 0) {
      calculatedStockType = 'Both';
    }
  } else {
    if (calculatedSelfQty > 0 && calculatedPurchaseQty === 0) {
      calculatedStockType = 'Self';
      actualNetWeight = calculatedSelfQty;
    } else if (calculatedPurchaseQty > 0 && calculatedSelfQty === 0) {
      calculatedStockType = 'Purchase';
      actualNetWeight = calculatedPurchaseQty;
    } else if (calculatedSelfQty > 0 && calculatedPurchaseQty > 0) {
      calculatedStockType = 'Both';
      actualNetWeight = parseFloat((calculatedSelfQty + calculatedPurchaseQty).toFixed(3));
    }
  }

  const netWeight = formatNum(actualNetWeight) + ' KG';
  const stockType = calculatedStockType;
  const selfQuantityKg = formatNum(calculatedSelfQty) + ' KG';
  const purchaseQuantityKg = formatNum(calculatedPurchaseQty) + ' KG';

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

  const isHighStack = stackCount >= 14;
  const isMedStack = stackCount >= 9 && stackCount < 14;
  const isLowMedStack = stackCount >= 5 && stackCount < 9;

  let cfg = {
    containerPadding: '12px',
    headerPadding: '5px',
    headerMarginBottom: '8px',
    titleFontSize: '24px',
    subTitleFontSize: '11px',
    logoWidth: '60px',
    qrWidth: '85px',
    badgeContainerMarginBottom: '8px',
    badgeFontSize: '15px',
    badgePadding: '2px 15px',
    receiptInfoMarginBottom: '10px',
    receiptInfoFontSize: '13px',
    formRowMarginBottom: '6px',
    formRowFontSize: '13px',
    tableMarginTop: '8px',
    tableMarginBottom: '6px',
    tableCellPadding: '4px',
    tableCellFontSize: '12px',
    stackTablePadding: '4px',
    stackTableFontSize: '12px',
    weightMarginBottom: '8px',
    weightMarginTop: '6px',
    weightFontSize: '13px',
    declarationMarginTop: '8px',
    declarationFontSize: '10px',
    signaturesMarginTop: '16px',
    signaturesFontSize: '13px',
    signatureLineWidth: '100px',
    duplicateScale: '0.92',
    rotateWrapperHeight: '138mm',
  };

  if (isHighStack) {
    cfg = {
      containerPadding: '8px 10px',
      headerPadding: '3px 4px',
      headerMarginBottom: '4px',
      titleFontSize: '18px',
      subTitleFontSize: '9px',
      logoWidth: '45px',
      qrWidth: '62px',
      badgeContainerMarginBottom: '3px',
      badgeFontSize: '12px',
      badgePadding: '1px 10px',
      receiptInfoMarginBottom: '4px',
      receiptInfoFontSize: '11px',
      formRowMarginBottom: '2.5px',
      formRowFontSize: '10.5px',
      tableMarginTop: '4px',
      tableMarginBottom: '3px',
      tableCellPadding: '1.5px 3px',
      tableCellFontSize: '9.5px',
      stackTablePadding: '1.5px 2px',
      stackTableFontSize: '9.5px',
      weightMarginBottom: '3px',
      weightMarginTop: '3px',
      weightFontSize: '10.5px',
      declarationMarginTop: '4px',
      declarationFontSize: '8.5px',
      signaturesMarginTop: '8px',
      signaturesFontSize: '10.5px',
      signatureLineWidth: '75px',
      duplicateScale: '0.80',
      rotateWrapperHeight: '142mm',
    };
  } else if (isMedStack) {
    cfg = {
      containerPadding: '10px',
      headerPadding: '4px',
      headerMarginBottom: '5px',
      titleFontSize: '20px',
      subTitleFontSize: '10px',
      logoWidth: '50px',
      qrWidth: '70px',
      badgeContainerMarginBottom: '4px',
      badgeFontSize: '13px',
      badgePadding: '1.5px 12px',
      receiptInfoMarginBottom: '6px',
      receiptInfoFontSize: '11.5px',
      formRowMarginBottom: '3.5px',
      formRowFontSize: '11.5px',
      tableMarginTop: '5px',
      tableMarginBottom: '4px',
      tableCellPadding: '2.5px 3px',
      tableCellFontSize: '10.5px',
      stackTablePadding: '2px 2px',
      stackTableFontSize: '10.5px',
      weightMarginBottom: '4px',
      weightMarginTop: '4px',
      weightFontSize: '11.5px',
      declarationMarginTop: '5px',
      declarationFontSize: '9px',
      signaturesMarginTop: '12px',
      signaturesFontSize: '11.5px',
      signatureLineWidth: '85px',
      duplicateScale: '0.86',
      rotateWrapperHeight: '140mm',
    };
  } else if (isLowMedStack) {
    cfg = {
      containerPadding: '10px 12px',
      headerPadding: '4px 5px',
      headerMarginBottom: '6px',
      titleFontSize: '22px',
      subTitleFontSize: '10.5px',
      logoWidth: '55px',
      qrWidth: '75px',
      badgeContainerMarginBottom: '6px',
      badgeFontSize: '14px',
      badgePadding: '2px 14px',
      receiptInfoMarginBottom: '8px',
      receiptInfoFontSize: '12px',
      formRowMarginBottom: '4.5px',
      formRowFontSize: '12px',
      tableMarginTop: '6px',
      tableMarginBottom: '5px',
      tableCellPadding: '3px 4px',
      tableCellFontSize: '11.5px',
      stackTablePadding: '3px 3px',
      stackTableFontSize: '11.5px',
      weightMarginBottom: '6px',
      weightMarginTop: '5px',
      weightFontSize: '12px',
      declarationMarginTop: '6px',
      declarationFontSize: '9.5px',
      signaturesMarginTop: '15px',
      signaturesFontSize: '12px',
      signatureLineWidth: '90px',
      duplicateScale: '0.89',
      rotateWrapperHeight: '138mm',
    };
  }

  return `
<!DOCTYPE html>
<html lang="${lang}">
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
    
    @page { 
      size: A4 portrait; 
      margin: 0; 
    }
    
    @media print {
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        margin: 0;
        padding: 0;
        background: #fff;
      }
      .hide-on-print { display: none !important; }
      
      html, body {
        width: 100%;
        height: auto;
        margin: 0;
        padding: 0;
        overflow: visible !important;
      }
      
      #receipt-wrapper {
        width: 100%;
        margin: 0 auto;
        page-break-inside: avoid;
        break-inside: avoid;
      }

      .receipt-container {
        page-break-inside: avoid;
        break-inside: avoid;
        overflow: visible !important;
        margin: 0 auto;
      }
    }
    
    .receipt-container { 
      width: 148mm; 
      min-height: 210mm;
      max-height: 285mm;
      margin: 0 auto; 
      padding: ${cfg.containerPadding}; 
      background-color: #ffffff;
      border: 1px solid #ccc;
      position: relative;
      box-sizing: border-box;
      overflow: visible;
    }
    
    body.duplicate-mode @page {
      size: A4 portrait;
      margin: 0;
    }

    @media print {
      body.duplicate-mode {
        margin: 0;
        padding: 0;
      }
    }
    
    body.duplicate-mode #receipt-wrapper {
      width: 210mm;
      height: 297mm;
      margin: 0 auto;
      padding: 0;
      background: white;
      box-sizing: border-box;
      
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 5mm;
      
      overflow: hidden;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    body.duplicate-mode .rotate-wrapper {
      position: relative;
      width: 195mm;
      height: ${cfg.rotateWrapperHeight};
      page-break-inside: avoid;
      break-inside: avoid;
    }
    
    body.duplicate-mode .receipt-container {
      width: 148mm !important;
      min-height: 210mm !important;
      max-height: 285mm !important;
      margin: 0 !important;
      
      position: absolute;
      top: 50%;
      left: 50%;
      transform-origin: center center;
      transform: translate(-50%, -50%) rotate(-90deg) scale(${cfg.duplicateScale}) !important;
      
      box-sizing: border-box;
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
      margin-bottom: 3px;
    }
    
    .header-main {
      display: flex;
      align-items: center;
      border: 2px solid #b89735;
      background: #fff;
      padding: ${cfg.headerPadding};
      margin-bottom: ${cfg.headerMarginBottom};
    }
    
    .logo-area {
      font-size: 24px;
      font-weight: bold;
      color: #0b4b8a;
      width: ${cfg.logoWidth};
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
      font-size: ${cfg.titleFontSize};
      font-weight: 700;
      padding: 1px 10px;
      display: inline-block;
      border-radius: 4px;
      margin-bottom: 2px;
      line-height: 1.2;
    }
    
    .sub-title {
      color: #0b4b8a;
      font-size: ${cfg.subTitleFontSize};
      font-weight: 600;
      line-height: 1.2;
    }
    
    .badge-container {
      text-align: center;
      margin-bottom: ${cfg.badgeContainerMarginBottom};
    }
    
    .badge {
      background-color: #557960;
      color: #fff;
      display: inline-block;
      padding: ${cfg.badgePadding};
      border-radius: 20px;
      font-size: ${cfg.badgeFontSize};
      font-weight: bold;
      line-height: 1.2;
    }
    
    .receipt-info {
      display: flex;
      justify-content: space-between;
      color: #d63333;
      font-weight: bold;
      font-size: ${cfg.receiptInfoFontSize};
      margin-bottom: ${cfg.receiptInfoMarginBottom};
    }
    
    .form-row {
      display: flex;
      align-items: flex-end;
      margin-bottom: ${cfg.formRowMarginBottom};
      font-size: ${cfg.formRowFontSize};
      font-weight: 600;
      color: #9e2a2b;
      line-height: 1.2;
    }
    
    .form-label {
      white-space: nowrap;
      margin-right: 5px;
    }
    
    .form-value {
      flex: 1;
      border-bottom: 1px solid #333;
      color: #333;
      padding: 0 4px;
      min-width: 40px;
    }
    
    .grid-container {
      display: flex;
      justify-content: space-between;
      margin-top: 4px;
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
      margin-bottom: ${cfg.tableMarginBottom};
      background-color: transparent;
    }
    
    .data-table td {
      border: 1px solid #8b5a2b;
      padding: ${cfg.tableCellPadding};
      font-size: ${cfg.tableCellFontSize};
      font-weight: 600;
      line-height: 1.2;
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
      padding: ${cfg.stackTablePadding};
      font-size: ${cfg.stackTableFontSize};
      background: #fdfbf7;
      color: #9e2a2b;
      text-align: center;
      line-height: 1.15;
    }
    
    .stack-table td {
      text-align: center !important;
      color: #333 !important;
      width: auto !important;
      font-size: ${cfg.stackTableFontSize};
      padding: ${cfg.stackTablePadding};
      line-height: 1.15;
    }
    
    .signatures {
      display: flex;
      justify-content: space-between;
      margin-top: ${cfg.signaturesMarginTop};
      font-size: ${cfg.signaturesFontSize};
      color: #9e2a2b;
      font-weight: bold;
    }
    
    .signature-line {
      display: inline-block;
      width: ${cfg.signatureLineWidth};
      border-bottom: 1px solid #333;
      margin-left: 5px;
    }
  </style>
</head>
<body>
  <div class="print-banner hide-on-print">
    Press Ctrl+P (or ⌘+P on Mac) to print this receipt.
    <br/>
    <label style="cursor: pointer; margin-right: 20px; font-weight: bold; background: #fff; color: #333; padding: 2px 8px; border-radius: 4px;">
      <input type="checkbox" id="duplicateReceiptCb" onchange="toggleDuplicate()"> Duplicate Receipt (A4)
    </label>
    <button onclick="window.print()" style="margin-top:10px; padding: 5px 15px; cursor:pointer;">Print Now</button>
  </div>
  
  <div id="receipt-wrapper">
    <div class="rotate-wrapper" id="original-receipt-wrapper">
      <div class="receipt-container" id="original-receipt">
        <div class="header-top">
          <div>Mo.${mobile}</div>
        </div>
        
        <div class="header-main">
          <div class="logo-area">
            ${logoUrl
          ? `<img src="${logoUrl}" style="max-width: 100%; max-height: 100%; object-fit: contain;" alt="Logo" />`
          : ``}
          </div>
          <div class="title-area">
            <div class="main-title">${warehouseName}</div>
            <div class="sub-title">${warehouseAddress}</div>
          </div>
          ${qrDataUrl ? `<div style="width: ${cfg.qrWidth}; text-align: right;"><img src="${qrDataUrl}" style="max-width: 100%; height: auto; image-rendering: crisp-edges;" alt="QR Code" /></div>` : ''}
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
      ${data.cipc ? `
      <div class="form-label">CIPC</div>
      <div class="form-value">${data.cipc}</div>` : ''}
    </div>
    
    <div class="form-row">
      <div class="form-label">${getDynamicUnitLabel(unitStr, 'large')}</div>
      <div class="form-value">${bags}</div>
      <div class="form-label">${getDynamicUnitLabel(unitStr, 'small')}</div>
      <div class="form-value">${jin}</div>
      <div class="form-label">${getDynamicUnitLabel(unitStr, 'mixed')}</div>
      <div class="form-value">${mixed}</div>
      <div class="form-label">${getDynamicUnitLabel(unitStr, 'total')}</div>
      <div class="form-value">${totalBags}</div>
    </div>
    
    <div class="grid-container">
      <div class="left-grid">
        <div class="form-row">
          <div class="form-label">${l.markoLabel}</div>
          <div class="form-value">${marko}</div>
        </div>
        ${data.lotNo ? `
        <div class="form-row">
          <div class="form-label">Lot No.</div>
          <div class="form-value">${data.lotNo}</div>
        </div>` : ''}
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

        <table class="data-table" style="margin-top: ${cfg.tableMarginTop};">
          <tr>
            <td>Stock Type</td>
            <td>${stockType}</td>
          </tr>
          ${stockType === 'Both' || stockType === 'Purchase' ? `
          <tr>
            <td>Purchase Qty</td>
            <td>${purchaseQuantityKg}</td>
          </tr>
          ` : ''}
          ${stockType === 'Both' || stockType === 'Self' ? `
          <tr>
            <td>Self Qty</td>
            <td>${selfQuantityKg}</td>
          </tr>
          ` : ''}
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
        
        <div style="padding-left: 4px; margin-bottom: ${cfg.weightMarginBottom}; margin-top: ${cfg.weightMarginTop};">
          <span style="color: #9e2a2b; font-weight: bold; font-size: ${cfg.weightFontSize};">${getDynamicUnitLabel(unitStr, 'weight')}</span>
          <span style="font-weight: bold; font-size: ${cfg.weightFontSize}; margin-left: 8px;">${kataBharati}</span>
        </div>
      </div>
      
      <div class="right-grid">
        <table class="data-table stack-table">
          <tr>
            <th>Type</th>
            <th>${l.chamberNoLabel}</th>
            <th>${l.floorNoLabel}</th>
            <th>${l.stackNoLabel}</th>
            <th>${(l.noOfBags || 'No. of Bags').replace(':', '')}</th>
          </tr>
          ${stacksList && stacksList.length > 0 ? 
            stacksList.map((s: any) => `
            <tr>
              <td>${s.stockType || 'Self'}</td>
              <td>${formatNum(s.chamberNo)}</td>
              <td>${formatNum(s.floorNo)}</td>
              <td>${formatNum(s.stackNo)}${s.isStockShifting ? ' (Stock Shifting)' : ''}</td>
              <td>${formatNum(s.bagsCount || s.allocatedBags || 0)}</td>
            </tr>
            `).join('')
          : `
            <tr>
              <td>${stockType}</td>
              <td>${chamber}</td>
              <td>${floor}</td>
              <td>${stack}${data.isStockShifting ? ' (Stock Shifting)' : ''}</td>
              <td>${totalBags}</td>
            </tr>
          `}
        </table>
      </div>
    </div>

    <div style="margin-top: ${cfg.declarationMarginTop}; font-size: ${cfg.declarationFontSize}; font-weight: 600; text-align: center; color: #333; line-height: 1.25;">
      <div>${l.conditionsBox}</div>
      <div style="margin-top: 1.5px;">${note ? `<strong>${l.noteLabel}:</strong> ${note}` : `<strong>${l.noteGunnyBag}</strong>`}</div>
    </div>
    
    <div class="signatures">
      <div>${l.depositorSignature} <span class="signature-line"></span></div>
      <div style="margin-right:20px;">${l.managerSignature} <span class="signature-line"></span></div>
    </div>
    </div>
  </div>
  </div>
  
  <script>
    function toggleDuplicate() {
      const cb = document.getElementById('duplicateReceiptCb');
      const wrapper = document.getElementById('receipt-wrapper');
      const originalWrapper = document.getElementById('original-receipt-wrapper');
      const existingDuplicate = document.getElementById('duplicate-receipt-wrapper');
      
      if (cb.checked) {
        document.body.classList.add('duplicate-mode');
        if (!existingDuplicate) {
          const clone = originalWrapper.cloneNode(true);
          clone.id = 'duplicate-receipt-wrapper';
          wrapper.appendChild(clone);
        }
      } else {
        document.body.classList.remove('duplicate-mode');
        if (existingDuplicate) {
          existingDuplicate.remove();
        }
      }
    }
  </script>
</body>
</html>
  `;
}
