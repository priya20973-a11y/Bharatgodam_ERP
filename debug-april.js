const { MongoClient, ObjectId } = require('mongodb');

async function debugAprilGeneration() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  const db = client.db('wms_production');

  console.log('=== DEBUGGING APRIL LEDGER GENERATION ===\n');

  // Check what inventory data looks like
  const sampleInventory = await db.collection('inwards').find({}).limit(5).toArray();

  console.log('Sample inventory items:');
  sampleInventory.forEach((item, i) => {
    console.log(`${i + 1}. Status: ${item.status}`);
    console.log(`   ClientId: ${item.clientId}`);
    console.log(`   WarehouseId: ${item.warehouseId}`);
    console.log(`   CommodityId: ${item.commodityId}`);
    console.log(`   Quantity: ${item.quantity}, Remaining: ${item.remainingQuantity}`);
    console.log(`   Date: ${item.date}\n`);
  });

  // Check how many have the required fields
  const validInventory = await db.collection('inwards').find({
    clientId: { $exists: true, $ne: null },
    warehouseId: { $exists: true, $ne: null },
    commodityId: { $exists: true, $ne: null },
    $or: [
      { quantity: { $gt: 0 } },
      { remainingQuantity: { $gt: 0 } }
    ]
  }).toArray();

  console.log(`Inventory items with required fields: ${validInventory.length}`);

  // Check if April entries already exist
  const existingAprilEntries = await db.collection('ledger_entries').find({
    periodStartDate: { $regex: /^2026-04/ }
  }).toArray();

  console.log(`Existing April entries: ${existingAprilEntries.length}`);

  if (existingAprilEntries.length > 0) {
    console.log('\nExisting April entries:');
    existingAprilEntries.forEach(entry => {
      console.log(`- ${entry.periodStartDate} to ${entry.periodEndDate}: ₹${entry.rentCalculated}`);
    });
  }

  // Check commodities
  const commodities = await db.collection('commodities').find({}).toArray();
  console.log(`\nCommodities found: ${commodities.length}`);

  commodities.forEach(comm => {
    console.log(`- ${comm.name}: Rate/day: ₹${comm.ratePerMtPerDay}, Rate/month: ₹${comm.ratePerMtMonth}`);
  });

  await client.close();
}

debugAprilGeneration().catch(console.error);