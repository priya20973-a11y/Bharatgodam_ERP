const { MongoClient } = require('mongodb');

async function analyzeInvoiceVsLedgerCalculation() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  const db = client.db('wms_production');

  console.log('=== ANALYZING INVOICE vs LEDGER CALCULATION DIFFERENCES ===\n');

  // Get all clients for reference
  const allClients = await db.collection('clients').find({}).toArray();
  const clientMap = new Map(allClients.map(c => [c._id.toString(), c.name]));

  // Get sample ledger entries for March 2026
  const sampleLedgerEntries = await db.collection('ledger_entries').find({
    periodStartDate: { $regex: /^2026-03/ }
  }).limit(20).toArray();

  console.log('📊 SAMPLE LEDGER ENTRIES (March 2026):\n');
  sampleLedgerEntries.forEach((entry, i) => {
    const clientName = clientMap.get(entry.clientId?.toString()) || 'Unknown';
    console.log(`${i + 1}. ${clientName}`);
    console.log(`   Date: ${entry.periodStartDate}`);
    console.log(`   Rent Calculated: ₹${entry.rentCalculated?.toLocaleString('en-IN')}`);
    console.log(`   Commodity: ${entry.commodityId}`);
    console.log(`   Warehouse: ${entry.warehouseId}\n`);
  });

  // Check invoice line items for March 2026
  const marchInvoices = await db.collection('invoice_master').find({
    $or: [
      { month: '2026-03' },
      { invoiceMonth: '2026-03' }
    ]
  }).toArray();

  console.log('📄 SAMPLE INVOICE LINE ITEMS:\n');

  for (const invoice of marchInvoices.slice(0, 5)) {
    console.log(`Invoice: ${invoice.invoiceNumber} (${invoice.status})`);
    console.log(`Client: ${clientMap.get(invoice.clientId?.toString()) || 'Unknown'}`);
    console.log(`Total Amount: ₹${invoice.totalAmount?.toLocaleString('en-IN')}`);

    // Get line items for this invoice
    const lineItems = await db.collection('invoice_line_items').find({
      invoiceMasterId: invoice._id
    }).toArray();

    console.log(`Line Items: ${lineItems.length}`);
    lineItems.forEach(item => {
      console.log(`  - ${item.description}: ₹${item.amount?.toLocaleString('en-IN')} (${item.quantity} × ₹${item.rate})`);
    });
    console.log('');
  }

  // Check if invoices are calculated per transaction vs monthly totals
  console.log('🔍 ANALYSIS:\n');

  const ledgerTotal = sampleLedgerEntries.reduce((sum, entry) => sum + (entry.rentCalculated || 0), 0);
  const invoiceTotal = marchInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);

  console.log(`Total March 2026 Ledger Rent: ₹${ledgerTotal.toLocaleString('en-IN')}`);
  console.log(`Total March 2026 Invoice Amount: ₹${invoiceTotal.toLocaleString('en-IN')}`);
  console.log(`Difference: ₹${(invoiceTotal - ledgerTotal).toLocaleString('en-IN')}`);

  console.log('\n💡 POSSIBLE EXPLANATIONS:');
  console.log('1. Invoices might be partial payments, not full monthly totals');
  console.log('2. Invoices might be calculated differently (per transaction vs aggregated)');
  console.log('3. Some ledger entries might not have corresponding invoices');
  console.log('4. Invoice amounts might represent different billing periods');

  console.log('\n📋 RECOMMENDATION:');
  console.log('For revenue sharing dashboard, use LEDGER TOTALS as they represent');
  console.log('the complete monthly rent calculations. Invoice amounts appear to be');
  console.log('different calculations (possibly partial or different billing logic).');

  await client.close();
}

analyzeInvoiceVsLedgerCalculation().catch(console.error);