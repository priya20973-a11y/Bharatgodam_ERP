require('dotenv').config({ path: '.env.local' });
const { MongoClient, ObjectId } = require('mongodb');

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGODB_URL || 'mongodb://localhost:27017';
  const dbName = process.env.MONGODB_DB || 'wms_production';
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  const tx = await db.collection('transactions').findOne({ _id: new ObjectId('6a38ef288b1bb5d438810c44') });
  console.log('TX:', tx);
  console.log('TX Date Type:', typeof tx.date, tx.date instanceof Date ? 'Date' : 'Not Date');

  const inw = await db.collection('inwards').findOne({ _id: new ObjectId('6a38ef288b1bb5d438810c43') });
  console.log('INW:', inw);

  const ledger = await db.collection('ledger_entries').findOne({ _id: new ObjectId('6a38ef288b1bb5d438810c45') });
  console.log('LEDGER:', ledger);

  const rev = await db.collection('revenuedistributions').findOne({ _id: new ObjectId('6a38ef288b1bb5d438810c46') });
  console.log('REV:', rev);

  await client.close();
}

main().catch(console.error);
