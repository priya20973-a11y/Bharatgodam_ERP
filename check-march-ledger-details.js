const mongoose = require('mongoose');

async function checkMarchLedgerDetails() {
  // Connect to database like the app does
  const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017';
  const MONGODB_DB = process.env.MONGODB_DB || 'wms_production';

  await mongoose.connect(MONGODB_URL, { dbName: MONGODB_DB });
  const db = mongoose.connection.db;

  console.log('Checking March 2026 ledger entries in detail...');

  // Get ledger entries for March 2026
  const marchEntries = await db.collection('ledger_entries').find({
    periodStartDate: { $regex: /^2026-03/ }
  }).toArray();

  console.log('Total March entries:', marchEntries.length);

  // Get client names
  const clientIds = [...new Set(marchEntries.map(entry => entry.clientId.toString()))];
  const clients = await db.collection('clients').find({
    _id: { $in: clientIds.map(id => new mongoose.Types.ObjectId(id)) }
  }).toArray();

  const clientMap = new Map(clients.map(c => [c._id.toString(), c.name]));

  // Group by client and show details
  const clientDetails = new Map();

  for (const entry of marchEntries) {
    const clientId = entry.clientId.toString();
    const clientName = clientMap.get(clientId) || 'Unknown';

    if (!clientDetails.has(clientName)) {
      clientDetails.set(clientName, []);
    }

    clientDetails.get(clientName).push({
      periodStartDate: entry.periodStartDate,
      rentCalculated: entry.rentCalculated,
      quantityMT: entry.quantityMT,
      type: entry.type
    });
  }

  console.log('\nDetailed March 2026 entries by client:');
  for (const [clientName, entries] of clientDetails) {
    console.log(`\n${clientName}:`);
    let totalRent = 0;
    entries.forEach((entry, index) => {
      console.log(`  ${index + 1}. Date: ${entry.periodStartDate}, Rent: ₹${entry.rentCalculated}, Qty: ${entry.quantityMT}MT, Type: ${entry.type}`);
      totalRent += entry.rentCalculated || 0;
    });
    console.log(`  Total Rent: ₹${totalRent.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
  }

  await mongoose.disconnect();
}

checkMarchLedgerDetails().catch(console.error);