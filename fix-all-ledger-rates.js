const { MongoClient, ObjectId } = require('mongodb');

const MONGODB_URL = 'mongodb://localhost:27017';
const MONGODB_DB = 'wms_production';

async function fixAllLedgerRates() {
  const client = new MongoClient(MONGODB_URL);
  try {
    await client.connect();
    const db = client.db(MONGODB_DB);

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║          FIXING LEDGER RATES FOR ALL WAREHOUSES                ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    // Get all commodities and create a rate map
    const commodities = await db.collection('commodities').find({}).toArray();
    const commRateMap = new Map();
    commodities.forEach(c => {
      const dailyRate = c.ratePerMtPerDay ?? (c.ratePerMtMonth ? c.ratePerMtMonth / 30 : 10);
      commRateMap.set(c._id.toString(), dailyRate);
      commRateMap.set(c.name, dailyRate);
    });

    console.log(`Commodity map loaded: ${commodities.length} commodities\n`);

    // Get all ledger entries
    const allEntries = await db.collection('ledger_entries').find({}).toArray();
    console.log(`Total ledger entries: ${allEntries.length}\n`);

    let updatedCount = 0;
    let errorCount = 0;
    const updateOps = [];

    // Process each entry
    allEntries.forEach((entry, idx) => {
      try {
        // Find correct rate from commodity
        let correctRate = 10; // fallback
        
        if (entry.commodityId) {
          correctRate = commRateMap.get(entry.commodityId.toString()) || 10;
        } else if (entry.commodityName) {
          correctRate = commRateMap.get(entry.commodityName) || 10;
        }

        const currentRate = entry.ratePerMTPerDay || 10;

        // Only update if rate is different
        if (currentRate !== correctRate) {
          const daysStored = entry.daysStored || 
            (entry.periodEndDate 
              ? Math.ceil((new Date(entry.periodEndDate) - new Date(entry.periodStartDate)) / (1000 * 60 * 60 * 24)) + 1
              : 1);
          
          const quantityMT = entry.quantityMT || 0;
          const correctedRent = Math.round(quantityMT * daysStored * correctRate * 100) / 100;

          updateOps.push({
            updateOne: {
              filter: { _id: entry._id },
              update: {
                $set: {
                  ratePerMTPerDay: correctRate,
                  rentCalculated: correctedRent,
                  updatedAt: new Date(),
                  rateFixedAt: new Date()
                }
              }
            }
          });

          console.log(`[${idx + 1}/${allEntries.length}] ${entry.commodityName || 'Unknown'} | Warehouse: ${entry.warehouseName || 'N/A'}`);
          console.log(`  OLD: ₹${currentRate}/MT/day → Rent: ₹${entry.rentCalculated || 0}`);
          console.log(`  NEW: ₹${correctRate}/MT/day → Rent: ₹${correctedRent}`);
          console.log(`  Qty: ${quantityMT} MT × ${daysStored} days\n`);
          
          updatedCount++;
        }
      } catch (err) {
        console.error(`Error processing entry ${idx + 1}:`, err.message);
        errorCount++;
      }
    });

    if (updateOps.length > 0) {
      console.log(`\nApplying ${updateOps.length} updates to database...\n`);
      const result = await db.collection('ledger_entries').bulkWrite(updateOps);
      console.log(`Updated: ${result.modifiedCount}`);
      console.log(`Matched: ${result.matchedCount}`);
    } else {
      console.log('No updates needed. All rates are already correct.');
    }

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                    SUMMARY                                     ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    // Get updated revenue by warehouse
    const revenue = await db.collection('ledger_entries').aggregate([
      {
        $group: {
          _id: '$warehouseId',
          totalRevenue: { $sum: { $ifNull: ['$rentCalculated', 0] } },
          count: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'warehouses',
          localField: '_id',
          foreignField: '_id',
          as: 'warehouse'
        }
      },
      { $unwind: { path: '$warehouse', preserveNullAndEmptyArrays: true } },
      { $sort: { totalRevenue: -1 } }
    ]).toArray();

    let newTotal = 0;
    revenue.forEach(row => {
      const warehouseName = row.warehouse?.name || 'Unknown';
      const rent = Math.round(row.totalRevenue * 100) / 100;
      newTotal += rent;
      console.log(`  ${warehouseName.padEnd(35)} ₹${String(rent).padStart(12)} (${row.count} entries)`);
    });

    console.log('─'.repeat(65));
    console.log(`  ${'NEW TOTAL REVENUE'.padEnd(35)} ₹${String(Math.round(newTotal * 100) / 100).padStart(12)}`);
    
    const ownerShare = Math.round(newTotal * 0.6 * 100) / 100;
    const platformShare = Math.round(newTotal * 0.4 * 100) / 100;
    
    console.log(`  ${'Owner Share (60%)'.padEnd(35)} ₹${String(ownerShare).padStart(12)}`);
    console.log(`  ${'Platform Share (40%)'.padEnd(35)} ₹${String(platformShare).padStart(12)}`);

    console.log('\n✓ Updates applied: ' + updateOps.length);
    console.log('✓ Errors encountered: ' + errorCount);

  } finally {
    await client.close();
  }
}

fixAllLedgerRates().catch(console.error);
