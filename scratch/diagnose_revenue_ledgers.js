require('dotenv').config({ path: '.env.local' });
const { MongoClient } = require('mongodb');

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGODB_URL || 'mongodb://localhost:27017';
  const dbName = process.env.MONGODB_DB || 'wms_production';
  console.log('Connecting to URI:', uri.replace(/:([^:@]+)@/, ':***@'));
  console.log('Database:', dbName);

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  console.log('\n--- RECENT TRANSACTIONS ---');
  const txs = await db.collection('transactions').find({}).sort({ createdAt: -1 }).limit(10).toArray();
  txs.forEach(t => {
    console.log(`TX: id=${t._id}, type=${t.type}, direction=${t.direction}, date=${t.date}, qty=${t.quantityMT}, gatePass=${t.gatePass}, sourceId=${t.sourceId}`);
  });

  console.log('\n--- RECENT INWARDS ---');
  const inwards = await db.collection('inwards').find({}).sort({ createdAt: -1 }).limit(10).toArray();
  inwards.forEach(i => {
    console.log(`INW: id=${i._id}, date=${i.date}, qty=${i.quantityMT}, gatePass=${i.gatePass}`);
  });

  console.log('\n--- RECENT OUTWARDS ---');
  const outwards = await db.collection('outwards').find({}).sort({ createdAt: -1 }).limit(10).toArray();
  outwards.forEach(o => {
    console.log(`OUTW: id=${o._id}, date=${o.date}, qty=${o.quantityMT}, gatePass=${o.gatePass}`);
  });

  console.log('\n--- RECENT LEDGER ENTRIES ---');
  const ledgers = await db.collection('ledger_entries').find({}).sort({ createdAt: -1 }).limit(15).toArray();
  ledgers.forEach(l => {
    console.log(`LEDGER: id=${l._id}, start=${l.periodStartDate}, end=${l.periodEndDate}, qty=${l.quantityMT}, rent=${l.rentCalculated}, inwardId=${l.inwardId}, stockEntryId=${l.stockEntryId}`);
  });

  console.log('\n--- RECENT REVENUE DISTRIBUTIONS ---');
  const revs = await db.collection('revenuedistributions').find({}).sort({ createdAt: -1 }).limit(10).toArray();
  revs.forEach(r => {
    console.log(`REV: id=${r._id}, inwardId=${r.inwardId}, total=${r.totalAmount}, owner=${r.ownerShare}, platform=${r.platformShare}`);
  });

  await client.close();
}

main().catch(console.error);
