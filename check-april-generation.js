const { MongoClient } = require('mongodb');

async function checkAprilLedgerGeneration() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  const db = client.db('wms_production');

  console.log('=== CHECKING APRIL LEDGER GENERATION ===\n');

  // Check if there are any April ledger entries at all
  const allAprilEntries = await db.collection('ledger_entries').find({
    $or: [
      { periodStartDate: { $regex: /2026-04/ } },
      { periodStartDate: { $gte: '2026-04-01' } }
    ]
  }).toArray();

  console.log(`Total April 2026 ledger entries: ${allAprilEntries.length}`);

  // Check inventory that should generate April billing
  const activeInventory = await db.collection('inwards').find({
    $or: [
      { status: 'ACTIVE' },
      { status: 'PARTIALLY_DISPATCHED' },
      { remainingQuantity: { $gt: 0 } }
    ]
  }).toArray();

  console.log(`\nActive inventory items: ${activeInventory.length}`);

  // Check if there's a script to generate April ledger entries
  const fs = require('fs');
  const path = require('path');

  const scripts = [
    'generate-rice-ledger-fixed.js',
    'generate-rice-ledger.js',
    'month-split.js',
    'create-collections.js'
  ];

  console.log('\n🔧 CHECKING LEDGER GENERATION SCRIPTS:');

  for (const script of scripts) {
    const scriptPath = path.join(process.cwd(), script);
    if (fs.existsSync(scriptPath)) {
      console.log(`✓ ${script} exists`);
      const content = fs.readFileSync(scriptPath, 'utf8');
      if (content.includes('2026-04') || content.includes('April')) {
        console.log(`  - Contains April 2026 references`);
      } else {
        console.log(`  - No April 2026 references found`);
      }
    } else {
      console.log(`✗ ${script} not found`);
    }
  }

  // Check what the latest ledger generation date is
  const latestLedgerEntry = await db.collection('ledger_entries').findOne(
    {},
    { sort: { createdAt: -1 } }
  );

  if (latestLedgerEntry) {
    console.log(`\n📅 Latest ledger entry created: ${latestLedgerEntry.createdAt}`);
    console.log(`Period: ${latestLedgerEntry.periodStartDate} to ${latestLedgerEntry.periodEndDate}`);
  }

  // Check if April ledger entries need to be generated
  console.log('\n💡 APRIL LEDGER GENERATION REQUIRED:');
  console.log(`Based on user's explanation:`);
  console.log(`1. March billing covers rent till March 31st`);
  console.log(`2. Inventory remaining after March 31st needs April billing`);
  console.log(`3. Need to run ledger generation for April 2026`);

  if (activeInventory.length > 0) {
    console.log(`\n📦 ${activeInventory.length} active inventory items found that may need April billing`);
  }

  console.log('\n🔧 SOLUTION:');
  console.log('Run the ledger generation script for April 2026 to create');
  console.log('billing entries for inventory that remained after March 31st.');

  await client.close();
}

checkAprilLedgerGeneration().catch(console.error);