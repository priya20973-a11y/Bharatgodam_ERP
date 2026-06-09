const { MongoClient } = require('mongodb');
const url = 'mongodb://127.0.0.1:27017';
const dbName = 'wms_production';
const warehouseId = '6a193a5afc0e2dc13f80906e';
const warehouseName = 'Parsana Virjibhai Ghushabhai';
(async () => {
  const client = new MongoClient(url);
  await client.connect();
  const db = client.db(dbName);
  const colNames = (await db.listCollections().toArray()).map(c => c.name);
  const results = [];
  for (const name of colNames) {
    const coll = db.collection(name);
    const countById = await coll.countDocuments({ warehouseId: warehouseId });
    const countByName = await coll.countDocuments({ warehouseName: { $regex: warehouseName, $options: 'i' } });
    if (countById || countByName) {
      results.push({ collection: name, countById, countByName });
    }
  }
  console.log(JSON.stringify(results, null, 2));
  await client.close();
})();
