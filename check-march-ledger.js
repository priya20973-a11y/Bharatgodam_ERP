const mongoose = require('mongoose');

async function checkMarchLedger() {
  // Connect to database like the app does
  const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017';
  const MONGODB_DB = process.env.MONGODB_DB || 'wms_production';

  await mongoose.connect(MONGODB_URL, { dbName: MONGODB_DB });
  const db = mongoose.connection.db;

  console.log('Checking March 2026 ledger entries...');

  // Get all ledger entries for March 2026 (periodStartDate starting with 2026-03)
  const marchLedgerEntries = await db.collection('ledger_entries').find({
    periodStartDate: { $regex: /^2026-03/ }
  }).toArray();

  console.log('Total March ledger entries:', marchLedgerEntries.length);

  // Group by client
  const clientTotals = new Map();

  for (const entry of marchLedgerEntries) {
    const clientId = entry.clientId.toString();
    const rentCalculated = Number(entry.rentCalculated || 0);

    if (!clientTotals.has(clientId)) {
      clientTotals.set(clientId, { total: 0, count: 0 });
    }

    const data = clientTotals.get(clientId);
    data.total += rentCalculated;
    data.count += 1;
  }

  // Get client names and display results
  const clientIds = Array.from(clientTotals.keys());
  const clients = await db.collection('clients').find({
    _id: { $in: clientIds.map(id => new mongoose.Types.ObjectId(id)) }
  }).toArray();

  const clientMap = new Map(clients.map(c => [c._id.toString(), c.name]));

  console.log('\nMarch 2026 Ledger Totals by Client (rentCalculated):');
  let grandTotal = 0;
  for (const [clientId, data] of clientTotals) {
    const clientName = clientMap.get(clientId) || 'Unknown';
    const total = Math.round(data.total * 100) / 100;
    grandTotal += total;
    console.log(clientName + ': ₹' + total.toLocaleString('en-IN', { minimumFractionDigits: 2 }) + ' (' + data.count + ' entries)');
  }

  console.log('\nGrand Total: ₹' + grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 }));

  await mongoose.disconnect();
}

checkMarchLedger().catch(console.error);