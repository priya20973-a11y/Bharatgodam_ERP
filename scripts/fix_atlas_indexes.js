const { MongoClient } = require('mongodb');

async function run() {
  const uri = 'mongodb+srv://rutvi2005:5v1jj9zVisOxVUUn@cluster0.ecnv50o.mongodb.net/?appName=Cluster0';
  const client = new MongoClient(uri);
  try {
    await client.connect();
    console.log('Connected to Atlas');
    const db = client.db('wms_production');
    
    // Check indexes
    let indexes = await db.collection('warehouses').indexes();
    console.log('Before drop:', indexes.map(i => i.name));
    
    // Drop name_1 if it exists
    if (indexes.some(i => i.name === 'name_1')) {
      await db.collection('warehouses').dropIndex('name_1');
      console.log('Dropped name_1 index');
    }
    
    // Create new compound index
    await db.collection('warehouses').createIndex({ userId: 1, name: 1 }, { unique: true });
    console.log('Created userId_1_name_1 index');
    
    // Verify
    indexes = await db.collection('warehouses').indexes();
    console.log('After updates:', indexes.map(i => i.name));
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

run();
