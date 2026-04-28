const { MongoClient } = require('mongodb');

async function checkClientsAndLedger() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  const db = client.db('wms_production');

  console.log('=== CLIENTS IN DATABASE ===');
  const allClients = await db.collection('clients').find({}).toArray();
  console.log(`Total clients: ${allClients.length}`);

  allClients.forEach((c, i) => {
    console.log(`${i + 1}. ${c.name} - ID: ${c._id.toString()}`);
  });

  console.log('\n=== INVALID CLIENT ID FROM INVOICES ===');
  const invalidClientId = '69eefe1a11e1d8076f808683';
  const { ObjectId } = require('mongodb');
  const invalidClient = await db.collection('clients').findOne({ _id: new ObjectId(invalidClientId) });
  console.log(`Client with ID ${invalidClientId} exists: ${invalidClient ? 'YES' : 'NO'}`);
  if (invalidClient) {
    console.log(`Client name: ${invalidClient.name}`);
  }

  console.log('\n=== LEDGER ENTRIES ANALYSIS ===');
  const allLedgerEntries = await db.collection('ledger_entries').find({}).limit(10).toArray();
  console.log(`Total ledger entries: ${await db.collection('ledger_entries').countDocuments()}`);
  console.log('Sample ledger entries:');

  allLedgerEntries.forEach((entry, i) => {
    console.log(`${i + 1}. Client: ${entry.clientId}, Warehouse: ${entry.warehouseId}`);
    console.log(`   Period: ${entry.periodStartDate} to ${entry.periodEndDate}`);
    console.log(`   Rent: ₹${entry.rentCalculated?.toLocaleString('en-IN')}`);
    console.log(`   Commodity: ${entry.commodityId}`);
    console.log('');
  });

  // Check for March 2026 entries with different date formats
  console.log('=== MARCH 2026 LEDGER SEARCH ===');
  const marchEntries = await db.collection('ledger_entries').find({
    $or: [
      { periodStartDate: { $gte: new Date('2026-03-01'), $lt: new Date('2026-04-01') } },
      { periodStartDate: { $regex: /2026-03/ } },
      { periodStartDate: '2026-03-01' },
      { periodStartDate: new Date('2026-03-01') }
    ]
  }).toArray();

  console.log(`March 2026 entries found: ${marchEntries.length}`);

  if (marchEntries.length > 0) {
    marchEntries.forEach((entry, i) => {
      console.log(`${i + 1}. ${entry.clientId} - ₹${entry.rentCalculated?.toLocaleString('en-IN')}`);
    });
  }

  // Check distinct period dates
  console.log('\n=== DISTINCT PERIOD DATES ===');
  const distinctDates = await db.collection('ledger_entries').distinct('periodStartDate');
  console.log('Distinct period start dates:');
  distinctDates.slice(0, 10).forEach(date => {
    console.log(`  ${date} (${typeof date})`);
  });

  await client.close();
}

checkClientsAndLedger().catch(console.error);