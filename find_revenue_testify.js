const { MongoClient } = require('mongodb');
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
  const amounts = [1320, 1530, 792, 918, 528, 612];
  const colNames = ['transactions','ledger_entries','inwards','outwards','payments','stock_entries','revenue_distributions','revenuedistributions','invoice_master'];
  for (const coll of colNames) {
    try {
      const q = { userEmail: email, $or: [] };
      for (const a of amounts) {
        for (const f of ['rentCalculated','amount','totalAmount','total','rate','invoiceAmount','invoiceAmountWithoutTax','ownerShare','platformShare']) {
          q.$or.push({ [f]: a });
        }
      }
      const docs = await db.collection(coll).find(q).toArray();
      if (docs.length) {
        console.log('===', coll, '===', docs.length);
        docs.forEach(doc => {
          const copy = { _id: String(doc._id) };
          ['rentCalculated','amount','totalAmount','total','rate','invoiceAmount','invoiceAmountWithoutTax','ownerShare','platformShare','bookingMonth','invoiceMonth','month','createdAt','booking_id','warehouse_name','warehouse_id'].forEach(k => {
            if (doc[k] !== undefined) copy[k] = doc[k];
          });
          console.log(JSON.stringify(copy));
        });
      }
    } catch (err) {
      console.error('ERR', coll, err.message);
    }
  }
  await client.close();
})();
