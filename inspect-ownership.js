const { MongoClient } = require('mongodb');
const url = 'mongodb://127.0.0.1:27017';
const dbName = 'wms_production';
(async () => {
  const client = new MongoClient(url);
  await client.connect();
  const db = client.db(dbName);
  const coll = db.collection('ledger_entries');
  const total = await coll.countDocuments();
  const hasEmail = await coll.countDocuments({ userEmail: { $exists: true, $ne: null }});
  const hasUserIdString = await coll.countDocuments({ userId: { $type: 'string' }});
  const hasUserIdObj = await coll.countDocuments({ userId: { $type: 'objectId' }});
  console.log({ total, hasEmail, hasUserIdString, hasUserIdObj });
  await client.close();
})();
