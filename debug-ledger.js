const { MongoClient, ObjectId } = require('mongodb');

async function checkLedger() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  const db = client.db('wms_production');

  // Find Shekhar Mehata client
  const shekharClient = await db.collection('clients').findOne({ name: 'Shekhar Mehata' });
  console.log('Shekhar Mehata client:', shekharClient);

  if (!shekharClient) return;

  // Get transactions for Shekhar Mehata
  const transactions = await db.collection('transactions').find({
    clientId: shekharClient._id.toString()
  }).sort({ date: 1 }).toArray();

  console.log('\n=== TRANSACTIONS FOR SHEKHAR MEHATA ===');
  transactions.forEach((t, i) => {
    console.log(`${i+1}. ${t.direction} - ${t.commodityName} - ${t.quantityMT}MT - ${t.date}`);
  });

  // Check if there are any ledger entries
  const ledgerEntries = await db.collection('ledger_entries').find({
    clientId: shekharClient._id
  }).toArray();
  
  console.log('\n=== LEDGER ENTRIES FOR SHEKHAR MEHATA ===');
  console.log('Ledger entries found:', ledgerEntries.length);
  ledgerEntries.slice(0, 5).forEach((entry, i) => {
    console.log(`${i+1}. ${entry.commodityName} - ${entry.status} - ${entry.fromDate} to ${entry.toDate}`);
  });

  await client.close();
}

checkLedger().catch(console.error);