const { MongoClient, ObjectId } = require('mongodb');
const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017';
const MONGODB_DB = process.env.MONGODB_DB || 'wms_production';

async function generateRiceLedgerEntries() {
  const client = new MongoClient(MONGODB_URL);
  try {
    await client.connect();
    const db = client.db(MONGODB_DB);

    // Get RICE transactions that have accountId
    const riceTransactions = await db.collection('transactions').find({
      commodityName: 'RICE',
      accountId: { $exists: true, $ne: null }
    }).toArray();

    console.log('Found ' + riceTransactions.length + ' RICE transactions to process');

    for (const txn of riceTransactions) {
      // Check if ledger entry already exists
      const transactionDate = new Date(txn.date);
      const dateString = transactionDate.toISOString().split('T')[0];

      const existingLedger = await db.collection('ledger_entries').findOne({
        clientId: txn.accountId,
        warehouseId: txn.warehouseId,
        commodityId: txn.commodityId,
        periodStartDate: dateString,
        quantityMT: txn.quantityMT
      });

      if (existingLedger) {
        console.log('Ledger entry already exists for transaction ' + txn._id.toString());
        continue;
      }

      // Get commodity for rate calculation
      const commodity = await db.collection('commodities').findOne({
        _id: new ObjectId(txn.commodityId)
      });

      if (!commodity) {
        console.log('Commodity not found for transaction ' + txn._id.toString());
        continue;
      }

      // Calculate rate per MT per day
      const ratePerMTPerDay =
        commodity.ratePerMtPerDay ??
        (commodity.ratePerMtMonth ? commodity.ratePerMtMonth / 30 : 10);

      // Create ledger entry
      const ledgerEntry = {
        clientId: txn.accountId,
        warehouseId: txn.warehouseId,
        commodityId: txn.commodityId,
        periodStartDate: dateString,
        periodEndDate: txn.direction === 'INWARD' ? null : dateString, // OUTWARD ends on transaction date
        quantityMT: txn.quantityMT,
        status: 'ACTIVE',
        ratePerMTPerDay: ratePerMTPerDay,
        version: 1,
        createdAt: new Date(),
      };

      const result = await db.collection('ledger_entries').insertOne(ledgerEntry);
      console.log('Created ledger entry for RICE transaction: ' + result.insertedId);
    }

    console.log('Ledger entry generation completed!');

    // Verify ledger entries
    const riceLedgerEntries = await db.collection('ledger_entries').aggregate([
      {
        $lookup: {
          from: 'commodities',
          localField: 'commodityId',
          foreignField: '_id',
          as: 'commodity'
        }
      },
      { $unwind: '$commodity' },
      { $match: { 'commodity.name': 'RICE' } }
    ]).toArray();

    console.log('RICE ledger entries created: ' + riceLedgerEntries.length);

  } finally {
    await client.close();
  }
}
generateRiceLedgerEntries();