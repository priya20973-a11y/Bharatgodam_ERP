import { format } from 'date-fns';
import QRCode from 'qrcode';

export async function generateDynamicStorageReceiptHTML(data: {
  inward: any;
  outwards: any[];
  pledge: any;
  insurances: any[];
  userDoc: any;
  baseUrl?: string;
}) {
  const { inward, outwards, pledge, insurances, userDoc, baseUrl = '' } = data;

  const warehouse = inward.warehouseId;
  const client = inward.clientId;
  const commodity = inward.commodityId;
  const assayer = inward.assayerId;

  // Format dates safely
  const safeFormat = (dateVal: any, formatStr: string) => {
    if (!dateVal) return '';
    const d = new Date(dateVal);
    if (Number.isNaN(d.getTime())) return '';
    return format(d, formatStr);
  };

  const receiptDate = safeFormat(inward.date || inward.inwardDate, 'dd/MM/yyyy');
  const expiryDate = safeFormat(inward.expiryDate || inward.outwardDate, 'dd/MM/yyyy');
  const assayingDate = safeFormat(inward.assayingDate, 'dd/MM/yyyy');
  const assayingExpiryDate = safeFormat(inward.assayingExpiryDate, 'dd/MM/yyyy');
  
  // Generate QR Code
  // Point the QR code directly to the QR scan page which natively redirects to the receipt endpoint
  const qrUrl = `${baseUrl}/qr/receipt/${inward._id}`;
  const qrCodeDataUrl = await QRCode.toDataURL(qrUrl, {
    width: 80,
    margin: 1,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  });

  // Calculate Market Value
  const totalMarketValue = (Number(inward.quantityMT) || 0) * (Number(inward.marketValuePerMT) || 0);

  // Escape HTML helper
  const escapeHtml = (str: string) => {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const notesText = (inward.notes || inward.note || '').trim();
  const notesDisplay = notesText ? escapeHtml(notesText) : '';

  // Assaying details
  let gradingRows = '';
  const isAssaying = Boolean(inward.isAssayingRequired);

  if (isAssaying) {
    const gradingStatus = (inward.gradingStatus || 'PENDING').toString().toUpperCase();

    // On the storage receipt, display approved parameters and values
    let grades = '—';
    if (gradingStatus === 'APPROVED') {
      const approvedList = (inward.approvedGradingResults && inward.approvedGradingResults.length > 0)
        ? inward.approvedGradingResults
        : (inward.gradingResults && inward.gradingResults.length > 0 ? inward.gradingResults : []);
      grades = approvedList.length > 0
        ? approvedList.map((g: any) => `${g.parameterName}: ${g.observedValue ?? '—'}`).join(', ')
        : '—';
    } else {
      grades = (inward.gradingResults && inward.gradingResults.length > 0)
        ? inward.gradingResults.map((g: any) => `${g.parameterName}: ${g.observedValue ?? '—'}`).join(', ')
        : '—';
    }

    // Determine the text for "Commodity Grade as per Assayer's Report" column
    let commodityGrade = "Commodity Grade as per Assayer's Report";
    if (gradingStatus === 'APPROVED') {
      commodityGrade = 'As per Assayer';
    } else if (gradingStatus === 'REJECTED') {
      commodityGrade = 'Not Approved';
    } else {
      commodityGrade = "Commodity Grade as per Assayer's Report";
    }

    gradingRows = `
      <tr>
        <td style="border: 1px solid #000; padding: 4px;">${assayer?.name || '—'}<br/>${assayer?.licenceNumber || assayer?.licenseNumber || ''}</td>
        <td style="border: 1px solid #000; padding: 4px;">${assayingDate || '—'}</td>
        <td style="border: 1px solid #000; padding: 4px;">${grades}</td>
        <td style="border: 1px solid #000; padding: 4px;">${commodityGrade}</td>
        <td style="border: 1px solid #000; padding: 4px;">${assayingExpiryDate || '—'}</td>
      </tr>
    `;
  } else {
    gradingRows = `
      <tr>
        <td style="border: 1px solid #000; padding: 4px;">—</td>
        <td style="border: 1px solid #000; padding: 4px;">—</td>
        <td style="border: 1px solid #000; padding: 4px;">—</td>
        <td style="border: 1px solid #000; padding: 4px;">—</td>
        <td style="border: 1px solid #000; padding: 4px;">—</td>
      </tr>
    `;
  }

  // Insurance details
  let insuranceRows = '';
  if (insurances && insurances.length > 0) {
    insuranceRows = insurances.map((ins: any) => `
      <tr>
        <td style="border: 1px solid #000; padding: 4px;">${ins.policyName || '—'}</td>
        <td style="border: 1px solid #000; padding: 4px;">${ins.policyNumber || '—'}</td>
        <td style="border: 1px solid #000; padding: 4px;">${ins.amount ? Number(ins.amount).toFixed(2) : '—'}</td>
        <td style="border: 1px solid #000; padding: 4px; text-align: center;">${safeFormat(ins.validityStart, 'dd-MM-yyyy')}</td>
        <td style="border: 1px solid #000; padding: 4px; text-align: center;">${safeFormat(ins.validityEnd, 'dd-MM-yyyy')}</td>
        <td style="border: 1px solid #000; padding: 4px;">${ins.companyName || '—'}</td>
      </tr>
    `).join('');
  } else {
    insuranceRows = `
      <tr>
        <td colspan="6" style="border: 1px solid #000; padding: 4px; text-align: center;">No Insurance Details Available</td>
      </tr>
    `;
  }

  // Pledge details
  let pledgeRow = '';
  if (pledge) {
    pledgeRow = `
      <tr>
        <td style="border: 1px solid #000; padding: 4px;">${safeFormat(pledge.loanDate, 'dd-MM-yyyy') || '—'}</td>
        <td style="border: 1px solid #000; padding: 4px;">${pledge.lenderId?.name || pledge.lenderName || '—'}<br/>${pledge.lenderId?.address || pledge.lenderAddress || ''}</td>
        <td style="border: 1px solid #000; padding: 4px;">${pledge.pledgeNo || '—'}</td>
        <td style="border: 1px solid #000; padding: 4px;"></td>
      </tr>
    `;
  } else {
    pledgeRow = `
      <tr>
        <td colspan="4" style="border: 1px solid #000; padding: 4px; text-align: center;">No Pledge Details Available</td>
      </tr>
    `;
  }

  // Withdrawal History
  let withdrawalRows = '';
  let balanceBags = inward.bagsCount || 0;
  let balanceWeight = inward.quantityMT || 0;
  
  // Combine outwards and pledge releases
  const combinedWithdrawals: any[] = [];
  
  if (outwards && outwards.length > 0) {
    outwards.forEach(o => {
      combinedWithdrawals.push({
        type: 'OUTWARD',
        date: o.date || o.createdAt,
        doNumber: o.doNumber || o.gatePass || '—',
        doDate: o.doDate || o.date,
        releasedBags: o.bagsCount || 0,
        releasedWeight: o.quantityMT || 0
      });
    });
  }
  
  if (pledge && pledge.releaseHistory && pledge.releaseHistory.length > 0) {
    pledge.releaseHistory.forEach((pr: any) => {
      // Find the specific item for this inward
      const item = pr.items?.find((i: any) => i.inwardId?.toString() === inward._id.toString());
      if (item) {
        combinedWithdrawals.push({
          type: 'PLEDGE_RELEASE',
          date: pr.releaseDate,
          doNumber: pr.receiptNo || '—',
          doDate: pr.releaseDate,
          releasedBags: item.releasedBags || 0,
          releasedWeight: item.releasedQuantity || item.currentReleasedMT || 0
        });
      }
    });
  }
  
  // Sort by date ascending
  combinedWithdrawals.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (combinedWithdrawals.length > 0) {
    withdrawalRows = combinedWithdrawals.map(w => {
      balanceBags -= w.releasedBags;
      balanceWeight -= w.releasedWeight;
      
      return `
        <tr>
          <td style="border: 1px solid #000; padding: 4px;">${safeFormat(w.date, 'dd-MM-yyyy') || '—'}</td>
          <td style="border: 1px solid #000; padding: 4px;">${w.doNumber}<br/>${safeFormat(w.doDate, 'dd-MM-yyyy')}</td>
          <td style="border: 1px solid #000; padding: 4px; text-align: right;">${w.releasedBags}</td>
          <td style="border: 1px solid #000; padding: 4px; text-align: right;">${Number(w.releasedWeight).toFixed(4)}</td>
          <td style="border: 1px solid #000; padding: 4px; text-align: right;">${balanceBags}</td>
          <td style="border: 1px solid #000; padding: 4px; text-align: right;">${Number(balanceWeight).toFixed(4)}</td>
          <td style="border: 1px solid #000; padding: 4px;"></td>
        </tr>
      `;
    }).join('');
  } else {
    withdrawalRows = `
      <tr>
        <td style="border: 1px solid #000; padding: 4px; text-align: center;">—</td>
        <td style="border: 1px solid #000; padding: 4px; text-align: center;">—</td>
        <td style="border: 1px solid #000; padding: 4px; text-align: center;">—</td>
        <td style="border: 1px solid #000; padding: 4px; text-align: center;">—</td>
        <td style="border: 1px solid #000; padding: 4px; text-align: center;">—</td>
        <td style="border: 1px solid #000; padding: 4px; text-align: center;">—</td>
        <td style="border: 1px solid #000; padding: 4px; text-align: center;">—</td>
      </tr>
    `;
  }

  // HTML Template
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Warehouse Receipt - ${inward.receiptNumber || 'N/A'}</title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    body { font-family: Arial, sans-serif; font-size: 11px; line-height: 1.3; color: #000; margin: 0; padding: 0; }
    .container { width: 100%; max-width: 800px; margin: 0 auto; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 10px; page-break-inside: avoid; }
    th, td { border: 1px solid #000; padding: 4px; text-align: left; vertical-align: top; }
    th { font-weight: bold; background-color: #f9f9f9; text-align: center; }
    .header-table { border: 2px solid #000; }
    .header-table td { border: none; padding: 2px; }
    .section-title { font-weight: bold; background-color: #f9f9f9; text-transform: uppercase; border: 1px solid #000; padding: 4px; }
    h1 { text-align: center; font-size: 16px; margin: 5px 0; text-transform: uppercase; font-weight: bold; }
    .stamp-box { width: 100px; height: 100px; border: 1px solid #ccc; border-radius: 50%; display: inline-block; text-align: center; line-height: 100px; color: #999; font-size: 10px; margin-top: 20px;}
  </style>
</head>
<body>
  <div class="container">
    <div style="border: 2px solid #000; padding: 5px; margin-bottom: 5px; display: flex; justify-content: space-between; align-items: center;">
      <div style="flex: 1;">
        <h1>WAREHOUSE RECEIPT</h1>
        <table style="border: none; margin-bottom: 0;">
          <tr>
            <td style="border: none; width: 25%;">Warehouse ID</td>
            <td style="border: none; width: 75%;">: ${warehouse?.warehouseId || '—'}</td>
          </tr>
          <tr>
            <td style="border: none;">Warehouse Name</td>
            <td style="border: none;">: ${warehouse?.name || '—'}</td>
          </tr>
          <tr>
            <td style="border: none;">Warehouse Location</td>
            <td style="border: none;">: ${warehouse?.location || '—'}</td>
          </tr>
          <tr>
            <td style="border: none;">Warehouse Address</td>
            <td style="border: none;">: ${warehouse?.address || '—'}</td>
          </tr>
        </table>
      </div>
      <div style="text-align: right; padding-right: 10px;">
        <div style="margin-bottom: 5px; text-align: center;">
           <span style="font-weight: bold; font-size: 13px;">WHR No. : ${inward.receiptNumber || '—'}</span><br/>
           <span style="font-size: 11px;">WHR Date : ${receiptDate}</span>
        </div>
        <img src="${qrCodeDataUrl}" alt="QR Code" style="width: 70px; height: 70px; display: block; margin: 0 auto;" />
      </div>
    </div>

    <table style="border: 2px solid #000;">
      <tr>
        <td style="width: 25%; border: 1px solid #000; border-right: none;">Name of Depositor</td>
        <td style="width: 75%; border: 1px solid #000; border-left: none;">: ${client?.name || '—'}</td>
      </tr>
      <tr>
        <td style="border: 1px solid #000; border-right: none;">Address of Depositor</td>
        <td style="border: 1px solid #000; border-left: none;">: ${client?.address || '—'}, ${client?.village || ''}</td>
      </tr>
    </table>

    <div class="section-title">COMMODITY DETAIL</div>
    <table style="border: 2px solid #000; border-top: none;">
      <tr>
        <th>Description of Commodity with Quality / Grade</th>
        <th>No. of Packages / Bag</th>
        <th>Net Quantity (in MT)</th>
        <th>Market Value at time of deposit (Per MT)</th>
        <th>Total Market Value at time of deposit</th>
        <th>Godown</th>
      </tr>
      <tr>
        <td style="text-align: center;">${commodity?.name || '—'}</td>
        <td style="text-align: center;">${inward.bagsCount || '—'}</td>
        <td style="text-align: center;">${inward.quantityMT ? Number(inward.quantityMT).toFixed(4) : '—'}</td>
        <td style="text-align: center;">${inward.marketValuePerMT ? Number(inward.marketValuePerMT).toFixed(2) : '—'}</td>
        <td style="text-align: center;">${totalMarketValue ? Number(totalMarketValue).toFixed(2) : '—'}</td>
        <td style="text-align: center;">${warehouse?.chamberName || '—'}</td>
      </tr>
    </table>

    <div style="border: 2px solid #000; padding: 4px; margin-bottom: 10px;">
      <b>Rate of storage charges excluding taxes:</b> ${commodity?.storageRate ? commodity.storageRate : '—'} Rs. / Per MT / Per Month
    </div>

    <table style="border: 2px solid #000;">
      <tr>
        <th style="width: 25%;">Name & License No. of Assayer</th>
        <th style="width: 15%;">Date</th>
        <th style="width: 30%;">Grade Parameter Values as per Assayer's Report</th>
        <th style="width: 15%;">Commodity Grade as per Assayer's Report</th>
        <th style="width: 15%;">Grade Valid Till</th>
      </tr>
      ${gradingRows}
    </table>

    <div style="border: 2px solid #000; padding: 4px; margin-bottom: 10px;">
      <b>Goods are accepted for storage from ${receiptDate} to ${expiryDate}</b>
    </div>

    <table style="border: 2px solid #000;">
      <tr>
        <th rowspan="2" style="width: 20%;">Name of Insurance Policy</th>
        <th rowspan="2" style="width: 20%;">Policy No.</th>
        <th rowspan="2" style="width: 15%;">Insured for the Amount of Rs.</th>
        <th colspan="2" style="width: 20%;">Period of Validity</th>
        <th rowspan="2" style="width: 25%;">Name of Insurance Company</th>
      </tr>
      <tr>
        <th>From</th>
        <th>To</th>
      </tr>
      ${insuranceRows}
    </table>

    <div style="border: 2px solid #000; padding: 4px; margin-bottom: 10px;">
      The receipt is valid up to ${expiryDate}, being the date of expiry of the declared shelf life.
    </div>

    <table style="border: 2px solid #000; margin-bottom: 10px;">
      <tr>
        <td style="width: 15%; font-weight: bold; background-color: #f9f9f9; border-right: 1px solid #000; vertical-align: top; padding: 4px;">Notes</td>
        <td style="width: 85%; padding: 4px; vertical-align: top; min-height: 20px; white-space: pre-wrap;">${notesDisplay}</td>
      </tr>
    </table>

    <table style="border: 2px solid #000;">
      <tr>
        <td style="width: 25%;">Market Rate of Commodity as Declared by Depositor (Rs. / MT)</td>
        <td style="width: 25%; font-weight: bold;">${inward.marketValuePerMT ? Number(inward.marketValuePerMT).toFixed(2) : '—'}</td>
        <td style="width: 50%; border: none; text-align: right; vertical-align: bottom;">
          <br/><br/><br/>
          Sign. & Stamp of Warehouse Manager
        </td>
      </tr>
    </table>

    <div class="section-title">PLEDGE DETAIL</div>
    <table style="border: 2px solid #000; border-top: none;">
      <tr>
        <th style="width: 15%;">Date of Pledge</th>
        <th style="width: 40%;">Name & Address of Lender</th>
        <th style="width: 20%;">Pledge No.</th>
        <th style="width: 25%;">Signature & Stamp of Warehouse Manager</th>
      </tr>
      ${pledgeRow}
    </table>

    <div class="section-title">WITHDRAWAL HISTORY</div>
    <table style="border: 2px solid #000; border-top: none;">
      <tr>
        <th rowspan="2" style="width: 12%;">Pledge Released Date</th>
        <th rowspan="2" style="width: 18%;">Bank DO No. & Date</th>
        <th colspan="2">Quantity Released</th>
        <th colspan="2">Quantity Balance</th>
        <th rowspan="2" style="width: 20%;">Signature & Stamp of Warehouse Manager</th>
      </tr>
      <tr>
        <th style="width: 12%;">Bags / Packages</th>
        <th style="width: 13%;">Weight (MT)</th>
        <th style="width: 12%;">Bags / Packages</th>
        <th style="width: 13%;">Weight (MT)</th>
      </tr>
      ${withdrawalRows}
    </table>
  </div>
  <script>
    window.onload = function() { window.print(); }
  </script>
</body>
</html>
  `;
}
