const { MongoClient } = require('mongodb');

async function createCollections() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  const db = client.db('wms_production');

  // Create collections if they don't exist
  const collections = ['stock_entries', 'ledger_entries', 'invoice_master', 'invoice_line_items', 'clients', 'commodities', 'warehouses', 'users', 'signup_requests'];

  for (const coll of collections) {
    try {
      await db.createCollection(coll);
      console.log(`Created collection: ${coll}`);
    } catch (e) {
      if (e.codeName === 'NamespaceExists') {
        console.log(`Collection ${coll} already exists`);
      } else {
        console.error(`Error creating ${coll}:`, e);
      }
    }
  }

  // Create indexes
  await db.collection('stock_entries').createIndex({ clientId: 1, warehouseId: 1, commodityId: 1 });
  await db.collection('ledger_entries').createIndex({ stockEntryId: 1 });
  await db.collection('ledger_entries').createIndex({ clientId: 1, warehouseId: 1, commodityId: 1, periodStartDate: 1 });
  await db.collection('invoice_master').createIndex({ clientId: 1, warehouseId: 1, invoiceMonth: 1 });
  await db.collection('clients').createIndex({ name: 1 }, { unique: true });
  await db.collection('commodities').createIndex({ name: 1 }, { unique: true });
  await db.collection('warehouses').createIndex({ name: 1 }, { unique: true });

  console.log('Indexes created');

  await client.close();
}

createCollections().catch(console.error);