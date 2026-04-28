const { MongoClient } = require('mongodb');

async function analyzeInvoiceData() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  const db = client.db('wms_production');

  console.log('=== COMPREHENSIVE INVOICE DATA ANALYSIS ===\n');

  // Get all invoices
  const allInvoices = await db.collection('invoice_master').find({}).toArray();
  console.log(`Total invoices in database: ${allInvoices.length}\n`);

  // Analyze invoice structure
  console.log('=== INVOICE STRUCTURE ANALYSIS ===');
  if (allInvoices.length > 0) {
    const sampleInvoice = allInvoices[0];
    console.log('Sample invoice fields:');
    Object.keys(sampleInvoice).forEach(key => {
      const value = sampleInvoice[key];
      const type = Array.isArray(value) ? 'array' : typeof value;
      console.log(`  ${key}: ${type} - ${value}`);
    });
  }
  console.log('');

  // Check for issues
  let validInvoices = 0;
  let invalidClientInvoices = 0;
  let invalidWarehouseInvoices = 0;
  let undefinedMonthInvoices = 0;
  let validMarchInvoices = 0;

  const clientIssues = [];
  const warehouseIssues = [];
  const monthIssues = [];

  // Get all clients and warehouses for reference
  const allClients = await db.collection('clients').find({}).toArray();
  const allWarehouses = await db.collection('warehouses').find({}).toArray();

  const clientMap = new Map(allClients.map(c => [c._id.toString(), c.name]));
  const warehouseMap = new Map(allWarehouses.map(w => [w._id.toString(), w.name]));

  console.log('=== DETAILED INVOICE ANALYSIS ===');

  for (let i = 0; i < allInvoices.length; i++) {
    const inv = allInvoices[i];
    console.log(`\n--- Invoice ${i + 1} ---`);
    console.log(`Invoice ID: ${inv.invoiceId || inv.invoiceNumber || 'N/A'}`);
    console.log(`Total Amount: ₹${inv.totalAmount?.toLocaleString('en-IN') || 'N/A'}`);
    console.log(`Status: ${inv.status || 'N/A'}`);
    console.log(`Invoice Date: ${inv.invoiceDate || inv.generatedAt || 'N/A'}`);
    console.log(`Due Date: ${inv.dueDate || 'N/A'}`);
    console.log(`Month: ${inv.invoiceMonth || inv.month || 'UNDEFINED'}`);

    // Check client
    const clientId = inv.clientId?.toString();
    if (clientId && clientMap.has(clientId)) {
      console.log(`Client: ${clientMap.get(clientId)} (${clientId})`);
    } else {
      console.log(`Client: UNKNOWN CLIENT (${clientId || 'no clientId'})`);
      invalidClientInvoices++;
      clientIssues.push({
        invoiceId: inv.invoiceId || inv.invoiceNumber,
        clientId: clientId,
        totalAmount: inv.totalAmount
      });
    }

    // Check warehouse
    const warehouseId = inv.warehouseId?.toString();
    if (warehouseId && warehouseMap.has(warehouseId)) {
      console.log(`Warehouse: ${warehouseMap.get(warehouseId)} (${warehouseId})`);
    } else {
      console.log(`Warehouse: UNKNOWN WAREHOUSE (${warehouseId || 'no warehouseId'})`);
      invalidWarehouseInvoices++;
      warehouseIssues.push({
        invoiceId: inv.invoiceId || inv.invoiceNumber,
        warehouseId: warehouseId,
        totalAmount: inv.totalAmount
      });
    }

    // Check month
    const month = inv.invoiceMonth || inv.month;
    if (!month) {
      undefinedMonthInvoices++;
      monthIssues.push({
        invoiceId: inv.invoiceId || inv.invoiceNumber,
        totalAmount: inv.totalAmount
      });
    } else if (month === 'March 2026') {
      validMarchInvoices++;
    }

    // Check if invoice is valid (has client, warehouse, and month)
    if (clientId && clientMap.has(clientId) && warehouseId && warehouseMap.has(warehouseId) && month) {
      validInvoices++;
    }
  }

  console.log('\n=== SUMMARY STATISTICS ===');
  console.log(`Total Invoices: ${allInvoices.length}`);
  console.log(`Valid Invoices (client + warehouse + month): ${validInvoices}`);
  console.log(`Invalid Client References: ${invalidClientInvoices}`);
  console.log(`Invalid Warehouse References: ${invalidWarehouseInvoices}`);
  console.log(`Undefined Months: ${undefinedMonthInvoices}`);
  console.log(`Valid March 2026 Invoices: ${validMarchInvoices}`);

  // Show issues
  if (clientIssues.length > 0) {
    console.log('\n=== CLIENT REFERENCE ISSUES ===');
    clientIssues.forEach(issue => {
      console.log(`Invoice ${issue.invoiceId}: Client ID ${issue.clientId} - ₹${issue.totalAmount?.toLocaleString('en-IN')}`);
    });
  }

  if (warehouseIssues.length > 0) {
    console.log('\n=== WAREHOUSE REFERENCE ISSUES ===');
    warehouseIssues.forEach(issue => {
      console.log(`Invoice ${issue.invoiceId}: Warehouse ID ${issue.warehouseId} - ₹${issue.totalAmount?.toLocaleString('en-IN')}`);
    });
  }

  if (monthIssues.length > 0) {
    console.log('\n=== MONTH ISSUES ===');
    monthIssues.forEach(issue => {
      console.log(`Invoice ${issue.invoiceId}: ₹${issue.totalAmount?.toLocaleString('en-IN')}`);
    });
  }

  // Check ledger data for comparison
  console.log('\n=== LEDGER DATA COMPARISON ===');
  const ledgerEntries = await db.collection('ledger_entries').find({
    periodStartDate: {
      $gte: new Date('2026-03-01'),
      $lt: new Date('2026-04-01')
    }
  }).toArray();

  console.log(`Ledger entries for March 2026: ${ledgerEntries.length}`);

  const ledgerByClient = {};
  ledgerEntries.forEach(entry => {
    const clientId = entry.clientId?.toString();
    if (!ledgerByClient[clientId]) {
      ledgerByClient[clientId] = {
        clientName: clientMap.get(clientId) || 'Unknown',
        totalRent: 0,
        entries: 0
      };
    }
    ledgerByClient[clientId].totalRent += entry.rentCalculated || 0;
    ledgerByClient[clientId].entries++;
  });

  console.log('\nLedger totals by client for March 2026:');
  Object.entries(ledgerByClient).forEach(([clientId, data]) => {
    console.log(`  ${data.clientName}: ₹${data.totalRent.toLocaleString('en-IN')} (${data.entries} entries)`);
  });

  console.log('\n=== RECOMMENDATIONS ===');
  console.log('1. Invoice generation process needs to be run to create proper invoices from ledger data');
  console.log('2. Check invoice generation script for client/warehouse reference issues');
  console.log('3. Verify that all 13 clients have proper invoice generation');
  console.log('4. Month field population needs to be fixed in invoice generation');

  await client.close();
}

analyzeInvoiceData().catch(console.error);