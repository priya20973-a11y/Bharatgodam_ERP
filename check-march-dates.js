const { MongoClient } = require('mongodb');

async function checkMarchDates() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  const db = client.db('wms_production');

  console.log('=== CHECKING MARCH ENTRY DATES ===\n');

  const marchEntries = await db.collection('ledger_entries').find({
    periodStartDate: {
      $gte: new Date('2026-03-01'),
      $lt: new Date('2026-04-01')
    }
  }).toArray();

  console.log(`March entries: ${marchEntries.length}\n`);

  // Check dates and rent
  marchEntries.forEach((entry, i) => {
    let startDate, endDate;

    if (typeof entry.periodStartDate === 'string') {
      startDate = new Date(entry.periodStartDate + 'T00:00:00Z');
    } else if (entry.periodStartDate instanceof Date) {
      startDate = new Date(entry.periodStartDate);
    }

    if (typeof entry.periodEndDate === 'string') {
      endDate = new Date(entry.periodEndDate + 'T00:00:00Z');
    } else if (entry.periodEndDate instanceof Date) {
      endDate = new Date(entry.periodEndDate);
    } else {
      endDate = null;
    }

    console.log(`${i + 1}. Start: ${startDate.toDateString()}, End: ${endDate ? endDate.toDateString() : 'ongoing'}, Rent: ₹${entry.rentCalculated}`);

    // Check if end date is after March 31st
    if (endDate && (endDate > new Date('2026-03-31T23:59:59Z'))) {
      console.log(`   ⚠️  End date is after March 31st!`);
    }
  });

  // Check commodities and rates
  const commodities = await db.collection('commodities').find({}).toArray();
  const commodityMap = new Map(commodities.map(c => [c._id.toString(), c]));

  console.log(`\nCommodities found: ${commodities.length}`);

  // Sample commodity rates
  commodities.slice(0, 3).forEach(comm => {
    console.log(`- ${comm.name}: ₹${comm.ratePerMtPerDay || comm.ratePerMtMonth}/day`);
  });

  await client.close();
}

checkMarchDates().catch(console.error);