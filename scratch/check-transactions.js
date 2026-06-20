const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

async function check() {
  let mongoUri = 'mongodb://localhost:27017';
  let dbName = 'wms_production';

  try {
    const envPath = path.join(__dirname, '..', '.env.local');
    if (fs.existsSync(envPath)) {
      const envLines = fs.readFileSync(envPath, 'utf8').split('\n');
      envLines.forEach(line => {
        const parts = line.split('=');
        if (parts.length >= 2) {
          const key = parts[0].trim();
          const val = parts.slice(1).join('=').trim();
          if (key === 'MONGODB_URI') mongoUri = val;
          if (key === 'MONGODB_DB') dbName = val;
        }
      });
    }
  } catch (err) {}

  const client = new MongoClient(mongoUri);
  await client.connect();
  const db = client.db(dbName);

  console.log('=== CHECKING TRANSACTIONS IN JUNE 2026 ===');

  const start = new Date('2026-06-01T00:00:00Z');
  const end = new Date('2026-06-30T23:59:59Z');

  const txns = await db.collection('transactions').find({
    $or: [
      { date: { $gte: start, $lte: end } },
      { inwardDate: { $gte: start, $lte: end } },
      { outwardDate: { $gte: start, $lte: end } },
      { actualOutwardDate: { $gte: start, $lte: end } },
      { date: { $regex: /^2026-06/ } }
    ]
  }).toArray();

  console.log(`Found ${txns.length} transactions:`);
  txns.forEach((t, i) => {
    console.log(`[${i}] ID: ${t._id}`);
    console.log(`    Client ID:    ${t.clientId}`);
    console.log(`    Warehouse ID: ${t.warehouseId}`);
    console.log(`    Commodity ID: ${t.commodityId}`);
    console.log(`    Commodity:    ${t.commodityName}`);
    console.log(`    Direction:    ${t.direction}`);
    console.log(`    Qty (MT):     ${t.quantityMT || t.quantity}`);
    console.log(`    Date:         ${t.date}`);
    console.log(`    Inward Date:  ${t.inwardDate}`);
    console.log(`    Outward Date: ${t.outwardDate}`);
    console.log(`    Actual Outward Date: ${t.actualOutwardDate}`);
  });

  await client.close();
}

check().catch(console.error);
