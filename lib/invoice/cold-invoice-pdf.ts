import { format } from 'date-fns';
import { toGujaratiDigits } from '@/lib/utils/cold-numbers';

export function generateColdInvoiceHTML(
  invoice: any,
  client: any,
  warehouse: any,
  userDetails?: { companyLogo?: string; phoneNumber?: string; companyName?: string; address?: string },
  lang: string = 'en'
): string {
  const isGu = lang === 'gu';
  const fNum = (num: number | string) => isGu ? toGujaratiDigits(num) : String(num);
  const fDate = (d: string | Date) => fNum(format(new Date(d), 'dd/MM/yyyy'));

  const invoiceNo = invoice.invoiceId || 'CIN-XXXXXX';
  const fromDate = fDate(invoice.fromDate);
  const toDate = fDate(invoice.toDate);
  const generatedDate = fDate(invoice.generatedAt || new Date());
  
  const clientName = client?.name || (isGu ? 'લાગુ પડતું નથી' : 'N.A.');
  const clientMobile = fNum(client?.mobile || '');
  const warehouseName = warehouse?.name || userDetails?.companyName || (isGu ? 'કોલ્ડ સ્ટોરેજ' : 'Cold Storage Co.');
  
  const logoHtml = userDetails?.companyLogo 
    ? `<img src="${userDetails.companyLogo}" style="max-height: 80px; object-fit: contain;" alt="Logo" />`
    : `<div style="font-size: 32px; font-weight: bold; color: #0b4b8a;">S<span style="color: #d63333;">C</span>S</div>`;

  const itemsHtml = invoice.items.map((item: any, index: number) => {
    return `
      <tr>
        <td>${fNum(index + 1)}</td>
        <td>${item.commodityName}</td>
        <td>${fNum(item.totalBags || 0)}</td>
        <td>${fNum(item.outwardKg.toFixed(2))}</td>
        <td>${item.outwardDate ? fDate(item.outwardDate) : '-'}</td>
        <td style="text-align: right; font-weight: bold;">₹${fNum(item.subtotal.toFixed(2))}</td>
      </tr>
    `;
  }).join('');

  const additionalChargesHtml = invoice.additionalCharges && invoice.additionalCharges.length > 0 
    ? `
      <div style="margin-bottom: 30px;">
        <h3 style="color: #0b4b8a; font-size: 16px; margin: 0 0 10px 0; border-bottom: 2px solid #cbd5e1; padding-bottom: 5px;">${isGu ? 'વધારાનો ચાર્જ' : 'Additional Charges'}</h3>
        <table style="width: 50%; margin-left: auto;">
          <tbody>
            ${invoice.additionalCharges.map((charge: any) => `
              <tr>
                <td style="font-weight: 600;">${charge.name}</td>
                <td style="text-align: right; font-weight: bold;">₹${fNum(charge.amount.toFixed(2))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `
    : '';

  return `
<!DOCTYPE html>
<html lang="${isGu ? 'gu' : 'en'}">
<head>
  <meta charset="UTF-8">
  <title>Cold Storage Invoice - ${invoiceNo}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Mukta+Vaani:wght@400;600;700&display=swap');
    body {
      font-family: 'Mukta Vaani', sans-serif;
      margin: 0; padding: 20px;
      color: #333; background: #fff;
    }
    .container { max-width: 800px; margin: 0 auto; border: 1px solid #ddd; padding: 30px; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0b4b8a; padding-bottom: 20px; margin-bottom: 20px; }
    .header-left { display: flex; gap: 15px; align-items: center; }
    .header-right { text-align: right; }
    .title { color: #d63333; font-size: 24px; font-weight: bold; margin: 0; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
    .info-box { background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; }
    .info-box h3 { margin: 0 0 10px 0; color: #0b4b8a; font-size: 16px; border-bottom: 1px solid #cbd5e1; padding-bottom: 5px; }
    .row { display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 14px; }
    .label { font-weight: 600; color: #64748b; }
    
    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; font-size: 13px; }
    th { background-color: #0b4b8a; color: white; font-weight: 600; }
    tr:nth-child(even) { background-color: #f1f5f9; }
    
    .total-box { display: flex; justify-content: flex-end; }
    .total-content { background: #e0f2fe; padding: 15px 30px; border-radius: 8px; border: 1px solid #7dd3fc; }
    .total-row { display: flex; justify-content: space-between; gap: 40px; font-size: 18px; font-weight: bold; color: #0369a1; }
    
    .footer-sigs { display: flex; justify-content: space-between; margin-top: 60px; padding: 0 20px; }
    .sig-line { width: 200px; border-top: 1px solid #64748b; text-align: center; padding-top: 5px; font-weight: 600; font-size: 14px; color: #334155; }
    
    .footer { margin-top: 30px; text-align: center; color: #64748b; font-size: 12px; border-top: 1px solid #e2e8f0; padding-top: 20px; }
    
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .container { border: none; padding: 0; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-left">
        ${logoHtml}
        <div>
          <h1 class="title">${warehouseName}</h1>
          <div style="color: #64748b; font-size: 14px;">${userDetails?.address || (isGu ? 'કોલ્ડ સ્ટોરેજ વિભાગ' : 'Cold Storage Division')}</div>
        </div>
      </div>
      <div class="header-right">
        <h2 style="margin: 0; color: #0b4b8a;">${isGu ? 'ઇનવોઇસ' : 'INVOICE'}</h2>
        <div style="font-weight: bold; font-size: 16px;">#${invoiceNo}</div>
        <div style="font-size: 13px; color: #64748b; margin-top: 5px;">${isGu ? 'તારીખ' : 'Date'}: ${generatedDate}</div>
      </div>
    </div>
    
    <div class="info-grid">
      <div class="info-box">
        <h3>${isGu ? 'ગ્રાહક ની વિગત' : 'Client Details'}</h3>
        <div class="row"><span class="label">${isGu ? 'નામ' : 'Name'}:</span> <span>${clientName}</span></div>
        <div class="row"><span class="label">${isGu ? 'મોબાઇલ' : 'Mobile'}:</span> <span>${clientMobile}</span></div>
      </div>
      <div class="info-box">
        <h3>${isGu ? 'બિલિંગ સમયગાળો' : 'Billing Period'}</h3>
        <div class="row"><span class="label">${isGu ? 'થી તારીખ' : 'From Date'}:</span> <span>${fromDate}</span></div>
        <div class="row"><span class="label">${isGu ? 'સુધી તારીખ' : 'To Date'}:</span> <span>${toDate}</span></div>
      </div>
    </div>
    
    <table>
      <thead>
        <tr>
          <th width="5%">${isGu ? 'ક્રમ' : 'No.'}</th>
          <th width="25%">${isGu ? 'માલ' : 'Commodity'}</th>
          <th width="15%">${isGu ? 'કુલ બેગ્સ' : 'Total Bags'}</th>
          <th width="15%">${isGu ? 'નેટ વજન' : 'Net Wgt'}<br/><small>(Kg)</small></th>
          <th width="20%">${isGu ? 'તારીખ' : 'Date'}</th>
          <th width="20%" style="text-align: right;">${isGu ? 'રકમ' : 'Amount'}</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>
    
    ${additionalChargesHtml}
    
    <div class="total-box">
      <div class="total-content">
        <div class="total-row">
          <span>${isGu ? 'કુલ રકમ' : 'Total Amount'}:</span>
          <span>₹${fNum((invoice.totalAmount || 0).toFixed(2))}</span>
        </div>
      </div>
    </div>
    
    <div class="footer-sigs">
      <div class="sig-line">${isGu ? 'ગ્રાહકની સહી' : 'Customer Signature'}</div>
      <div class="sig-line">${isGu ? 'અધિકૃત સહી' : 'Authorized Signatory'}</div>
    </div>
    
    <div class="footer">
      ${isGu ? 'આ કમ્પ્યુટર દ્વારા બનાવેલ ઇન્વોઇસ છે.' : 'This is a computer generated invoice.'}<br/>
      ${warehouseName}
    </div>
  </div>
  
  <script>
    window.onload = function() {
      setTimeout(() => window.print(), 500);
    };
  </script>
</body>
</html>
  `;
}
