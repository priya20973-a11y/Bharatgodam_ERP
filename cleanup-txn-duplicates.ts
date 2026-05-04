/**
 * Cleanup duplicate transactions using getDb
 */
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '.env.local') });
dotenv.config({ path: path.resolve(__dirname, '.env') });

async function cleanup() {
  try {
    const { getDb } = await import('./lib/mongodb.ts');
    const db = await getDb();

    console.log('🧹 Starting cleanup of duplicate transactions for Akshay CASTERSEED...\n');

    // Get all transactions for Akshay CASTERSEED
    const allTransactions = await db.collection('transactions').find({
      clientName: 'Akshay',
      commodityName: 'CASTERSEED'
    }).toArray();

    console.log(`Total transactions found: ${allTransactions.length}\n`);
    console.log('Current transactions:');
    allTransactions.forEach((t, i) => {
      console.log(`${i + 1}. ${t.direction} - ${t.quantityMT}MT - ${t.date} - GatePass: ${t.gatePass || 'N/A'}`);
    });

    // We should only have:
    // 1. INWARD 30MT on 2025-03-10 with GatePass 554
    // 2. OUTWARD 10MT on 2025-03-20 with GatePass 555

    // Find duplicates to remove
    const keysToKeep = new Set();
    const idsToDelete = [];

    for (const txn of allTransactions) {
      const key = `${txn.direction}|${txn.quantityMT}|${txn.date}`;
      
      if (keysToKeep.has(key)) {
        // This is a duplicate
        idsToDelete.push(txn._id);
        console.log(`\n⚠️  Marking for deletion (DUPLICATE): ${txn.direction} ${txn.quantityMT}MT on ${txn.date}`);
      } else {
        keysToKeep.add(key);
        console.log(`\n✓ Keeping: ${txn.direction} ${txn.quantityMT}MT on ${txn.date}`);
      }
    }

    if (idsToDelete.length > 0) {
      console.log(`\n\nDeleting ${idsToDelete.length} duplicate entries...`);
      const result = await db.collection('transactions').deleteMany({
        _id: { $in: idsToDelete }
      });
      console.log(`✅ Deleted ${result.deletedCount} duplicate transactions\n`);
    } else {
      console.log('\n\n✅ No duplicates found!\n');
    }

    // Show final state
    const finalTransactions = await db.collection('transactions').find({
      clientName: 'Akshay',
      commodityName: 'CASTERSEED'
    }).toArray();

    console.log('Final transactions:');
    finalTransactions.forEach((t, i) => {
      console.log(`${i + 1}. ${t.direction} - ${t.quantityMT}MT - ${t.date}`);
    });

    console.log('\n✅ Cleanup complete!');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

cleanup();
