const { MongoClient, ObjectId } = require('mongodb');

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017';
const MONGODB_DB = process.env.MONGODB_DB || 'wms_production';

async function createTestData() {
  const client = new MongoClient(MONGODB_URL);
  try {
    await client.connect();
    const db = client.db(MONGODB_DB);
    
    // Get the two target warehouses
    const warehouses = await db.collection('warehouses').find({
      name: { $in: ['Bhalal Dharmendrabhai -7', 'Ritaben Amitkumar Vithalani-5'] }
    }).toArray();
    
    if (warehouses.length !== 2) {
      console.log('Error: Could not find both warehouses');
      warehouses.forEach(w => console.log(`Found: ${w.name}`));
      return;
    }
    
    console.log('Found warehouses:', warehouses.map(w => w.name));
    
    // Get or create a test client
    let client_doc = await db.collection('clients').findOne({ name: 'Test Client' });
    if (!client_doc) {
      const result = await db.collection('clients').insertOne({
        name: 'Test Client',
        email: 'client@test.com',
        userEmail: 'bharatgodam.techsolutions@gmail.com',
        userId: new ObjectId('000000000000000000000001'),
        status: 'ACTIVE',
        createdAt: new Date()
      });
      client_doc = { _id: result.insertedId, name: 'Test Client' };
      console.log('Created test client');
    }
    
    // Get or create a test commodity
    let commodity = await db.collection('commodities').findOne({ name: 'Test Commodity' });
    if (!commodity) {
      const result = await db.collection('commodities').insertOne({
        name: 'Test Commodity',
        ratePerMtMonth: 1000,
        userEmail: 'bharatgodam.techsolutions@gmail.com',
        userId: new ObjectId('000000000000000000000001'),
        status: 'ACTIVE',
        createdAt: new Date()
      });
      commodity = { _id: result.insertedId, name: 'Test Commodity' };
      console.log('Created test commodity');
    }
    
    // Create sample transactions for each warehouse
    for (const warehouse of warehouses) {
      for (let i = 0; i < 3; i++) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        
        await db.collection('transactions').insertOne({
          clientId: client_doc._id.toString(),
          clientName: 'Test Client',
          warehouseId: warehouse._id.toString(),
          warehouseName: warehouse.name,
          commodityId: commodity._id.toString(),
          commodityName: 'Test Commodity',
          direction: 'INWARD',
          quantity: 100 + (i * 10),
          quantityMT: 100 + (i * 10),
          date: date,
          userEmail: 'bharatgodam.techsolutions@gmail.com',
          userId: new ObjectId('000000000000000000000001'),
          status: 'COMPLETED',
          createdAt: new Date()
        });
        
        // Create corresponding ledger entry
        await db.collection('ledger_entries').insertOne({
          clientId: client_doc._id.toString(),
          warehouseId: warehouse._id.toString(),
          commodityId: commodity._id.toString(),
          month: monthStr,
          type: 'INWARD',
          quantity: 100 + (i * 10),
          date: date,
          rentCalculated: (100 + (i * 10)) * 1000,
          ownerEarnings: (100 + (i * 10)) * 1000 * 0.6,
          platformCommission: (100 + (i * 10)) * 1000 * 0.4,
          userEmail: 'bharatgodam.techsolutions@gmail.com',
          userId: new ObjectId('000000000000000000000001'),
          createdAt: new Date()
        });
      }
    }
    
    console.log('✓ Sample transactions created successfully');
    
  } finally {
    await client.close();
  }
}

createTestData().catch(console.error);
