/*
  Usage:
    MONGODB_URL="your_mongo_uri" MONGODB_DB="wms_production" node scripts/update-transaction-date.js <transactionId> <newDateISO>

  Example:
    MONGODB_URL="mongodb://localhost:27017" MONGODB_DB="wms_production" node scripts/update-transaction-date.js 6a194670fc0e2dc13f8092aa 2026-04-26

  This script updates the `date` field on the transaction document with the given _id.
  It also updates common date-like fields if present (`transactionDate`, `createdAt`, `updatedAt`) only when they point to the old date.
*/

const { MongoClient, ObjectId } = require('mongodb');

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: node scripts/update-transaction-date.js <transactionId> <newDateISO>');
    process.exit(1);
  }

  const [transactionId, newDateInput] = args;
  const newDate = new Date(newDateInput);
  if (Number.isNaN(newDate.getTime())) {
    console.error('Invalid date:', newDateInput);
    process.exit(1);
  }

  const MONGODB_URL = process.env.MONGODB_URL;
  const MONGODB_DB = process.env.MONGODB_DB;
  if (!MONGODB_URL || !MONGODB_DB) {
    console.error('Please set MONGODB_URL and MONGODB_DB environment variables.');
    process.exit(1);
  }

  const client = new MongoClient(MONGODB_URL, { maxPoolSize: 5 });
  await client.connect();
  const db = client.db(MONGODB_DB);

  const txCol = db.collection('transactions');

  let query;
  try {
    query = { _id: new ObjectId(transactionId) };
  } catch (err) {
    // fallback: try string id match
    query = { _id: transactionId };
  }

  const existing = await txCol.findOne(query);
  if (!existing) {
    console.error('Transaction not found for id:', transactionId);
    await client.close();
    process.exit(1);
  }

  console.log('Found transaction:');
  console.log({ _id: existing._id, date: existing.date, transactionDate: existing.transactionDate || null });

  const oldDateCandidates = [existing.date, existing.transactionDate, existing.createdAt, existing.updatedAt].filter(Boolean).map(d => (d instanceof Date ? d.toISOString().split('T')[0] : (typeof d === 'string' ? new Date(d).toISOString().split('T')[0] : null))).filter(Boolean);
  const oldDateStr = oldDateCandidates[0] || null;
  const newDateStr = newDate.toISOString().split('T')[0];

  const update: any = { $set: { date: newDateStr } };

  // If transaction has 'transactionDate' field or createdAt/updatedAt equal to old date, update them too
  if (existing.transactionDate) update.$set.transactionDate = newDateStr;
  if (existing.createdAt) {
    const createdStr = existing.createdAt instanceof Date ? existing.createdAt.toISOString().split('T')[0] : (typeof existing.createdAt === 'string' ? new Date(existing.createdAt).toISOString().split('T')[0] : null);
    if (createdStr === oldDateStr) update.$set.createdAt = new Date(newDateStr);
  }
  if (existing.updatedAt) {
    const updatedStr = existing.updatedAt instanceof Date ? existing.updatedAt.toISOString().split('T')[0] : (typeof existing.updatedAt === 'string' ? new Date(existing.updatedAt).toISOString().split('T')[0] : null);
    if (updatedStr === oldDateStr) update.$set.updatedAt = new Date(newDateStr);
  }

  const res = await txCol.updateOne(query, update);
  console.log('Matched:', res.matchedCount, 'Modified:', res.modifiedCount);

  const updated = await txCol.findOne(query);
  console.log('Updated transaction dates:', { date: updated.date, transactionDate: updated.transactionDate || null, createdAt: updated.createdAt || null, updatedAt: updated.updatedAt || null });

  await client.close();
  console.log('Done.');
}

main().catch((err) => {
  console.error('Script error:', err);
  process.exit(1);
});
