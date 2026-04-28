/**
 * Invoice HTML Generator
 * Generates professional HTML template for warehouse invoices
 */

import { InvoiceData } from './types';
import { formatCurrency, amountInWords, formatNumber } from './formatters';

/**
 * Generates complete HTML for invoice
 */
export function generateInvoiceHTML(data: InvoiceData): string {

  // Summary section logic
  const totalAmount = data.lineItems.reduce((sum, item) => sum + (item.amount || 0), 0);
  const lastInventory = data.lineItems.length > 0 ? data.lineItems[data.lineItems.length - 1].quantity : 0;
  // Get month name from invoice date (assume YYYY-MM-DD or similar)
  let monthName = '';
  if (data.metadata && data.metadata.invoiceDate) {
    const dateObj = new Date(data.metadata.invoiceDate);
    if (!isNaN(dateObj.getTime())) {
      monthName = dateObj.toLocaleString('default', { month: 'long', year: 'numeric' });
    }
  }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Invoice ${data.metadata.invoiceNo}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 10pt; color: #333; line-height: 1.4; }
    .container { width: 100%; max-width: 9in; margin: 0 auto; padding: 20px; }
    
    /* Header */
    .header { 
      display: grid; 
      grid-template-columns: 1fr 2fr 1fr; 
      gap: 20px; 
      margin-bottom: 20px; 
      align-items: start;
    }
    .company-left { text-align: left; }
    .company-center { text-align: center; }
    .company-right { text-align: right; font-size: 9pt; }
    
    .company-name { font-size: 18pt; font-weight: bold; margin-bottom: 8px; color: #1a1a1a; }
    .company-detail { font-size: 8.5pt; margin: 2px 0; color: #555; }
    
    /* Recipient */
    .recipient-section { 
      display: grid; 
      grid-template-columns: 1fr 1fr; 
      gap: 30px; 
      margin-bottom: 20px;
    }
    .recipient-block { font-size: 9pt; line-height: 1.6; }
    .recipient-label { font-weight: bold; margin-bottom: 5px; }
    .recipient-value { margin-left: 5px; }
    
    /* Invoice Metadata */
    .metadata { 
      display: grid; 
      grid-template-columns: 1fr 1fr 1fr; 
      gap: 20px; 
      margin-bottom: 20px;
    }
    .metadata-box { 
      border: 1px solid #999; 
      padding: 10px; 
      text-align: center; 
    }
    .metadata-label { font-size: 8.5pt; font-weight: bold; color: #666; }
    .metadata-value { font-size: 10pt; font-weight: bold; margin-top: 5px; }
    
    /* Table */
    .line-items { 
      width: 100%; 
      border-collapse: collapse; 
      margin-bottom: 15px; 
      font-size: 9pt;
    }
    .line-items th { 
      background-color: #f3f4f6; 
      padding: 8px; 
      text-align: left; 
      font-weight: bold; 
      border: 1px solid #d1d5db;
      font-size: 8pt;
    }
    .line-items td { padding: 8px; }
    .line-items tbody tr { border-bottom: 1px solid #e5e7eb; }
    
    /* Totals Row */
    .totals-row { 
      background-color: #f9fafb; 
      font-weight: bold; 
      border-top: 2px solid #999;
      border-bottom: 2px solid #999;
    }
    
    /* Financial Summary */
    .financial { 
      display: grid; 
      grid-template-columns: 1fr 1fr; 
      gap: 30px; 
      margin-bottom: 20px;
    }
    .amount-in-words { 
      background-color: #f9fafb; 
      padding: 10px; 
      border: 1px solid #d1d5db; 
      font-size: 9pt;
      min-height: 40px;
      display: flex;
      align-items: center;
    }
    
    .summary-table { 
      border: 1px solid #d1d5db; 
      width: 100%;
      border-collapse: collapse;
    }
    .summary-table td { 
      padding: 10px; 
      border-bottom: 1px solid #e5e7eb;
      font-size: 9pt;
    }
    .summary-table .label { 
      font-weight: bold; 
      width: 60%;
    }
    .summary-table .amount { 
      text-align: right; 
      font-weight: bold;
      width: 40%;
    }
    
    /* Banking & Legal */
    .bank-and-legal { 
      display: grid; 
      grid-template-columns: 1fr 1fr; 
      gap: 30px; 
      margin-bottom: 20px;
    }
    
    .bank-section, .terms-section { 
      font-size: 8.5pt; 
      line-height: 1.5;
    }
    .section-title { 
      font-weight: bold; 
      margin-bottom: 8px; 
      font-size: 9pt;
    }
    .bank-detail { 
      display: grid; 
      grid-template-columns: 130px 1fr; 
      gap: 10px; 
      margin-bottom: 5px;
    }
    .bank-label { font-weight: bold; }
    
    .terms-list { 
      margin-top: 5px;
    }
    .term-item { 
      margin-bottom: 6px; 
      text-align: justify;
    }
    
    /* Footer */
    .footer { 
      display: grid; 
      grid-template-columns: 1fr 1fr 1fr; 
      gap: 30px; 
      margin-top: 30px; 
      padding-top: 20px; 
      border-top: 1px solid #d1d5db;
    }
    .footer-section { 
      text-align: center; 
      font-size: 8.5pt;
    }
    .signature-line { 
      margin-top: 30px; 
      border-top: 1px solid #333; 
      padding-top: 5px; 
    }
    
    .page-break { page-break-after: always; }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <div class="company-left"></div>
      <div class="company-center">
        <div class="company-name">${data.company.name}</div>
      </div>
      <div class="company-right">
        <div class="company-detail"><strong>Address:</strong> ${data.company.address}</div>
        <div class="company-detail"><strong>Email:</strong> ${data.company.email}</div>
        <div class="company-detail"><strong>Web:</strong> ${data.company.website}</div>
        <div class="company-detail"><strong>Phone:</strong> ${data.company.phone}</div>
        <div class="company-detail" style="margin-top: 5px;"><strong>GSTIN:</strong> ${data.company.gstin}</div>
      </div>
    </div>

    <!-- Recipient -->
    <div class="recipient-section">
      <div class="recipient-block">
        <div class="recipient-label">Bill To:</div>
        <div class="recipient-value">
          <strong>${data.customer.name}</strong><br>
          ${data.customer.shopNo ? `Shop No: ${data.customer.shopNo}<br>` : ''}
          ${data.customer.marketYard ? `${data.customer.marketYard}<br>` : ''}
          ${data.customer.area}<br>
          ${data.customer.district}, ${data.customer.state}
          ${data.customer.pincode ? ` - ${data.customer.pincode}` : ''}<br>
          ${data.customer.contact ? `Contact: ${data.customer.contact}` : ''}
        </div>
      </div>
      <div class="recipient-block" style="text-align: right;">
        <div class="recipient-label" style="text-align: right;">Bill Details:</div>
        <div class="recipient-value" style="text-align: right;">
          ${data.customer.gstin ? `<strong>GSTIN:</strong> ${data.customer.gstin}<br>` : ''}
        </div>
      </div>
    </div>

    <!-- Invoice Metadata -->
    <div class="metadata">
      <div style="grid-column: span 3;"></div>
    </div>
    <div class="metadata">
      <div class="metadata-box">
        <div class="metadata-label">INVOICE NO.</div>
        <div class="metadata-value">${data.metadata.invoiceNo}</div>
      </div>
      <div class="metadata-box">
        <div class="metadata-label">INVOICE DATE</div>
        <div class="metadata-value">${data.metadata.invoiceDate}</div>
      </div>
      <div class="metadata-box">
        <div class="metadata-label">GSTIN</div>
        <div class="metadata-value">${data.company.gstin}</div>
      </div>
    </div>


    <!-- Summary Section: Only one line -->
    <div style="padding: 30px 0 20px 0;">
      <div style="font-size: 1.1em; color: #555; margin-bottom: 10px;">
        Last inventory available at end of month: <strong>${lastInventory.toFixed(2)} MT</strong>
      </div>
    </div>

    <!-- Financial Summary -->
    <div class="financial">
      <div>
        <div style="margin-bottom: 8px; font-weight: bold; font-size: 9pt;">Amount in Words:</div>
        <div class="amount-in-words">
          <strong>${amountInWords(Math.round(data.financial.netAmount))}</strong>
        </div>
      </div>
      <div>
        <table class="summary-table">
          <tr>
            <td class="label">Basic Total:</td>
            <td class="amount">${formatCurrency(data.financial.basicTotal, false)}</td>
          </tr>
          <tr>
            <td class="label">Round Off:</td>
            <td class="amount">${formatCurrency(data.financial.roundOff, false)}</td>
          </tr>
          <tr style="background-color: #ecfdf5; font-weight: bold;">
            <td class="label">NET AMOUNT:</td>
            <td class="amount">${formatCurrency(data.financial.netAmount, false)}</td>
          </tr>
        </table>
      </div>
    </div>

    <!-- Banking & Legal -->
    <div class="bank-and-legal">
      <div class="bank-section">
        <div class="section-title">BANK DETAILS</div>
        <div class="bank-detail">
          <div class="bank-label">Bank Name:</div>
          <div>${data.bankDetails.bankName}</div>
        </div>
        <div class="bank-detail">
          <div class="bank-label">Branch:</div>
          <div>${data.bankDetails.branchName}</div>
        </div>
        <div class="bank-detail">
          <div class="bank-label">A/c No.:</div>
          <div>${data.bankDetails.accountNumber}</div>
        </div>
        <div class="bank-detail">
          <div class="bank-label">IFSC Code:</div>
          <div>${data.bankDetails.ifscCode}</div>
        </div>
      </div>

      <div class="terms-section">
        <div class="section-title">TERMS & CONDITIONS</div>
        <div class="terms-list">
          ${data.termsAndConditions.map((tc) => `<div class="term-item"><strong>${tc.title}:</strong> ${tc.description}</div>`).join('')}
        </div>
      </div>
    </div>

    <!-- Footer / Signature -->
    <div class="footer">
      <div class="footer-section">
        <div class="signature-line">
          <div style="margin-top: 5px;">For ${data.company.name}</div>
        </div>
      </div>
      <div class="footer-section"></div>
      <div class="footer-section">
        <div class="signature-line">
          ${data.authorizedBy ? `<div>${data.authorizedBy}</div><div style="font-size: 8pt; margin-top: 3px;">Authorized Signatory</div>` : '<div>Authorized Signatory</div>'}
        </div>
      </div>
    </div>

    ${data.notes ? `<div style="margin-top: 20px; font-size: 8.5pt; color: #666;"><strong>Notes:</strong> ${data.notes}</div>` : ''}
  </div>
</body>
</html>
  `;

  return html;
}
