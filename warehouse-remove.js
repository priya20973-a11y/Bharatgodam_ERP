const { MongoClient, ObjectId } = require('mongodb');
const url = 'mongodb://127.0.0.1:27017';
const dbName = 'wms_production';
const warehouseId = new ObjectId('6a193a5afc0e2dc13f80906e');
(async () => {
  const client = new MongoClient(url);
  await client.connect();
  const db = client.db(dbName);
  const ops = [
    { collection: 'inwards', filter: { warehouseId } },
    { collection: 'invoice_master', filter: { warehouseId } },
    { collection: 'ledger_entries', filter: { warehouseId } },
    { collection: 'stock_entries', filter: { warehouseId } },
    { collection: 'warehouses', filter: { _id: warehouseId } },
  ];
  const results = [];
  for (const op of ops) {
    const coll = db.collection(op.collection);
    const countBefore = await coll.countDocuments(op.filter);
    const res = await coll.deleteMany(op.filter);
    const countAfter = await coll.countDocuments(op.filter);
    results.push({ collection: op.collection, countBefore, deletedCount: res.deletedCount, countAfter });
  }
  console.log(JSON.stringify(results, null, 2));
  await client.close();
})();
