const { MongoClient, ObjectId } = require('mongodb');

async function checkAprilEntries() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  const db = client.db('wms_production');

  console.log('=== CHECKING APRIL ENTRIES ===\n');

  // Get April entries
  const aprilEntries = await db.collection('ledger_entries').find({
    periodStartDate: {
      $gte: new Date('2026-04-01'),
      $lt: new Date('2026-05-01')
    }
  }).toArray();

  console.log(`Found ${aprilEntries.length} April entries\n`);

  // Show first few entries
  aprilEntries.slice(0, 3).forEach((entry, i) => {
    console.log(`Entry ${i + 1}:`);
    console.log(`  clientId: ${entry.clientId}`);
    console.log(`  warehouseId: ${entry.warehouseId}`);
    console.log(`  commodityId: ${entry.commodityId}`);
    console.log(`  periodStartDate: ${entry.periodStartDate}`);
    console.log(`  periodEndDate: ${entry.periodEndDate}`);
    console.log(`  rentCalculated: ${entry.rentCalculated}`);
    console.log(`  createdAt: ${entry.createdAt}`);
    console.log('');
  });

  // Check if they have inward references
  const inwardIds = aprilEntries
    .map(entry => entry.inwardId)
    .filter(id => id)
    .map(id => id.toString());

  console.log(`April entries with inwardId: ${inwardIds.length}`);

  if (inwardIds.length > 0) {
    // Check corresponding inwards
    const inwards = await db.collection('inwards').find({
      _id: { $in: inwardIds.map(id => new ObjectId(id)) }
    }).toArray();

    console.log(`Found ${inwards.length} corresponding inward records`);

    if (inwards.length > 0) {
      console.log('\nSample inward record:');
      const inward = inwards[0];
      console.log(`  clientId: ${inward.clientId}`);
      console.log(`  warehouseId: ${inward.warehouseId}`);
      console.log(`  commodityId: ${inward.commodityId}`);
    }
  }

  await client.close();
}

checkAprilEntries().catch(console.error);