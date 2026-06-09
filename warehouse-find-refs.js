const { MongoClient, ObjectId } = require('mongodb');
const url = 'mongodb://127.0.0.1:27017';
const dbName = 'wms_production';
const warehouseIdHex = '6a193a5afc0e2dc13f80906e';
const warehouseId = new ObjectId(warehouseIdHex);
const warehouseName = 'Parsana Virjibhai Ghushabhai';
function containsValue(obj) {
  if (obj === null || obj === undefined) return false;
  if (typeof obj === 'string') {
    return obj.includes(warehouseIdHex) || obj.toLowerCase().includes(warehouseName.toLowerCase());
  }
  if (obj && typeof obj === 'object') {
    if (obj instanceof ObjectId) {
      return obj.equals(warehouseId);
    }
    if (Array.isArray(obj)) return obj.some(x => containsValue(x));
    return Object.values(obj).some(x => containsValue(x));
  }
  return false;
}
(async () => {
  const client = new MongoClient(url);
  await client.connect();
  const db = client.db(dbName);
  const colNames = (await db.listCollections().toArray()).map(c => c.name);
  const results = [];
  for (const name of colNames) {
    const coll = db.collection(name);
    const cursor = coll.find().limit(1000);
    let matchCount = 0;
    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      if (containsValue(doc)) {
        matchCount += 1;
      }
    }
    if (matchCount > 0) {
      results.push({ collection: name, sampleMatches: matchCount });
    }
  }
  console.log(JSON.stringify(results, null, 2));
  await client.close();
})();
