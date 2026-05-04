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
  const amounts = [1320, 1530, 792, 918, 528, 612];
  const cols = ['ledger_entries','transactions','inwards','outwards','payments','stock_entries','revenue_distributions','revenuedistributions'];
  for (const coll of cols) {
    for (const amount of amounts) {
      try {
        const docs = await db.collection(coll).find({
          $or: [
            { rentCalculated: amount },
            { amount: amount },
            { totalAmount: amount },
            { total: amount },
            { rate: amount },
            { invoiceAmount: amount },
            { invoiceAmountWithoutTax: amount },
            { ownerShare: amount },
            { platformShare: amount },
          ],
        }).limit(10).toArray();
        if (docs.length) {
          console.log('===', coll, 'amount', amount, '===', docs.length);
          docs.forEach(doc => {
            const copy = { _id: String(doc._id) };
            for (const k of Object.keys(doc)) {
              if (['userEmail','invoiceMonth','bookingMonth','month','createdAt','warehouseId','warehouse_name','totalAmount','total','amount','rentCalculated','ownerShare','platformShare','invoiceAmount','invoiceAmountWithoutTax'].includes(k) || k.toLowerCase().includes('month') || k.toLowerCase().includes('email') || k.toLowerCase().includes('id')) {
                copy[k] = doc[k];
              }
            }
            console.log(JSON.stringify(copy));
          });
        }
      } catch (err) {
        console.error('ERR', coll, amount, err.message);
      }
    }
  }
  await client.close();
})();
