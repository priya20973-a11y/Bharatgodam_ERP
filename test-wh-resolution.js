const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });
const { MongoClient, ObjectId } = require('mongodb');

async function test() {
  const uri = process.env.MONGODB_URI || process.env.MONGODB_URL;
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || 'wms_production');

  const allInwards = await db.collection('inwards').find({}).toArray();
  const warehouseIds = new Set();
  allInwards.forEach(i => {
    if (i.warehouseId) warehouseIds.add(i.warehouseId.toString());
  });
  console.log('Unique warehouseIds from inwards:', Array.from(warehouseIds));

  const objectIds = Array.from(warehouseIds).map(id => {
    try { return new ObjectId(id); } catch(e) { return null; }
  }).filter(Boolean);

  const warehouses = await db.collection('warehouses').find({ _id: { $in: objectIds } }).toArray();
  console.log('Warehouses matched:', warehouses.map(w => ({ id: w._id.toString(), name: w.name, pc: w.platformCommission, oe: w.ownerEarnings })));

  await client.close();
}
test().catch(console.error);
