import { getDb } from './lib/mongodb.js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function run() {
  const db = await getDb();
  
  const warehouseId = 'some-warehouse-id'; // using a dummy or real id doesn't matter for explain plan structure
  
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

  process.exit(0);
}

run();
