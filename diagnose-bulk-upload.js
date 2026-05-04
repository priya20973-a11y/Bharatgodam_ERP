const { MongoClient } = require('mongodb');

const MONGODB_URL = 'mongodb://localhost:27017';
const DB_NAME = 'wms_production';

async function diagnose() {
  const client = new MongoClient(MONGODB_URL);
  
  try {
    await client.connect();
    console.log('✓ Connected to MongoDB\n');
    
    const db = client.db(DB_NAME);
    const transactionsCol = db.collection('transactions');
    const inwardCol = db.collection('inwards');
    const outwardCol = db.collection('outwards');
    const ledgerCol = db.collection('ledger_entries');

    // Get the most recently created transactions (from last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    console.log('📊 DIAGNOSTIC REPORT - Bulk Upload Issue\n');
    console.log(`Looking for transactions created after: ${oneHourAgo}\n`);

    // Get recent transactions
    const recentTxns = await transactionsCol.find({
      createdAt: { $gte: oneHourAgo },
      source: 'BULK_UPLOAD'
    }).sort({ createdAt: -1 }).toArray();

    console.log(`=== TRANSACTIONS COLLECTION ===`);
    console.log(`Total recent bulk upload transactions: ${recentTxns.length}\n`);
    
    const clientNames = new Set();
    recentTxns.forEach((t, i) => {
      console.log(`${i + 1}. ${t.direction} - ${t.quantityMT}MT - ${t.date} - Client: ${t.clientName} - GatePass: ${t.gatePass || 'N/A'}`);
      clientNames.add(t.clientName);
    });

    // For each unique client, show details
    for (const clientName of clientNames) {
      console.log(`\n\n--- Client: ${clientName} ---`);
      
      // Get transactions for this client
      const clientTxns = recentTxns.filter(t => t.clientName === clientName);
      console.log(`\nTransactions (${clientTxns.length}):`);
      clientTxns.forEach((t, i) => {
        console.log(`  ${i + 1}. ${t.direction} ${t.quantityMT}MT on ${t.date}`);
      });

      // Get Inward records
      const inwards = await inwardCol.find({
        clientName: clientName
      }).sort({ createdAt: -1 }).limit(10).toArray();
      console.log(`\nInward Models (${inwards.length}):`);
      inwards.forEach((i, idx) => {
        console.log(`  ${idx + 1}. ${i.quantityMT}MT - ${i.date}`);
      });

      // Get Outward records
      const outwards = await outwardCol.find({
        clientName: clientName
      }).sort({ createdAt: -1 }).limit(10).toArray();
      console.log(`\nOutward Models (${outwards.length}):`);
      outwards.forEach((o, idx) => {
        console.log(`  ${idx + 1}. ${o.quantityMT}MT - ${o.date}`);
      });

      // Get ledger entries
      const ledgerEntries = await ledgerCol.find({
        clientId: clientTxns[0]?.clientId
      }).sort({ createdAt: -1 }).limit(10).toArray();
      console.log(`\nLedger Entries (${ledgerEntries.length}):`);
      ledgerEntries.forEach((l, idx) => {
        console.log(`  ${idx + 1}. ${l.quantityMT}MT - ${l.status} - Start: ${l.periodStartDate} - End: ${l.periodEndDate || 'ONGOING'}`);
      });
    }

    console.log('\n✅ Diagnostic complete!\n');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

diagnose();
