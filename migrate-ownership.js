const { MongoClient, ObjectId } = require('mongodb');

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017';
const MONGODB_DB = process.env.MONGODB_DB || 'wms_production';

async function migrateOwnership() {
  const client = new MongoClient(MONGODB_URL);
  try {
    await client.connect();
    const db = client.db(MONGODB_DB);

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║  MIGRATE OWNERSHIP FOR EXISTING TRANSACTIONS                  ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    // Find the user
    const user = await db.collection('users').findOne({ email: 'bharatgodam.techsolutions@gmail.com' });
    if (!user) {
      console.log('❌ User not found');
      return;
    }

    const userId = user._id;
    const userEmail = user.email;

    console.log(`✓ Found user: ${userEmail} (ID: ${userId})`);

    // Update transactions collection
    const transactionsResult = await db.collection('transactions').updateMany(
      { userId: { $exists: false } },
      { $set: { userId: userId, userEmail: userEmail } }
    );
    console.log(`✓ Updated ${transactionsResult.modifiedCount} transactions`);

    // Update inwards collection
    const inwardsResult = await db.collection('inwards').updateMany(
      { userId: { $exists: false } },
      { $set: { userId: userId, userEmail: userEmail } }
    );
    console.log(`✓ Updated ${inwardsResult.modifiedCount} inwards`);

    // Update outwards collection
    const outwardsResult = await db.collection('outwards').updateMany(
      { userId: { $exists: false } },
      { $set: { userId: userId, userEmail: userEmail } }
    );
    console.log(`✓ Updated ${outwardsResult.modifiedCount} outwards`);

    // Update stock_entries collection
    const stockEntriesResult = await db.collection('stock_entries').updateMany(
      { userId: { $exists: false } },
      { $set: { userId: userId, userEmail: userEmail } }
    );
    console.log(`✓ Updated ${stockEntriesResult.modifiedCount} stock_entries`);

    console.log('\n✅ Ownership migration completed!');
    console.log('Old transactions now belong to bharatgodam.techsolutions@gmail.com');
    console.log('New transactions will be owned by their creators.');

  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await client.close();
  }
}

migrateOwnership();