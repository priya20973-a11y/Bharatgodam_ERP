import { format } from 'date-fns';

export function generateColdStackReceiptHTML(
  data: any,
  warehouseName: string,
  warehouseAddress: string,
  userDetails?: { companyLogo: string, phoneNumber: string }
): string {
  const dateFormatted = format(new Date(), 'dd/MM/yyyy HH:mm');

  // We find receiptNo from transactions if it's missing in activeStocks
  const activeStocks = data.activeStocks?.map((stock: any) => {
    if (!stock.receiptNo && data.transactions) {
      const txn = data.transactions.find((t: any) => t.id === stock.id && t.type === 'INWARD');
      if (txn) stock.receiptNo = txn.receiptNo;
    }
    return stock;
  }) || [];

  const fillRate = data.capacity > 0 ? Math.round((data.usedCapacity / data.capacity) * 100) : 0;
  const status = data.status || 'Unknown';
  let statusColor = '#334155'; // default slate
  if (status === 'Empty') statusColor = '#475569';
  if (status === 'Partial') statusColor = '#d97706';
  if (status === 'Full') statusColor = '#dc2626';

  let stocksHTML = '';
  if (activeStocks.length > 0) {
    stocksHTML = activeStocks.map((stock: any, index: number) => `
      <tr>
        <td style="text-align: center;">${index + 1}</td>
        <td>${stock.receiptNo || '-'}</td>
        <td>${stock.date ? format(new Date(stock.date), 'dd/MM/yyyy') : '-'}</td>
        <td style="font-weight: 600;">${stock.client}</td>
        <td>${stock.referencePersons || '-'}</td>
        <td>${stock.commodity || '-'}</td>
        <td style="text-align: right; font-weight: 600; color: #1d4ed8;">${Number(stock.quantity).toLocaleString()}</td>
        <td style="text-align: right;">${stock.largeBags}</td>
        <td style="text-align: right;">${stock.smallBags}</td>
        <td style="text-align: right;">${stock.mixedBags}</td>
        <td style="text-align: right; font-weight: 600;">${stock.totalBags}</td>
        <td style="text-align: center;">${status}</td>
      </tr>
    `).join('');
  } else {
    stocksHTML = `
      <tr>
        <td colspan="12" style="text-align: center; padding: 30px; color: #64748b; font-style: italic;">
          No active stocks found for this stack.
        </td>
      </tr>
    `;
  }

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Stack Details - Chamber ${data.chamberNo} | Floor ${data.floorNo} | Stack ${data.stackNo}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: 'Inter', sans-serif; 
      background-color: #fff; 
      color: #1e293b; 
      font-size: 14px;
    }
    
    @page { 
      size: A3 landscape; 
      margin: 15mm; 
    }
    
    @media print {
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .hide-on-print { display: none !important; }
    }
    
    .container {
      width: 100%;
      margin: 0 auto;
    }
    
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 20px;
      margin-bottom: 25px;
    }
    
    .company-details h1 {
      font-size: 28px;
      color: #0f172a;
      margin-bottom: 5px;
      font-weight: 700;
    }
    
    .company-details p {
      color: #475569;
      font-size: 14px;
      line-height: 1.5;
    }
    
    .report-title {
      text-align: right;
    }
    
    .report-title h2 {
      font-size: 24px;
      color: #1e40af;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 5px;
    }
    
    .report-title p {
      color: #64748b;
      font-size: 14px;
    }
    
    .summary-grid {
      display: flex;
      justify-content: space-between;
      background-color: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 30px;
    }
    
    .summary-box {
      flex: 1;
      border-right: 1px solid #e2e8f0;
      padding: 0 15px;
    }
    
    .summary-box:last-child {
      border-right: none;
    }
    
    .summary-label {
      font-size: 12px;
      text-transform: uppercase;
      color: #64748b;
      font-weight: 600;
      margin-bottom: 5px;
      letter-spacing: 0.5px;
    }
    
    .summary-val {
      font-size: 22px;
      font-weight: 700;
      color: #0f172a;
    }
    
    .val-capacity { color: #0f172a; }
    .val-used { color: #b45309; }
    .val-avail { color: #15803d; }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
    }
    
    th, td {
      border: 1px solid #cbd5e1;
      padding: 12px 10px;
      text-align: left;
    }
    
    th {
      background-color: #f1f5f9;
      color: #334155;
      font-weight: 600;
      font-size: 13px;
      text-transform: uppercase;
    }
    
    td {
      font-size: 14px;
      color: #1e293b;
    }
    
    tr:nth-child(even) {
      background-color: #f8fafc;
    }
    
    .footer {
      margin-top: 40px;
      border-top: 1px solid #e2e8f0;
      padding-top: 15px;
      display: flex;
      justify-content: space-between;
      color: #64748b;
      font-size: 12px;
    }
  </style>
</head>
<body onload="window.print()">
  <div class="container">
    <div class="header">
      <div class="company-details">
        <h1>${warehouseName}</h1>
        <p>${warehouseAddress}</p>
        <p>Phone: ${userDetails?.phoneNumber || '-'}</p>
      </div>
      <div class="report-title">
        <h2>Stack Report</h2>
        <p>Generated: ${dateFormatted}</p>
      </div>
    </div>
    
    <div class="summary-grid">
      <div class="summary-box">
        <div class="summary-label">Chamber</div>
        <div class="summary-val">${data.chamberNo}</div>
      </div>
      <div class="summary-box">
        <div class="summary-label">Floor</div>
        <div class="summary-val">${data.floorNo}</div>
      </div>
      <div class="summary-box">
        <div class="summary-label">Stack No.</div>
        <div class="summary-val">${data.stackNo}</div>
      </div>
      <div class="summary-box">
        <div class="summary-label">Status</div>
        <div class="summary-val" style="color: ${statusColor}">${status}</div>
      </div>
      <div class="summary-box">
        <div class="summary-label">Total Capacity</div>
        <div class="summary-val val-capacity">${Number(data.capacity).toLocaleString()} Kg</div>
      </div>
      <div class="summary-box">
        <div class="summary-label">Occupied</div>
        <div class="summary-val val-used">${Number(data.usedCapacity).toLocaleString()} Kg</div>
      </div>
      <div class="summary-box">
        <div class="summary-label">Available</div>
        <div class="summary-val val-avail">${Number(data.availableCapacity).toLocaleString()} Kg</div>
      </div>
      <div class="summary-box">
        <div class="summary-label">Fill Rate</div>
        <div class="summary-val">${fillRate}%</div>
      </div>
    </div>
    
    <h3 style="font-size: 18px; color: #0f172a; margin-bottom: 15px; font-weight: 600;">Active Stocks Details</h3>
    
    <table>
      <thead>
        <tr>
          <th style="width: 40px; text-align: center;">#</th>
          <th>Receipt No.</th>
          <th>Inward Date</th>
          <th>Client Name</th>
          <th>Reference Person</th>
          <th>Commodity</th>
          <th style="text-align: right;">Net Wt (Kg)</th>
          <th style="text-align: right; width: 60px;">L/B</th>
          <th style="text-align: right; width: 60px;">S/B</th>
          <th style="text-align: right; width: 60px;">M/B</th>
          <th style="text-align: right; width: 60px;">T/B</th>
          <th style="text-align: center;">Status</th>
        </tr>
      </thead>
      <tbody>
        ${stocksHTML}
      </tbody>
    </table>
    
    <div class="footer">
      <div>Cold Storage Management System</div>
      <div>Page 1 of 1</div>
    </div>
  </div>
</body>
</html>
  `;
}
