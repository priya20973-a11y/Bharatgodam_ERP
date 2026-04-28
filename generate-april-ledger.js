const { MongoClient, ObjectId } = require('mongodb');

async function generateAprilLedgerEntries() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  const db = client.db('wms_production');

  console.log('=== GENERATING APRIL 2026 LEDGER ENTRIES ===\n');

  // Get all clients and warehouses for reference
  const allClients = await db.collection('clients').find({}).toArray();
  const clientMap = new Map(allClients.map(c => [c._id.toString(), c.name]));

  const allWarehouses = await db.collection('warehouses').find({}).toArray();
  const warehouseMap = new Map(allWarehouses.map(w => [w._id.toString(), w.name]));

  // Get all commodities for rate calculation
  const allCommodities = await db.collection('commodities').find({}).toArray();
  const commodityMap = new Map(allCommodities.map(c => [c._id.toString(), c]));

  // Find inventory that was active as of March 31st
  // This includes inward transactions that haven't been fully dispatched
  const activeInventory = await db.collection('inwards').find({
    $or: [
      { status: { $in: ['ACTIVE', 'PARTIALLY_DISPATCHED'] } },
      { remainingQuantity: { $gt: 0 } },
      // Also include recent inwards that might still be active
      { date: { $gte: new Date('2026-03-01'), $lte: new Date('2026-03-31') } }
    ]
  }).toArray();

  console.log(`Found ${activeInventory.length} potential inventory items for April billing\n`);

  let aprilEntriesCreated = 0;
  let totalAprilRent = 0;

  for (const inventory of activeInventory) {
    const clientId = inventory.clientId;
    const warehouseId = inventory.warehouseId;
    const commodityId = inventory.commodityId;
    const quantity = inventory.remainingQuantity || inventory.quantity || 0;

    if (!clientId || !warehouseId || !commodityId || quantity <= 0) {
      continue;
    }

    const clientName = clientMap.get(clientId.toString()) || 'Unknown Client';
    const warehouseName = warehouseMap.get(warehouseId.toString()) || 'Unknown Warehouse';
    const commodity = commodityMap.get(commodityId.toString());

    if (!commodity) {
      console.log(`Skipping ${clientName} - commodity not found`);
      continue;
    }

    // Calculate April rent (30 days for April)
    const ratePerMTPerDay = commodity.ratePerMtPerDay ||
                          (commodity.ratePerMtMonth ? commodity.ratePerMtMonth / 30 : 10);

    const aprilRent = quantity * ratePerMTPerDay * 30; // 30 days in April

    // Check if April ledger entry already exists
    const existingAprilEntry = await db.collection('ledger_entries').findOne({
      clientId: clientId,
      warehouseId: warehouseId,
      commodityId: commodityId,
      periodStartDate: '2026-04-01'
    });

    if (existingAprilEntry) {
      console.log(`April entry already exists for ${clientName} - ${warehouseName}`);
      continue;
    }

    // Create April ledger entry
    const aprilEntry = {
      clientId: clientId,
      warehouseId: warehouseId,
      commodityId: commodityId,
      periodStartDate: '2026-04-01',
      periodEndDate: '2026-04-30',
      quantityMT: quantity,
      ratePerMTPerDay: ratePerMTPerDay,
      rentCalculated: Math.round(aprilRent * 100) / 100,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await db.collection('ledger_entries').insertOne(aprilEntry);

    aprilEntriesCreated++;
    totalAprilRent += aprilRent;

    console.log(`✓ Created April entry for ${clientName}`);
    console.log(`  Warehouse: ${warehouseName}`);
    console.log(`  Quantity: ${quantity} MT`);
    console.log(`  April Rent: ₹${aprilRent.toLocaleString('en-IN')}\n`);
  }

  console.log('=== APRIL LEDGER GENERATION SUMMARY ===');
  console.log(`April entries created: ${aprilEntriesCreated}`);
  console.log(`Total April rent generated: ₹${totalAprilRent.toLocaleString('en-IN')}`);

  // Verify the entries were created
  const verifyAprilEntries = await db.collection('ledger_entries').find({
    periodStartDate: '2026-04-01'
  }).toArray();

  console.log(`\nVerification: ${verifyAprilEntries.length} April entries found in database`);

  await client.close();
}

generateAprilLedgerEntries().catch(console.error);