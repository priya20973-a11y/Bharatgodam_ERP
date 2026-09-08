import { IReceiptTemplate } from '@/lib/models/ReceiptTemplate';
import { mapTransactionToTemplate } from '@/lib/utils/receipt-field-mapper';

export function generateColdDynamicReceiptHTML(
  transaction: any, 
  template: any, 
  receiptType: 'inward' | 'outward' | 'transfer' | 'invoice'
): string {
  // Map values based on the transaction
  const mappedData = mapTransactionToTemplate(transaction, receiptType);
  
  // Base HTML document
  let html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Receipt ${mappedData.receiptNo || ''}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+Gujarati:wght@400;500;600;700&display=swap');
          
          @page {
            size: ${template.paperWidth}mm ${template.paperHeight}mm;
            margin: 0;
          }
          
          body {
            margin: 0;
            padding: 0;
            font-family: 'Inter', 'Noto Sans Gujarati', sans-serif;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            width: ${template.paperWidth}mm;
            height: ${template.paperHeight}mm;
            position: relative;
          }
          
          .receipt-container {
            width: 100%;
            height: 100%;
            position: relative;
            background-color: white;
            box-sizing: border-box;
          }
          
          .bg-image {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 0;
            object-fit: fill;
          }
          
          .field {
            position: absolute;
            z-index: 10;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            line-height: 1.2;
          }
          
          @media print {
            .bg-image {
              display: none !important;
            }
            body {
              width: ${template.paperWidth}mm;
              height: ${template.paperHeight}mm;
            }
          }
        </style>
      </head>
      <body>
        <div class="receipt-container">
          ${template.backgroundImage ? `<img src="${template.backgroundImage}" class="bg-image" />` : ''}
  `;
  
  // Render each field using absolute positioning
  if (template.fields && Array.isArray(template.fields)) {
    template.fields.forEach((f: any) => {
      if (!f.visible) return;
      
      const val = mappedData[f.key] || '';
      const left = f.x;
      const top = f.y;
      
      // We convert fontSize to mm approximately (1 pt = 0.352778 mm) 
      // But CSS supports 'pt' directly for fonts, so we can just use pt.
      const fontSizePt = f.fontSize || 12;
      
      html += `
        <div class="field" style="
          left: ${left}mm;
          top: ${top}mm;
          font-size: ${fontSizePt}pt;
          font-weight: ${f.fontWeight || 'normal'};
          text-align: ${f.align || 'left'};
          ${f.width ? `width: ${f.width}mm;` : ''}
        ">
          ${val}
        </div>
      `;
    });
  }
  
  html += `
        </div>
        
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 500);
          }
        </script>
      </body>
    </html>
  `;
  
  return html;
}
