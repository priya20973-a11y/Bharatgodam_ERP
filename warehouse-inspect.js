const { MongoClient, ObjectId } = require('mongodb');
const url = 'mongodb://127.0.0.1:27017';
const dbName = 'wms_production';
const warehouseId = new ObjectId('6a193a5afc0e2dc13f80906e');
const warehouseName = 'Parsana Virjibhai Ghushabhai';
const collections = ['inwards','invoice_master','ledger_entries','warehouses','stock_entries'];
(async () => {
  const client = new MongoClient(url);
  await client.connect();
  const db = client.db(dbName);
  for (const name of collections) {
    const coll = db.collection(name);
    const countById = await coll.countDocuments({ warehouseId });
    const countByName = await coll.countDocuments({ warehouseName: { $regex: warehouseName, $options:'i' } });
    console.log('COLLECTION', name, 'countById', countById, 'countByName', countByName);
    const docs = await coll.find({ $or:[{warehouseId},{warehouseName:{$regex:warehouseName,$options:'i'}}] }).limit(5).toArray();
    console.log(JSON.stringify(docs,null,2));
  }
  await client.close();
})();
