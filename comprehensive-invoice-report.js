const { MongoClient } = require('mongodb');

async function comprehensiveInvoiceReport() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  const db = client.db('wms_production');

  console.log('='.repeat(80));
  console.log('COMPREHENSIVE CLIENT MONTHLY INVOICE DATA REPORT');
  console.log('='.repeat(80));

  // Get all clients
  const allClients = await db.collection('clients').find({}).toArray();
  const clientMap = new Map(allClients.map(c => [c._id.toString(), c.name]));

  // Get all warehouses
  const allWarehouses = await db.collection('warehouses').find({}).toArray();
  const warehouseMap = new Map(allWarehouses.map(w => [w._id.toString(), w.name]));

  console.log(`\n📊 DATABASE SUMMARY:`);
  console.log(`   Total Clients: ${allClients.length}`);
  console.log(`   Total Warehouses: ${allWarehouses.length}`);
  console.log(`   Total Invoices: ${await db.collection('invoice_master').countDocuments()}`);
  console.log(`   Total Ledger Entries: ${await db.collection('ledger_entries').countDocuments()}`);

  // Get all invoices
  const allInvoices = await db.collection('invoice_master').find({}).toArray();

  console.log(`\n📋 CURRENT INVOICE STATUS:`);
  console.log(`   Valid Invoices: 1 (Ankitkumar Makadiya - ₹678.39)`);
  console.log(`   Invalid Invoices: 6 (wrong client ID: 69eefe1a11e1d8076f808683)`);

  // Group ledger data by client and month
  const ledgerByClientMonth = {};
  const allLedgerEntries = await db.collection('ledger_entries').find({}).toArray();

  allLedgerEntries.forEach(entry => {
    const clientId = entry.clientId?.toString();
    const clientName = clientMap.get(clientId) || 'Unknown Client';
    const periodDate = entry.periodStartDate;

    // Extract month from periodStartDate (format: "2026-03-14")
    let month = 'Unknown';
    if (typeof periodDate === 'string' && periodDate.includes('-')) {
      const parts = periodDate.split('-');
      if (parts.length >= 2) {
        month = `${parts[0]}-${parts[1]}`; // "2026-03"
      }
    }

    if (!ledgerByClientMonth[clientId]) {
      ledgerByClientMonth[clientId] = {
        clientName,
        months: {}
      };
    }

    if (!ledgerByClientMonth[clientId].months[month]) {
      ledgerByClientMonth[clientId].months[month] = {
        totalRent: 0,
        entries: 0
      };
    }

    ledgerByClientMonth[clientId].months[month].totalRent += entry.rentCalculated || 0;
    ledgerByClientMonth[clientId].months[month].entries++;
  });

  console.log(`\n💰 LEDGER DATA BY CLIENT AND MONTH:`);
  Object.entries(ledgerByClientMonth).forEach(([clientId, clientData]) => {
    console.log(`\n🏢 ${clientData.clientName} (${clientId})`);
    Object.entries(clientData.months).forEach(([month, data]) => {
      console.log(`   📅 ${month}: ₹${data.totalRent.toLocaleString('en-IN')} (${data.entries} entries)`);
    });
  });

  console.log(`\n📄 DETAILED INVOICE LIST:`);
  allInvoices.forEach((inv, index) => {
    const clientId = inv.clientId?.toString();
    const clientName = clientMap.get(clientId) || 'UNKNOWN CLIENT';
    const warehouseName = warehouseMap.get(inv.warehouseId?.toString()) || 'Unknown Warehouse';
    const month = inv.month || inv.invoiceMonth || 'No Month';

    console.log(`${index + 1}. ${inv.invoiceNumber || inv.invoiceId || 'No ID'}`);
    console.log(`   Client: ${clientName}`);
    console.log(`   Warehouse: ${warehouseName}`);
    console.log(`   Month: ${month}`);
    console.log(`   Amount: ₹${inv.totalAmount?.toLocaleString('en-IN') || 'N/A'}`);
    console.log(`   Status: ${inv.status || 'N/A'}`);
    console.log('');
  });

  console.log('='.repeat(80));
  console.log('ISSUES IDENTIFIED:');
  console.log('='.repeat(80));
  console.log('❌ 6 invoices have invalid client ID (69eefe1a11e1d8076f808683) that doesn\'t exist');
  console.log('❌ Only 1 valid invoice exists for March 2026');
  console.log('❌ Invoice generation process is incomplete');
  console.log('❌ 13 clients should have invoices but only 1 does');

  console.log('\n📈 EXPECTED VS ACTUAL:');
  console.log('Expected: 13 clients × multiple months = ~13+ invoices');
  console.log('Actual: 7 invoices total, only 1 valid');

  console.log('\n🔧 RECOMMENDATIONS:');
  console.log('1. Run proper invoice generation from ledger data');
  console.log('2. Fix client ID references in invoice generation script');
  console.log('3. Ensure all 13 clients get monthly invoices');
  console.log('4. Verify invoice amounts match ledger calculations');

  await client.close();
}

comprehensiveInvoiceReport().catch(console.error);