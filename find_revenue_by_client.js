const { MongoClient, ObjectId } = require('mongodb');
const fs = require('fs');
const path = require('path');
const env = fs.readFileSync(path.resolve('.env.local'), 'utf8');
env.split(/\r?\n/).forEach(line => {
  const m = line.match(/^([^=]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
});

(async () => {
  const client = new MongoClient(process.env.MONGODB_URL);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB);
  const email = 'TESTIFY@GMAIL.COM';
  const clientDocs = await db.collection('clients').find({ userEmail: email }).toArray();
  const clientIds = clientDocs.map(doc => doc._id);
  console.log('TESTIFY client IDs:', clientIds.map(id => String(id)).join(', '));
  const amounts = [1320, 1530, 792, 918, 528, 612];
  const searchCollections = ['ledger_entries','transactions','inwards','outwards','stock_entries'];
  for (const coll of searchCollections) {
    for (const amount of amounts) {
      const docs = await db.collection(coll).find({
        $or: [
          { clientId: { $in: clientIds } },
          { ownerId: { $in: clientIds } },
          { userId: { $in: clientIds } },
        ],
        $or: [
          { rentCalculated: amount },
          { amount: amount },
          { totalAmount: amount },
          { total: amount },
          { rate: amount },
          { invoiceAmount: amount },
          { invoiceAmountWithoutTax: amount },
        ],
      }).toArray();
      if (docs.length) {
        console.log('===', coll, 'amount', amount, '===', docs.length);
        docs.forEach(doc => {
          const copy = { _id: String(doc._id), clientId: String(doc.clientId || ''), ownerId: String(doc.ownerId || ''), userId: String(doc.userId || '') };
          for (const k of ['rentCalculated','amount','totalAmount','total','rate','invoiceAmount','invoiceAmountWithoutTax','bookingMonth','invoiceMonth','month','createdAt','warehouseId','warehouseName','clientName','ownerName']) {
            if (doc[k] !== undefined) copy[k] = doc[k];
          }
          console.log(JSON.stringify(copy));
        });
      }
    }
  }
  await client.close();
})();
