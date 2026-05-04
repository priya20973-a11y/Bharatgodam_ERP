const { MongoClient } = require('mongodb');

const MONGODB_URL = 'mongodb://localhost:27017';
const DB_NAME = 'wms_production';

async function cleanup() {
  const client = new MongoClient(MONGODB_URL);
  
  try {
    await client.connect();
    console.log('✓ Connected to MongoDB\n');
    
    const db = client.db(DB_NAME);
    const transactionsCol = db.collection('transactions');

    console.log('🧹 Cleaning up duplicate transactions for Akshay CASTERSEED...\n');

    // Get all transactions for Akshay CASTERSEED
    const allTransactions = await transactionsCol.find({
      clientName: 'Akshay',
      commodityName: 'CASTERSEED'
    }).sort({ date: 1 }).toArray();

    console.log(`Total transactions found: ${allTransactions.length}\n`);
    console.log('Current transactions:');
    allTransactions.forEach((t, i) => {
      console.log(`${i + 1}. ${t.direction} - ${t.quantityMT}MT - ${t.date} - GatePass: ${t.gatePass || 'N/A'} - Source: ${t.source || 'MANUAL'}`);
    });

    // We should only have:
    // 1. INWARD 30MT on 2025-03-10
    // 2. OUTWARD 10MT on 2025-03-20

    // Strategy: Keep only one of each unique (direction, quantityMT, date) combination
    // Prefer the ones with source='BULK_UPLOAD', otherwise keep first occurrence
    
    const seenKeys = {};
    const idsToDelete = [];

    for (const txn of allTransactions) {
      const key = `${txn.direction}|${txn.quantityMT}|${txn.date}`;
      
      if (!seenKeys[key]) {
        // First occurrence - keep this
        seenKeys[key] = txn._id;
        console.log(`\n✓ Keeping: ${txn.direction} ${txn.quantityMT}MT on ${txn.date}`);
      } else {
        // Duplicate - mark for deletion
        idsToDelete.push(txn._id);
        console.log(`\n❌ Marking for deletion (DUPLICATE): ${txn.direction} ${txn.quantityMT}MT on ${txn.date}`);
      }
    }

    if (idsToDelete.length > 0) {
      console.log(`\n\nDeleting ${idsToDelete.length} duplicate transaction(s)...`);
      const result = await transactionsCol.deleteMany({
        _id: { $in: idsToDelete }
      });
      console.log(`✅ Deleted ${result.deletedCount} duplicate transactions\n`);
    } else {
      console.log('\n\n✅ No duplicates found!\n');
    }

    // Show final state
    const finalTransactions = await transactionsCol.find({
      clientName: 'Akshay',
      commodityName: 'CASTERSEED'
    }).sort({ date: 1 }).toArray();

    console.log('Final transactions:');
    finalTransactions.forEach((t, i) => {
      console.log(`${i + 1}. ${t.direction} - ${t.quantityMT}MT - ${t.date}`);
    });

    console.log('\n✅ Cleanup complete!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

cleanup();
