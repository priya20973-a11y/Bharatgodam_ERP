const { MongoClient } = require('mongodb');

async function checkAllDates() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  const db = client.db('wms_production');

  console.log('=== CHECKING ALL LEDGER DATES ===\n');

  const allEntries = await db.collection('ledger_entries').find({}).toArray();
  console.log(`Total entries: ${allEntries.length}\n`);

  // Check first 10 entries
  allEntries.slice(0, 10).forEach((entry, i) => {
    console.log(`${i + 1}. periodStartDate: ${entry.periodStartDate} (type: ${typeof entry.periodStartDate})`);
    console.log(`   periodEndDate: ${entry.periodEndDate} (type: ${typeof entry.periodEndDate})`);
    console.log(`   rentCalculated: ₹${entry.rentCalculated}`);
    console.log('');
  });

  // Check date range query
  const marchQuery = {
    periodStartDate: {
      $gte: new Date('2026-03-01'),
      $lt: new Date('2026-04-01')
    }
  };

  console.log('March query:', JSON.stringify(marchQuery, null, 2));

  const marchEntries = await db.collection('ledger_entries').find(marchQuery).toArray();
  console.log(`\nMarch entries with Date query: ${marchEntries.length}`);

  // Try string-based query
  const marchStringQuery = {
    periodStartDate: {
      $regex: /^2026-03/
    }
  };

  const marchStringEntries = await db.collection('ledger_entries').find(marchStringQuery).toArray();
  console.log(`March entries with string query: ${marchStringEntries.length}`);

  await client.close();
}

checkAllDates().catch(console.error);