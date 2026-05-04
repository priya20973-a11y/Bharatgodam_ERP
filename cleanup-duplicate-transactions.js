/**
 * Cleanup script to remove duplicate transaction entries
 * This removes bulk upload duplicates for a specific client
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function cleanup() {
  try {
    await mongoose.connect(process.env.MONGODB_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    const db = mongoose.connection.db;
    const transactionsCollection = db.collection('transactions');

    console.log('🧹 Starting cleanup of duplicate transactions...\n');

    // Find duplicate INWARD transactions for Akshay with 30MT on 2025-03-10
    const duplicateInward30 = await transactionsCollection.find({
      direction: 'INWARD',
      clientName: 'Akshay',
      commodityName: 'CASTERSEED',
      quantityMT: 30,
      date: '2025-03-10'
    }).toArray();

    console.log(`Found ${duplicateInward30.length} INWARD 30MT entries on 2025-03-10`);
    if (duplicateInward30.length > 1) {
      console.log('These entries are duplicates. Keeping the first one, deleting the rest...\n');
      
      // Keep the first one, delete the rest
      for (let i = 1; i < duplicateInward30.length; i++) {
        const result = await transactionsCollection.deleteOne({ _id: duplicateInward30[i]._id });
        console.log(`✓ Deleted duplicate INWARD 30MT entry: ${duplicateInward30[i]._id}`);
      }
    }

    // Find errant INWARD transaction on 2025-03-20 with 10MT (should be from ledger split, not transaction)
    const errantInward10 = await transactionsCollection.find({
      direction: 'INWARD',
      clientName: 'Akshay',
      commodityName: 'CASTERSEED',
      quantityMT: 10,
      date: '2025-03-20'
    }).toArray();

    console.log(`\nFound ${errantInward10.length} INWARD 10MT entries on 2025-03-20`);
    if (errantInward10.length > 0) {
      console.log('These should not exist (created from ledger split). Deleting them...\n');
      
      for (const entry of errantInward10) {
        const result = await transactionsCollection.deleteOne({ _id: entry._id });
        console.log(`✓ Deleted errant INWARD 10MT entry: ${entry._id}`);
      }
    }

    console.log('\n✅ Cleanup complete!');
    console.log('\nRemaining transactions for Akshay CASTERSEED:');
    const remaining = await transactionsCollection.find({
      clientName: 'Akshay',
      commodityName: 'CASTERSEED'
    }).toArray();

    remaining.forEach((t, i) => {
      console.log(`${i + 1}. ${t.direction} - ${t.quantityMT}MT - ${t.date}`);
    });

    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Cleanup error:', error);
    process.exit(1);
  }
}

cleanup();
