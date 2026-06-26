const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
  const dbName = process.env.MONGODB_DB || 'wms_production';
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  const warehouseId = new ObjectId('6a38ef0b8b1bb5d438810c42');
  const transactionId = new ObjectId('6a38ef288b1bb5d438810c44');
  const inwardId = new ObjectId('6a38ef288b1bb5d438810c43');

  // Deletions
  await db.collection('stock_entries').deleteMany({
    $or: [
      { remarks: `Synced from transaction ${transactionId.toString()}` },
      { gatePass: 'GP-1782116136679' }
    ]
  });
  await db.collection('ledger_entries').deleteMany({
    $or: [
      { _id: new ObjectId('6a38ef288b1bb5d438810c45') },
      { stockEntryId: { $exists: true } }
    ]
  });
  await db.collection('revenuedistributions').deleteMany({
    inwardId: inwardId
  });

  // Re-insert original ledger and revenue distribution
  await db.collection('ledger_entries').insertOne({
    _id: new ObjectId('6a38ef288b1bb5d438810c45'),
    clientId: new ObjectId('6a38edb38b1bb5d438810c3d'),
    warehouseId: warehouseId,
    commodityId: new ObjectId('6a27a62e07f778ddb9901a65'),
    periodStartDate: '2026-06-15',
    periodEndDate: '2026-06-29',
    quantityMT: 100,
    status: 'ACTIVE',
    ratePerMTPerDay: 70,
    rentCalculated: 98000,
    version: 1,
    createdAt: new Date(),
    userId: new ObjectId('6a26a9a3f24d2802ff9cb16a'),
    userEmail: 'shrutimehata.01@gmail.com',
    inwardId: inwardId
  });
  console.log('Inserted original ledger entry');

  await db.collection('revenuedistributions').insertOne({
    _id: new ObjectId('6a38ef288b1bb5d438810c46'),
    inwardId: inwardId,
    clientId: new ObjectId('6a38edb38b1bb5d438810c3d'),
    warehouseId: warehouseId,
    totalAmount: 98000,
    ownerShare: 58800,
    platformShare: 39200,
    createdAt: new Date(),
    updatedAt: new Date()
  });
  console.log('Inserted original revenue distribution');

  // Reset warehouse occupied capacity to 100 MT
  await db.collection('warehouses').updateOne(
    { _id: warehouseId },
    { $set: { occupiedCapacity: 100, status: 'ACTIVE' } }
  );
  console.log('Reset warehouse capacity to 100 MT');

  // Reset transaction date to June 15
  await db.collection('transactions').updateOne(
    { _id: transactionId },
    { $set: { date: '2026-06-15', quantityMT: 100 } }
  );
  console.log('Reset transaction date to 2026-06-15 and quantityMT to 100');

  // Reset linked Inward date to June 15
  await db.collection('inwards').updateOne(
    { _id: inwardId },
    { $set: { date: new Date('2026-06-15T00:00:00Z'), quantityMT: 100 } }
  );
  console.log('Reset inwards date to 2026-06-15 and quantityMT to 100');

  await client.close();
}

main().catch(console.error);
