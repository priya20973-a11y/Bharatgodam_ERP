const { MongoClient } = require('mongodb');

async function analyzeAprilBillingLogic() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  const db = client.db('wms_production');

  console.log('=== APRIL BILLING LOGIC ANALYSIS ===\n');

  // Get all clients for reference
  const allClients = await db.collection('clients').find({}).toArray();
  const clientMap = new Map(allClients.map(c => [c._id.toString(), c.name]));

  // Get all ledger entries to understand the billing pattern
  const allLedgerEntries = await db.collection('ledger_entries').find({}).limit(50).toArray();

  console.log('📊 SAMPLE LEDGER ENTRIES ANALYSIS:\n');

  allLedgerEntries.forEach((entry, i) => {
    const clientName = clientMap.get(entry.clientId?.toString()) || 'Unknown';
    const periodStart = entry.periodStartDate;
    const periodEnd = entry.periodEndDate;
    const rent = entry.rentCalculated || 0;

    console.log(`${i + 1}. ${clientName}`);
    console.log(`   Period: ${periodStart} to ${periodEnd}`);
    console.log(`   Rent: ₹${rent.toLocaleString('en-IN')}`);
    console.log(`   Commodity: ${entry.commodityId}`);
    console.log('');
  });

  // Check for entries that might be April billing
  console.log('🔍 CHECKING FOR APRIL BILLING PATTERNS:\n');

  // Look for entries with periodStartDate in April
  const aprilEntries = await db.collection('ledger_entries').find({
    periodStartDate: { $regex: /^2026-04/ }
  }).toArray();

  console.log(`April 2026 entries (periodStartDate starts with 2026-04): ${aprilEntries.length}`);

  // Look for entries with periodEndDate in April or beyond March 31st
  const entriesEndingAfterMarch = await db.collection('ledger_entries').find({
    $or: [
      { periodEndDate: { $gte: '2026-04-01' } },
      { periodEndDate: null } // Ongoing entries
    ]
  }).toArray();

  console.log(`Entries ending on/after April 1st or ongoing: ${entriesEndingAfterMarch.length}`);

  // Check inventory data to understand what should be billed for April
  const inventoryData = await db.collection('inwards').find({
    status: { $in: ['ACTIVE', 'PARTIALLY_DISPATCHED'] }
  }).limit(20).toArray();

  console.log(`\n📦 CURRENT INVENTORY STATUS:\n`);
  console.log(`Active inventory items: ${inventoryData.length}`);

  inventoryData.forEach((item, i) => {
    const clientName = clientMap.get(item.clientId?.toString()) || 'Unknown';
    console.log(`${i + 1}. ${clientName} - ${item.commodityName || item.commodityId}`);
    console.log(`   Quantity: ${item.remainingQuantity || item.quantity} ${item.unit || 'units'}`);
    console.log(`   Warehouse: ${item.warehouseId}`);
    console.log(`   Date: ${item.date || item.createdAt}`);
    console.log('');
  });

  // Check if there are any ledger entries that should be considered April billing
  console.log('💡 APRIL BILLING LOGIC:\n');
  console.log('Based on user explanation:');
  console.log('1. March billing covers rent till March 31st');
  console.log('2. Inventory remaining after March 31st should be billed for April');
  console.log('3. Need to check if there are ongoing ledger entries that extend into April');

  // Look for entries that might represent April billing
  const potentialAprilEntries = await db.collection('ledger_entries').find({
    $or: [
      { periodStartDate: { $gte: '2026-04-01' } },
      { periodEndDate: { $gte: '2026-04-01' } },
      { periodEndDate: null } // Ongoing entries that might continue into April
    ]
  }).toArray();

  console.log(`\nPotential April billing entries: ${potentialAprilEntries.length}`);

  if (potentialAprilEntries.length > 0) {
    console.log('\nPotential April entries:');
    potentialAprilEntries.forEach((entry, i) => {
      const clientName = clientMap.get(entry.clientId?.toString()) || 'Unknown';
      console.log(`${i + 1}. ${clientName}: ${entry.periodStartDate} to ${entry.periodEndDate} - ₹${(entry.rentCalculated || 0).toLocaleString('en-IN')}`);
    });
  }

  console.log('\n🔧 RECOMMENDATION:');
  console.log('The April billing logic needs to be updated to:');
  console.log('1. Calculate rent for inventory that remains after March 31st');
  console.log('2. Create April ledger entries for ongoing storage');
  console.log('3. Update the dashboard to show correct April amounts');

  await client.close();
}

analyzeAprilBillingLogic().catch(console.error);