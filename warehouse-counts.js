const { MongoClient, ObjectId } = require('mongodb');
const url = 'mongodb://127.0.0.1:27017';
const dbName = 'wms_production';
const warehouseIdHex = '6a193a5afc0e2dc13f80906e';
const warehouseIdObj = new ObjectId(warehouseIdHex);
const warehouseName = 'Parsana Virjibhai Ghushabhai';
(async () => {
  const client = new MongoClient(url);
  await client.connect();
  const db = client.db(dbName);
  const colNames = (await db.listCollections().toArray()).map(c => c.name);
  const results = [];
  for (const name of colNames) {
    const coll = db.collection(name);
    const countString = await coll.countDocuments({ warehouseId: warehouseIdHex });
    const countObj = await coll.countDocuments({ warehouseId: warehouseIdObj });
    const countName = await coll.countDocuments({ warehouseName: { $regex: warehouseName, $options: 'i' } });
    if (countString || countObj || countName) {
      results.push({ collection: name, countString, countObj, countName });
    }
  }
  console.log(JSON.stringify(results, null, 2));
  await client.close();
})();
