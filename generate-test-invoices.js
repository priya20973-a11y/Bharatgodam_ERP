const { generateMonthlyInvoices } = require('./app/actions/stock-ledger-actions.ts');

async function generateTestInvoices() {
  try {
    console.log('Generating invoices for April 2026...');
    const result = await generateMonthlyInvoices('2026-04');
    console.log('Result:', result);

    console.log('Generating invoices for May 2026...');
    const result2 = await generateMonthlyInvoices('2026-05');
    console.log('Result:', result2);
  } catch (error) {
    console.error('Error:', error);
  }
}

generateTestInvoices();