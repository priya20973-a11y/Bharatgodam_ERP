const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });
const { MongoClient, ObjectId } = require('mongodb');

async function verify() {
  const uri = process.env.MONGODB_URI || process.env.MONGODB_URL;
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || 'wms_production');

  console.log('--- TEST 1: Check existing warehouses without configuration preserve defaults ---');
  const warehouses = await db.collection('warehouses').find({}).toArray();
  const unconfigured = warehouses.find(w => w.platformCommission === undefined && w.ownerEarnings === undefined && (w.warehouseType === undefined || w.warehouseType === 'Owner'));
  console.log('Sample unconfigured warehouse:', unconfigured?.name, 'Type:', unconfigured?.warehouseType || 'Owner (default)');

  console.log('\n--- TEST 2: Update one warehouse to 70% Platform Commission and 30% Owner Earnings ---');
  // Find a warehouse that has inward transactions
  const inward = await db.collection('inwards').findOne({ warehouseId: { $exists: true } });
  if (!inward) {
    console.log('No inward found');
    await client.close();
    return;
  }
  const targetWhId = inward.warehouseId.toString();
  console.log('Target warehouse ID from inward:', targetWhId);

  let targetWh = await db.collection('warehouses').findOne({
    $or: [{ _id: new ObjectId(targetWhId) }, { warehouseId: targetWhId }]
  });
  console.log('Target warehouse name before update:', targetWh?.name, 'pc:', targetWh?.platformCommission, 'oe:', targetWh?.ownerEarnings);

  // Apply update to 70% Platform / 30% Owner
  await db.collection('warehouses').updateOne(
    { _id: targetWh._id },
    {
      $set: {
        warehouseType: 'Owner',
        platformCommission: 70,
        ownerEarnings: 30,
        ownerEquity: 30,
        updatedAt: new Date()
      }
    }
  );

  const updatedWh = await db.collection('warehouses').findOne({ _id: targetWh._id });
  console.log('Target warehouse after update:', {
    name: updatedWh.name,
    warehouseType: updatedWh.warehouseType,
    platformCommission: updatedWh.platformCommission,
    ownerEarnings: updatedWh.ownerEarnings,
    ownerEquity: updatedWh.ownerEquity
  });

  if (updatedWh.platformCommission !== 70 || updatedWh.ownerEarnings !== 30) {
    throw new Error('FAILED: Warehouse did not persist 70% platform / 30% owner');
  }
  console.log('SUCCESS: Warehouse persisted platformCommission = 70, ownerEarnings = 30.');

  await client.close();
}

verify().catch(console.error);
