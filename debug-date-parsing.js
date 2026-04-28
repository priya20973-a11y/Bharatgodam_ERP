const { MongoClient } = require('mongodb');

async function debugDateParsing() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  const db = client.db('wms_production');

  console.log('=== DEBUGGING DATE PARSING ===\n');

  // Get the most recent entries
  const recentEntries = await db.collection('ledger_entries').find({})
    .sort({ createdAt: -1 })
    .limit(5)
    .toArray();

  console.log('Recent entries date parsing:');
  recentEntries.forEach((entry, i) => {
    console.log(`\nEntry ${i + 1}:`);
    console.log(`  Raw periodStartDate: ${entry.periodStartDate} (type: ${typeof entry.periodStartDate})`);

    // Simulate the dashboard logic
    let periodStart;
    if (typeof entry.periodStartDate === 'string') {
      periodStart = new Date(entry.periodStartDate + 'T00:00:00Z');
      console.log(`  String parsing: ${periodStart}`);
    } else if (entry.periodStartDate instanceof Date) {
      periodStart = new Date(entry.periodStartDate);
      console.log(`  Date parsing: ${periodStart}`);
    } else {
      periodStart = new Date();
      console.log(`  Fallback: ${periodStart}`);
    }

    const monthKey = periodStart.toISOString().slice(0, 7);
    console.log(`  Month key: ${monthKey}`);
    console.log(`  Rent: ₹${entry.rentCalculated}`);
  });

  // Check if there are entries that should be April
  const allEntries = await db.collection('ledger_entries').find({}).toArray();

  console.log(`\nTotal entries: ${allEntries.length}`);

  const aprilEntries = [];
  allEntries.forEach(entry => {
    let periodStart;
    if (typeof entry.periodStartDate === 'string') {
      periodStart = new Date(entry.periodStartDate + 'T00:00:00Z');
    } else if (entry.periodStartDate instanceof Date) {
      periodStart = new Date(entry.periodStartDate);
    } else {
      periodStart = new Date();
    }

    const monthKey = periodStart.toISOString().slice(0, 7);
    if (monthKey === '2026-04') {
      aprilEntries.push(entry);
    }
  });

  console.log(`\nEntries with month key '2026-04': ${aprilEntries.length}`);

  if (aprilEntries.length > 0) {
    console.log('April entries found:');
    aprilEntries.forEach(entry => {
      console.log(`- ${entry.periodStartDate} -> ₹${entry.rentCalculated}`);
    });
  }

  await client.close();
}

debugDateParsing().catch(console.error);