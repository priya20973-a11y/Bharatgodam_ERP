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
  
  const warehouseId = 'some-warehouse-id'; // just for plan test
  
  console.log('--- BEFORE: EXPLAIN PLAN for Dry Transactions ---');
  let explainBefore = await db.collection('transactions').aggregate([
    { $match: { warehouseId: warehouseId } },
    { $group: { _id: '$commodityName', totalWeight: { $sum: 1 } } }
  ]).explain('executionStats');
  
  console.log('executionTimeMillis:', explainBefore.executionStats?.executionTimeMillis ?? explainBefore.stages?.[0]?.$cursor?.executionStats?.executionTimeMillis);
  console.log('stage:', explainBefore.stages?.[0]?.$cursor?.queryPlanner?.winningPlan?.stage ?? explainBefore.queryPlanner?.winningPlan?.stage);
  
  console.log('\n--- CREATING INDEX ---');
  const indexName = await db.collection('transactions').createIndex({ warehouseId: 1, date: 1, wspId: 1 });
  console.log('Created index:', indexName);
  
  console.log('\n--- AFTER: EXPLAIN PLAN for Dry Transactions ---');
  let explainAfter = await db.collection('transactions').aggregate([
    { $match: { warehouseId: warehouseId } },
    { $group: { _id: '$commodityName', totalWeight: { $sum: 1 } } }
  ]).explain('executionStats');
  
  console.log('executionTimeMillis:', explainAfter.executionStats?.executionTimeMillis ?? explainAfter.stages?.[0]?.$cursor?.executionStats?.executionTimeMillis);
  console.log('stage:', explainAfter.stages?.[0]?.$cursor?.queryPlanner?.winningPlan?.inputStage?.stage ?? explainAfter.queryPlanner?.winningPlan?.inputStage?.stage);

  await client.close();
}

run();
