const { MongoClient } = require('mongodb');

async function matchInvoicesWithLedger() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  const db = client.db('wms_production');

  console.log('=== MARCH 2026 INVOICE vs LEDGER MATCHING ===\n');

  // Get all clients for reference
  const allClients = await db.collection('clients').find({}).toArray();
  const clientMap = new Map(allClients.map(c => [c._id.toString(), c.name]));

  // Get all warehouses for reference
  const allWarehouses = await db.collection('warehouses').find({}).toArray();
  const warehouseMap = new Map(allWarehouses.map(w => [w._id.toString(), w.name]));

  // Get March 2026 invoices
  const marchInvoices = await db.collection('invoice_master').find({
    $or: [
      { month: '2026-03' },
      { invoiceMonth: '2026-03' },
      { month: 'March 2026' },
      { invoiceMonth: 'March 2026' }
    ]
  }).toArray();

  console.log(`Found ${marchInvoices.length} March 2026 invoices\n`);

  // Group invoices by client
  const invoicesByClient = {};
  marchInvoices.forEach(inv => {
    const clientId = inv.clientId?.toString();
    const clientName = clientMap.get(clientId) || 'Unknown Client';
    const warehouseName = warehouseMap.get(inv.warehouseId?.toString()) || 'Unknown Warehouse';

    if (!invoicesByClient[clientId]) {
      invoicesByClient[clientId] = {
        clientName,
        warehouseName,
        totalAmount: 0,
        invoiceCount: 0
      };
    }

    invoicesByClient[clientId].totalAmount += inv.totalAmount || 0;
    invoicesByClient[clientId].invoiceCount++;
  });

  // Get March 2026 ledger data
  const marchLedgerEntries = await db.collection('ledger_entries').find({
    periodStartDate: { $regex: /^2026-03/ }
  }).toArray();

  console.log(`Found ${marchLedgerEntries.length} March 2026 ledger entries\n`);

  // Group ledger by client
  const ledgerByClient = {};
  marchLedgerEntries.forEach(entry => {
    const clientId = entry.clientId?.toString();
    const clientName = clientMap.get(clientId) || 'Unknown Client';

    if (!ledgerByClient[clientId]) {
      ledgerByClient[clientId] = {
        clientName,
        totalRent: 0,
        entries: 0
      };
    }

    ledgerByClient[clientId].totalRent += entry.rentCalculated || 0;
    ledgerByClient[clientId].entries++;
  });

  console.log('📊 CLIENT-WISE COMPARISON (March 2026):\n');

  // Combine and compare
  const allClientIds = new Set([...Object.keys(invoicesByClient), ...Object.keys(ledgerByClient)]);

  let totalInvoiceAmount = 0;
  let totalLedgerAmount = 0;

  console.log('| Client | Warehouse | Invoice Amount | Ledger Rent | Difference | Match |');
  console.log('|--------|-----------|----------------|-------------|------------|-------|');

  Array.from(allClientIds).forEach(clientId => {
    const invoiceData = invoicesByClient[clientId];
    const ledgerData = ledgerByClient[clientId];
    const clientName = invoiceData?.clientName || ledgerData?.clientName || 'Unknown';

    const invoiceAmount = invoiceData?.totalAmount || 0;
    const ledgerAmount = ledgerData?.totalRent || 0;
    const difference = invoiceAmount - ledgerAmount;
    const match = Math.abs(difference) < 0.01 ? '✅' : '❌';

    const warehouseName = invoiceData?.warehouseName || 'N/A';

    console.log(`| ${clientName} | ${warehouseName} | ₹${invoiceAmount.toLocaleString('en-IN')} | ₹${ledgerAmount.toLocaleString('en-IN')} | ₹${difference.toLocaleString('en-IN')} | ${match} |`);

    totalInvoiceAmount += invoiceAmount;
    totalLedgerAmount += ledgerAmount;
  });

  console.log('|--------|-----------|----------------|-------------|------------|-------|');
  console.log(`| **TOTAL** | | **₹${totalInvoiceAmount.toLocaleString('en-IN')}** | **₹${totalLedgerAmount.toLocaleString('en-IN')}** | **₹${(totalInvoiceAmount - totalLedgerAmount).toLocaleString('en-IN')}** | ${Math.abs(totalInvoiceAmount - totalLedgerAmount) < 0.01 ? '✅' : '❌'} |`);

  console.log('\n💰 REVENUE SHARING CALCULATION (March 2026):\n');

  console.log(`Total Revenue: ₹${totalLedgerAmount.toLocaleString('en-IN')}`);
  console.log(`Owner Share (60%): ₹${(totalLedgerAmount * 0.6).toLocaleString('en-IN')}`);
  console.log(`Platform Share (40%): ₹${(totalLedgerAmount * 0.4).toLocaleString('en-IN')}`);

  console.log('\n📋 DETAILED INVOICE BREAKDOWN:\n');

  Object.entries(invoicesByClient).forEach(([clientId, data]) => {
    console.log(`${data.clientName} (${data.warehouseName}):`);
    console.log(`  - ${data.invoiceCount} invoice(s)`);
    console.log(`  - Total: ₹${data.totalAmount.toLocaleString('en-IN')}`);
    console.log(`  - Owner (60%): ₹${(data.totalAmount * 0.6).toLocaleString('en-IN')}`);
    console.log(`  - Platform (40%): ₹${(data.totalAmount * 0.4).toLocaleString('en-IN')}\n`);
  });

  await client.close();
}

matchInvoicesWithLedger().catch(console.error);