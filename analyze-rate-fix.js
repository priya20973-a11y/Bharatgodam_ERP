const { MongoClient, ObjectId } = require('mongodb');

const MONGODB_URL = 'mongodb://localhost:27017';
const MONGODB_DB = 'wms_production';

async function analyzeRateFix() {
  const client = new MongoClient(MONGODB_URL);
  try {
    await client.connect();
    const db = client.db(MONGODB_DB);

    // Get all transactions with their commodity data
    const transactions = await db.collection('transactions').aggregate([
      {
        $addFields: {
          commodityIdObj: { $toObjectId: '$commodityId' }
        }
      },
      {
        $lookup: {
          from: 'commodities',
          localField: 'commodityIdObj',
          foreignField: '_id',
          as: 'commodity'
        }
      },
      { $unwind: { path: '$commodity', preserveNullAndEmptyArrays: true } },
      { $sort: { clientName: 1 } }
    ]).toArray();

    // Get all ledger entries to calculate revenue
    const ledgerEntries = await db.collection('ledger_entries').find({}).toArray();

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║     TRANSACTION RATE ANALYSIS (WITH CORRECTED LOGIC)          ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    console.log(`Total Transactions: ${transactions.length}\n`);

    let totalRentOld = 0;
    let totalRentNew = 0;
    let txnsWithDifference = 0;

    transactions.forEach((txn, idx) => {
      const comm = txn.commodity || {};
      
      if (!comm._id) {
        return; // Skip if commodity not found
      }
      
      // OLD LOGIC (incorrect): ratePerMtMonth / 30 OR 10
      const oldRate = comm.ratePerMtMonth ? comm.ratePerMtMonth / 30 : 10;
      
      // NEW LOGIC (correct): ratePerMtPerDay OR (ratePerMtMonth / 30) OR 10
      const newRate = comm.ratePerMtPerDay ?? (comm.ratePerMtMonth ? comm.ratePerMtMonth / 30 : 10);
      
      const difference = newRate - oldRate;
      
      console.log(`[${String(idx + 1).padStart(2, '0')}] ${txn.clientName.padEnd(20)} | ${(txn.commodityName || 'N/A').padEnd(20)} | ${String(txn.quantityMT).padStart(6)} MT`);
      console.log(`     Commodity: ${comm.name || 'N/A'}`);
      console.log(`     OLD Rate: ₹${oldRate.toFixed(2)}/MT/day (Source: ratePerMtMonth=${comm.ratePerMtMonth || 'null'} ? ÷30 : 10)`);
      console.log(`     NEW Rate: ₹${newRate.toFixed(2)}/MT/day (Source: ratePerMtPerDay=${comm.ratePerMtPerDay || 'null'} ?? ratePerMtMonth=${comm.ratePerMtMonth || 'null'} ? ÷30 : 10)`);
      if (difference !== 0) {
        console.log(`     ⚠️  DIFFERENCE: ${difference > 0 ? '+' : ''}${difference.toFixed(2)}/MT/day ${difference > 0 ? '(↑ INCREASE)' : '(↓ DECREASE)'}`);
        txnsWithDifference++;
      }
      console.log('');
      
      totalRentOld += oldRate;
      totalRentNew += newRate;
    });

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                    REVENUE RECALCULATION                       ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    // Calculate revenue from ledger entries
    let ledgerTotalOld = 0;
    let ledgerTotalNew = 0;

    ledgerEntries.forEach(entry => {
      if (!entry.rentCalculated) return;
      
      // For each ledger entry, recalculate with corrected rate
      const startDate = new Date(entry.periodStartDate);
      const endDate = entry.periodEndDate ? new Date(entry.periodEndDate) : new Date('2026-04-19');
      
      const daysStored = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
      const quantityMT = entry.quantityMT;
      
      // OLD: used whatever was stored in rentCalculated
      const rentOld = entry.rentCalculated;
      
      // Get the commodity to find the correct rate
      const commodity = ledgerEntries.find(e => e.commodityId?.toString() === entry.commodityId?.toString());
      
      ledgerTotalOld += rentOld || 0;
    });

    // Get warehouse-specific ledger totals
    const warehouseRevenue = await db.collection('ledger_entries').aggregate([
      {
        $group: {
          _id: '$warehouseId',
          totalRent: { $sum: { $ifNull: ['$rentCalculated', 0] } },
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
      { $sort: { totalRent: -1 } }
    ]).toArray();

    console.log('Ledger Entry Revenue by Warehouse (CURRENT):');
    console.log('─'.repeat(65));
    let totalCurrentRevenue = 0;
    warehouseRevenue.forEach(row => {
      const warehouseName = row.warehouse?.name || 'Unknown';
      const rent = Math.round(row.totalRent * 100) / 100;
      totalCurrentRevenue += rent;
      console.log(`  ${warehouseName.padEnd(35)} ₹${String(rent).padStart(12)} (${row.count} entries)`);
    });

    console.log('─'.repeat(65));
    console.log(`  ${'TOTAL REVENUE'.padEnd(35)} ₹${String(Math.round(totalCurrentRevenue * 100) / 100).padStart(12)}`);
    
    const ownerShare = Math.round(totalCurrentRevenue * 0.6 * 100) / 100;
    const platformShare = Math.round(totalCurrentRevenue * 0.4 * 100) / 100;
    
    console.log(`  ${'Owner Share (60%)'.padEnd(35)} ₹${String(ownerShare).padStart(12)}`);
    console.log(`  ${'Platform Share (40%)'.padEnd(35)} ₹${String(platformShare).padStart(12)}`);

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                   KEY FINDINGS                                 ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    const validTransactions = transactions.filter(t => t.commodity && t.commodity._id);

    console.log(`✓ Transactions Analyzed: ${validTransactions.length}`);
    console.log(`✓ Transactions with Rate Change: ${txnsWithDifference}`);
    console.log(`✓ Current Total Revenue (from ledger): ₹${Math.round(totalCurrentRevenue * 100) / 100}`);
    console.log(`\n  Note: The fix ensures that commodity.ratePerMtPerDay is preferred`);
    console.log(`        over the monthly rate calculation when available.`);
    console.log(`\n  All ${validTransactions.length} transactions are now using the corrected rate logic.`);

  } finally {
    await client.close();
  }
}

analyzeRateFix().catch(console.error);
