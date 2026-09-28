const fs = require('fs');
const file = 'lib/invoice/cold-transfer-receipt.ts';
let content = fs.readFileSync(file, 'utf8');

const regex = /return `[\s\S]*?<!DOCTYPE html>[\s\S]*?<title>Ownership Transfer Receipt<\/title>[\s\S]*?<\/head>\s*<body>\s*<div class="print-banner hide-on-print">[\s\S]*?<\/div>([\s\S]*?)<\/body>\s*<\/html>`;/;
// I'll just rewrite the whole file, it's easier.

const newFileContent = `import { toGujaratiDigits } from '@/lib/utils/cold-numbers';
import { format } from 'date-fns';
import { en } from '@/lib/i18n/cold/en';
import { gu } from '@/lib/i18n/cold/gu';
import { getDynamicUnitLabel } from '@/lib/utils';

export function generateColdTransferReceiptHTML(
  data: any | any[],
  userDetails?: { companyLogo: string, phoneNumber: string },
  lang: string = 'en',
  qrDataUrl?: string
): string {
  const l = (lang === 'gu' ? gu.receipt : en.receipt) as any;
  const formatNum = (num: number | string) => lang === 'gu' ? toGujaratiDigits(num) : String(num);

  const items = Array.isArray(data) ? data : [data];

  const pagesHtml = items.map((item, index) => {
    // Convert dates and numbers safely
    const dateStr = item.date ? format(new Date(item.date), 'dd/MM/yyyy') : '';
    const dateFormatted = formatNum(dateStr);

    let receiptNoStr = '';
    if (item.originalInwardId && item.originalInwardId.receiptNumber) {
      receiptNoStr = item.originalInwardId.receiptNumber.toString();
    } else if (item.receiptNo) {
      receiptNoStr = item.receiptNo.toString();
    } else {
      receiptNoStr = '-';
    }
    const receiptNoFormatted = formatNum(receiptNoStr);

    const fromClientName = item.fromClientId?.name || '';
    let toClientName = item.toClientId?.name || '';
    if (item.transferType === 'Purchase') {
      toClientName = item.warehouseId?.name || item.toClientId?.name || (lang === 'gu' ? 'ગોડાઉન' : 'Warehouse');
    }
    const clientVillage = item.fromClientId?.address || item.fromClientId?.village || '';
    
    const commodityNameBase = item.commodityId?.name || '';
    const commodityType = item.commodityId?.type || '';
    
    let commodityDisplay = commodityNameBase;
    if (commodityType) {
      commodityDisplay += \` (\${commodityType})\`;
    }

    const tableLabel = item.tableLabel || '';
    const seed = item.seed || '';

    const bags = formatNum(item.bagsCount || 0);
    const jin = formatNum(item.jin || 0);
    const mixed = formatNum(item.mixed || 0);
    const totalBags = formatNum(item.bagsCount || 0);
    
    const farmerName = item.farmerName ? (item.farmerId ? \`\${item.farmerName} - \${item.farmerId}\` : item.farmerName) : '';
    const marko = item.marko || '';
    const truckNo = item.truckNo || '';
    const remarks = item.remarks || '';
    const wbSlip = formatNum(item.weighbridgeSlipNo || '');

    const unitStr = item.unit || item.commodityId?.unit || 'KG';
    const grossWeight = formatNum(item.grossWeight || 0) + ' KG';
    const emptyWeight = formatNum(item.emptyWeight || 0) + ' KG';
    const netWeight = formatNum(item.quantityKg || 0) + ' ' + unitStr;
    const outwardWeightDisplay = formatNum(item.outwardWeight || item.quantityKg || 0) + ' ' + unitStr;
    const remainingWeightDisplay = item.remainingWeight !== undefined ? formatNum(item.remainingWeight) + ' ' + unitStr : '-';
    const referencePerson = item.referencePersons && item.referencePersons.length > 0 ? item.referencePersons[0].name : '-';

    const warehouseName = item.warehouseId?.name || (lang === 'gu' ? 'સ્વાગત કોલ્ડ સ્ટોરેજ' : 'Swagat Cold Storage');
    const warehouseAddress = item.warehouseId?.address || (lang === 'gu' ? 'મુ.ખેંટવા, ડીસા-ભીલડી હાઇવે, તા.ડીસા-૩૮૫૫૩૫, જિ.બનાસકાંઠા' : 'Deesa-Bhildi Highway, Deesa - 385535, Banaskantha');
    const mobile = userDetails?.phoneNumber ? formatNum(userDetails.phoneNumber) : '96240 39195';
    const logoUrl = userDetails?.companyLogo || '';

    const title = lang === 'gu' ? 'માલિકી બદલી પાવતી' : 'OWNERSHIP TRANSFER RECEIPT';
    const transferTypeBadge = item.transferType === 'Purchase' ? (lang === 'gu' ? ' (ખરીદી)' : ' (PURCHASE)') : '';
    const fullTitle = title + transferTypeBadge;
    
    const stackInfoData = item.stackAllocations || [];
    
    return \`
    <div class="receipt-container" style="\${index > 0 ? 'page-break-before: always; margin-top: 20px;' : ''}">
      <div class="header-top">
        <div>Mo.\${mobile}</div>
      </div>
      
      <div class="header-main">
        <div class="logo-area">
          \${logoUrl
        ? \`<img src="\${logoUrl}" style="max-width: 100%; max-height: 100%; object-fit: contain;" alt="Logo" />\`
        : \`\`}
        </div>
        <div class="title-area">
          <div class="main-title">\${warehouseName}</div>
          <div class="sub-title">\${warehouseAddress}</div>
        </div>
        \${qrDataUrl ? \`
        <div class="qr-area" style="width: 80px; text-align: right; padding-right: 10px;">
          <img src="\${qrDataUrl}" style="max-width: 70px; max-height: 70px;" alt="QR Code" />
        </div>\` : ''}
      </div>
      
      <div class="badge-container">
        <div class="badge">\${fullTitle}</div>
      </div>
      
      \${item.transferType === 'Purchase' ? \`
      <div style="text-align: center; color: #d63333; font-weight: bold; font-size: 14px; margin-bottom: 10px;">
        \${lang === 'gu' ? 'ટ્રાન્સફર પ્રકાર:' : 'Transfer Type:'} PURCHASE
      </div>
      \` : ''}
      
      <div class="receipt-info">
        <div>\${l.receiptNo} \${receiptNoFormatted}</div>
        <div>\${l.date} \${dateFormatted}</div>
      </div>
      
      <div class="form-row">
        <div class="form-label">\${lang === 'gu' ? 'લેનાર શ્રી,' : 'New Owner:'}</div>
        <div class="form-value">\${toClientName}</div>
      </div>
      
      <div class="form-row">
        <div class="form-label">\${lang === 'gu' ? 'આપનાર શ્રી,' : 'Previous Owner:'}</div>
        <div class="form-value" style="flex: 2;">\${fromClientName}</div>
        <div class="form-label">\${l.addressLabel}</div>
        <div class="form-value">\${clientVillage}</div>
      </div>
      \${farmerName ? \`
      <div class="form-row">
        <div class="form-label">\${l.farmerNameLabel || (lang === 'gu' ? 'ખેડૂતનું નામ:' : 'Farmer Name:')}</div>
        <div class="form-value">\${farmerName}</div>
      </div>\` : \`
      <div class="form-row">
        <div class="form-label">\${l.farmerNameLabel || (lang === 'gu' ? 'ખેડૂતનું નામ:' : 'Farmer Name:')}</div>
        <div class="form-value">-</div>
      </div>\`}
      
      <div class="form-row">
        <div class="form-label">\${lang === 'gu' ? 'સંદર્ભ વ્યક્તિ:' : 'Reference Person:'}</div>
        <div class="form-value">\${referencePerson}</div>
        <div class="form-label">\${lang === 'gu' ? 'બહાર કાઢેલ વજન:' : 'Outward Weight:'}</div>
        <div class="form-value">\${outwardWeightDisplay}</div>
        <div class="form-label">\${lang === 'gu' ? 'બાકી વજન:' : 'Remaining Weight:'}</div>
        <div class="form-value">\${remainingWeightDisplay}</div>
      </div>
      
      <div class="form-row">
        <div class="form-label">\${l.commodityVarietyLabel}</div>
        <div class="form-value">\${commodityDisplay}</div>
        <div class="form-label">\${l.tableLabel}</div>
        <div class="form-value">\${tableLabel}</div>
        <div class="form-label">\${l.seedLabel}</div>
        <div class="form-value">\${seed}</div>
      </div>
      
      <div class="form-row">
        <div class="form-label">\${getDynamicUnitLabel(unitStr, 'large')}</div>
        <div class="form-value">\${bags}</div>
        <div class="form-label">\${getDynamicUnitLabel(unitStr, 'small')}</div>
        <div class="form-value">\${jin}</div>
        <div class="form-label">\${getDynamicUnitLabel(unitStr, 'mixed')}</div>
        <div class="form-value">\${mixed}</div>
        <div class="form-label">\${getDynamicUnitLabel(unitStr, 'total')}</div>
        <div class="form-value">\${totalBags}</div>
      </div>
      
      <div class="grid-container">
        <div class="left-grid">
          <div class="form-row">
            <div class="form-label">\${l.markoLabel}</div>
            <div class="form-value">\${marko}</div>
          </div>
          <div class="form-row">
            <div class="form-label">\${lang === 'gu' ? 'લોટ નં:' : 'Lot No:'}</div>
            <div class="form-value">\${item.originalInwardId?.lotNo || item.lotNo || '-'}</div>
          </div>
          <div class="form-row">
            <div class="form-label">\${l.tractorTruckNoLabel}</div>
            <div class="form-value">\${truckNo}</div>
          </div>
          <div class="form-row">
            <div class="form-label">\${l.remarkLabel}</div>
            <div class="form-value">\${remarks}</div>
          </div>
          <div class="form-row">
            <div class="form-label">\${l.weighbridgeSlipNoLabel}</div>
            <div class="form-value">\${wbSlip}</div>
          </div>
          
          <table class="data-table stack-table" style="margin-top: 15px;">
            <tr>
              <th>\${l.chamberNoLabel}</th>
              <th>\${l.floorNoLabel}</th>
              <th>\${l.stackNoLabel}</th>
              <th>\${l.netWeightLabel}</th>
            </tr>
            \${stackInfoData && stackInfoData.length > 0 ? 
              stackInfoData.map((s: any) => \`
              <tr>
                <td>\${formatNum(s.chamberName || s.chamberNo)}</td>
                <td>\${formatNum(s.floorNo)}</td>
                <td>\${formatNum(s.stackNo)}</td>
                <td>\${formatNum(s.allocatedWeight)} \${unitStr}</td>
              </tr>
              \`).join('')
            : \`
              <tr>
                <td></td>
                <td></td>
                <td></td>
                <td>\${netWeight}</td>
              </tr>
            \`}
          </table>
        </div>
        
        <div class="right-grid">
          <div class="weight-box">
            <div class="weight-row">
              <div class="weight-label">\${l.grossWeightLabel}</div>
              <div class="weight-value">\${grossWeight}</div>
            </div>
            <div class="weight-row">
              <div class="weight-label">\${l.emptyWeightLabel}</div>
              <div class="weight-value">\${emptyWeight}</div>
            </div>
            <div class="weight-row">
              <div class="weight-label">\${lang === 'gu' ? 'કાંટા ભરતી:' : 'Kata Bharati:'}</div>
              <div class="weight-value">\${formatNum('0')} KG</div>
            </div>
            <div class="weight-row total">
              <div class="weight-label">\${l.netWeightLabel}</div>
              <div class="weight-value">\${netWeight}</div>
            </div>
          </div>
        </div>
      </div>
      
      <div style="margin-top: 30px; display: flex; justify-content: space-between;">
        <div style="font-size: 13px; font-weight: bold; color: #333;">
          \${lang === 'gu' ? 'આપનારની સહી' : "Sender's Signature"} <span class="signature-line"></span>
        </div>
        <div style="font-size: 13px; font-weight: bold; color: #333;">
          \${lang === 'gu' ? 'લેનારની સહી' : "Receiver's Signature"} <span class="signature-line"></span>
        </div>
        <div style="font-size: 13px; font-weight: bold; color: #333;">
          \${lang === 'gu' ? 'ઓથોરાઈઝ્ડ સહી' : 'Authorized Signatory'} <span class="signature-line"></span>
        </div>
      </div>
    </div>\`;
  }).join('\\n');

  return \`
<!DOCTYPE html>
<html lang="gu">
<head>
  <meta charset="UTF-8">
  <title>Ownership Transfer Receipt</title>
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
    
    .data-table td, .data-table th {
      border: 1px solid #8b5a2b;
      padding: 6px;
      font-size: 13px;
      font-weight: 600;
    }
    
    .data-table th {
      background-color: #f8f9fa;
      color: #0b4b8a;
    }
    
    .weight-box {
      border: 1px solid #8b5a2b;
      padding: 5px;
    }
    
    .weight-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 5px;
      font-size: 13px;
      color: #0b4b8a;
      font-weight: bold;
    }
    
    .weight-row.total {
      border-top: 1px solid #8b5a2b;
      padding-top: 5px;
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
  \${pagesHtml}
</body>
</html>\`;
}
`;
fs.writeFileSync(file, newFileContent);
console.log("Patched cold-transfer-receipt.ts");
