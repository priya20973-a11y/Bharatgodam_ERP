const { MongoClient, ObjectId } = require('mongodb');

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017';
const MONGODB_DB = process.env.MONGODB_DB || 'wms_production';

async function createPaymentsCollection() {
  const client = new MongoClient(MONGODB_URL, {
    serverApi: {
      version: '1',
      strict: true,
      deprecationErrors: true,
    },
  });

  try {
    console.log('🌱 Creating payments collection...');
    console.log(`📍 MongoDB URL: ${MONGODB_URL}`);
    console.log(`📊 Database: ${MONGODB_DB}`);

    await client.connect();
    const db = client.db(MONGODB_DB);

    // Create payments collection if it doesn't exist
    const collections = await db.listCollections({ name: 'payments' }).toArray();
    if (collections.length === 0) {
      await db.createCollection('payments');
      console.log('✅ Created payments collection');
    } else {
      console.log('ℹ️  Payments collection already exists');
    }

    // Create indexes
    await db.collection('payments').createIndex({ clientId: 1, paymentDate: -1 });
    await db.collection('payments').createIndex({ accountId: 1, paymentDate: -1 });
    await db.collection('payments').createIndex({ invoiceId: 1 });
    console.log('✅ Created payment indexes');

    console.log('🎉 Payments collection setup completed successfully!');

  } catch (error) {
    console.error('❌ Payments collection setup failed:', error.message);
    process.exit(1);
  } finally {
    await client.close();
    console.log('🔌 Database connection closed');
    process.exit(0);
  }
}

// Run the setup
createPaymentsCollection();