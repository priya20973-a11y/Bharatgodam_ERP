const { MongoClient } = require('mongodb');

async function checkAllLedgerDates() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  const db = client.db('wms_production');

  console.log('=== CHECKING ALL LEDGER ENTRY DATES ===\n');

  // Get all ledger entries
  const allEntries = await db.collection('ledger_entries').find({}).toArray();

  console.log(`Total ledger entries: ${allEntries.length}\n`);

  // Group by month
  const entriesByMonth = {};

  allEntries.forEach(entry => {
    const dateStr = entry.periodStartDate;
    if (typeof dateStr === 'string' && dateStr.includes('-')) {
      const month = dateStr.substring(0, 7); // YYYY-MM format
      if (!entriesByMonth[month]) {
        entriesByMonth[month] = [];
      }
      entriesByMonth[month].push(entry);
    }
  });

  console.log('Ledger entries by month:');
  Object.keys(entriesByMonth).sort().forEach(month => {
    const count = entriesByMonth[month].length;
    const totalRent = entriesByMonth[month].reduce((sum, entry) => sum + (entry.rentCalculated || 0), 0);
    console.log(`  ${month}: ${count} entries, ₹${totalRent.toLocaleString('en-IN')} total rent`);
  });

  // Check for any entries with April dates
  const aprilEntries = allEntries.filter(entry => {
    const dateStr = entry.periodStartDate;
    return typeof dateStr === 'string' && dateStr.startsWith('2026-04');
  });

  console.log(`\nApril 2026 entries: ${aprilEntries.length}`);

  if (aprilEntries.length > 0) {
    console.log('\nApril entries details:');
    aprilEntries.forEach(entry => {
      console.log(`- Date: ${entry.periodStartDate}, Rent: ₹${entry.rentCalculated}, Created: ${entry.createdAt}`);
    });
  }

  // Check the most recent entries
  console.log('\nMost recent ledger entries:');
  const recentEntries = allEntries
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 10);

  recentEntries.forEach(entry => {
    console.log(`- ${entry.periodStartDate} to ${entry.periodEndDate}: ₹${entry.rentCalculated} (created: ${entry.createdAt})`);
  });

  await client.close();
}

checkAllLedgerDates().catch(console.error);