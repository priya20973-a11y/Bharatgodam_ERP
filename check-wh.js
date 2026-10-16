const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });
const { MongoClient } = require('mongodb');

async function test() {
  const uri = process.env.MONGODB_URI || process.env.MONGODB_URL;
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || 'wms_production');
  const warehouses = await db.collection('warehouses').find({}).toArray();
  for (const w of warehouses) {
    if (w.platformCommission !== undefined || w.ownerEarnings !== undefined || w.warehouseType !== undefined || w.ownerEquity !== undefined) {
      console.log('Found warehouse with split:', w.name, {
        warehouseType: w.warehouseType,
        platformCommission: w.platformCommission,
        ownerEarnings: w.ownerEarnings,
        ownerEquity: w.ownerEquity
      });
    }
  }
  await client.close();
}
test().catch(console.error);
