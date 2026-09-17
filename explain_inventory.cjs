const { MongoClient } = require('mongodb');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const uri = process.env.MONGODB_URL || process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB || (uri ? uri.match(/^[^:]+:\/\/[^/]+\/([^?]+)/)?.[1] : 'bharatgodam');
  
  if (!uri) {
    console.error('No MongoDB URI found in .env.local');
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  
  const warehouseId = 'some-warehouse-id';
  
  console.log('--- EXPLAIN PLAN for Dry Transactions ---');
  try {
    const explainDry = await db.collection('transactions').aggregate([
      {
        $match: {
          warehouseId: warehouseId
        }
      },
      {
        $group: {
          _id: '$commodityName',
          totalWeight: {
            $sum: {
              $cond: [
                { $eq: ['$direction', 'OUTWARD'] },
                { $multiply: ['$quantityMT', -1] },
                '$quantityMT'
              ]
            }
          }
        }
      }
    ]).explain('executionStats');
    
    console.log(JSON.stringify(explainDry, null, 2));
  } catch(e) {
    console.error('Error running explain:', e);
  }

  console.log('\n--- EXPLAIN PLAN for ColdInward ---');
  try {
    const explainColdIn = await db.collection('coldinwards').aggregate([
      { $unwind: '$stackAllocations' },
      { $match: { warehouseId: warehouseId } },
      { $group: { _id: '$commodityId', totalKg: { $sum: '$stackAllocations.allocatedWeight' } } }
    ]).explain('executionStats');
    
    console.log(JSON.stringify(explainColdIn, null, 2));
  } catch(e) {
    console.error('Error running explain:', e);
  }

  console.log('\n--- INDEXES for transactions ---');
  try {
    console.log(await db.collection('transactions').indexes());
  } catch(e) { console.error(e); }

  console.log('\n--- INDEXES for coldinwards ---');
  try {
    console.log(await db.collection('coldinwards').indexes());
  } catch(e) { console.error(e); }

  await client.close();
}

run();
