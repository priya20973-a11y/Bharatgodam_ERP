const { MongoClient } = require('mongodb');

async function run() {
  const client = new MongoClient('mongodb://127.0.0.1:27017/wms_production');
  try {
    await client.connect();
    const db = client.db();
    
    // Create compound index for WSP uniqueness
    await db.collection('warehouses').createIndex({ userId: 1, name: 1 }, { unique: true });
    
    console.log('Indexes created successfully');
    
    const indexes = await db.collection('warehouses').indexes();
    console.log(indexes);
  } catch (error) {
    console.error('Error creating indexes:', error);
  } finally {
    await client.close();
  }
}

run();
