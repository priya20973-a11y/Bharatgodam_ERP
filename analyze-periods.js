const { MongoClient } = require('mongodb');

async function analyzeLedgerPeriods() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  const db = client.db('wms_production');

  console.log('=== ANALYZING LEDGER PERIODS ===\n');

  const allEntries = await db.collection('ledger_entries').find({}).toArray();
  console.log(`Total ledger entries: ${allEntries.length}\n`);

  // Analyze period spans
  const spanningEntries = [];
  const marchEntries = [];
  const aprilEntries = [];

  allEntries.forEach(entry => {
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
      endDate = null; // Ongoing
    }

    const startMonth = startDate.toISOString().slice(0, 7);
    const endMonth = endDate ? endDate.toISOString().slice(0, 7) : null;

    if (startMonth === '2026-03') {
      marchEntries.push({ entry, startDate, endDate, startMonth, endMonth });
    } else if (startMonth === '2026-04') {
      aprilEntries.push({ entry, startDate, endDate, startMonth, endMonth });
    }

    if (endMonth && startMonth !== endMonth) {
      spanningEntries.push({ entry, startDate, endDate, startMonth, endMonth });
    }
  });

  console.log(`March entries: ${marchEntries.length}`);
  console.log(`April entries: ${aprilEntries.length}`);
  console.log(`Entries spanning months: ${spanningEntries.length}\n`);

  if (spanningEntries.length > 0) {
    console.log('Entries spanning multiple months:');
    spanningEntries.forEach(({ entry, startDate, endDate, startMonth, endMonth }) => {
      console.log(`- ${startMonth} to ${endMonth}: ₹${entry.rentCalculated} (${startDate.toDateString()} to ${endDate ? endDate.toDateString() : 'ongoing'})`);
    });
    console.log('');
  }

  // Check March entries that might extend into April
  const marchExtendingIntoApril = marchEntries.filter(({ endDate }) => {
    return endDate && endDate.getMonth() === 3 && endDate.getFullYear() === 2026; // April
  });

  console.log(`March entries ending in April: ${marchExtendingIntoApril.length}`);

  if (marchExtendingIntoApril.length > 0) {
    console.log('March entries that extend into April:');
    marchExtendingIntoApril.forEach(({ entry, startDate, endDate }) => {
      const marchDays = Math.ceil((new Date('2026-03-31T23:59:59Z') - startDate) / (1000 * 60 * 60 * 24));
      const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
      const marchRent = (entry.rentCalculated * marchDays) / totalDays;

      console.log(`- ${startDate.toDateString()} to ${endDate.toDateString()}: Total ₹${entry.rentCalculated}, March portion: ₹${marchRent.toFixed(2)} (${marchDays}/${totalDays} days)`);
    });
  }

  await client.close();
}

analyzeLedgerPeriods().catch(console.error);