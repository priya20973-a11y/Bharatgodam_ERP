const { MongoClient } = require('mongodb');
const url = 'mongodb://127.0.0.1:27017';
const dbName = 'wms_production';
(async () => {
  const client = new MongoClient(url);
  await client.connect();
  const db = client.db(dbName);
  const coll = db.collection('ledger_entries');
  const countNoOwnership = await coll.countDocuments({ userId: { $exists: false }, userEmail: { $exists: false } });
  const countUserIdOnly = await coll.countDocuments({ userId: { $exists: true }, userEmail: { $exists: false } });
  const countEmailOnly = await coll.countDocuments({ userId: { $exists: false }, userEmail: { $exists: true } });
  const countBoth = await coll.countDocuments({ userId: { $exists: true }, userEmail: { $exists: true } });
  console.log({ countNoOwnership, countUserIdOnly, countEmailOnly, countBoth });
  await client.close();
})();
