/*
  Usage:
    MONGODB_URL="your_mongo_uri" MONGODB_DB="wms_production" node scripts/delete-transaction.js <transactionId>

  This script removes a specific transaction and its directly linked records:
  - transactions
  - ledger_time_state entries referencing the transaction
  - stock_entries created from the transaction sync
  - ledger_entries tied to those stock entries

  After running it, regenerate the affected ledger and invoices for the transaction's account/month.
*/

const { MongoClient, ObjectId } = require('mongodb');

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('Usage: node scripts/delete-transaction.js <transactionId>');
    process.exit(1);
  }

  const transactionId = args[0].trim();
  const new ObjectId(transactionId); // validate format or throw
  const MONGODB_URL = process.env.MONGODB_URL;
  const MONGODB_DB = process.env.MONGODB_DB;

  if (!MONGODB_URL || !MONGODB_DB) {
    console.error('Please set MONGODB_URL and MONGODB_DB environment variables.');
    process.exit(1);
  }

  const client = new MongoClient(MONGODB_URL, { maxPoolSize: 5 });
  await client.connect();
  const db = client.db(MONGODB_DB);

  const txId = new ObjectId(transactionId);
  const transaction = await db.collection('transactions').findOne({ _id: txId });

  if (!transaction) {
    console.error('Transaction not found with id:', transactionId);
    await client.close();
    process.exit(1);
  }

  console.log('Found transaction:');
  console.log({
    _id: transaction._id.toString(),
    accountId: transaction.accountId,
    clientId: transaction.clientId,
    warehouseId: transaction.warehouseId,
    direction: transaction.direction,
    date: transaction.date,
    quantityMT: transaction.quantityMT,
    gatePass: transaction.gatePass,
    status: transaction.status,
  });

  const stockEntries = await db.collection('stock_entries').find({
    $or: [
      { remarks: { $regex: new RegExp(`Synced from transaction\\s*${transactionId}`) } },
      ...(transaction.gatePass ? [{ gatePass: transaction.gatePass }] : []),
    ],
  }).toArray();

  const stockEntryIds = stockEntries.map((entry) => entry._id).filter(Boolean);

  console.log('Matched stock_entries:', stockEntries.length);
  stockEntries.forEach((entry) => {
    console.log(` - ${entry._id.toString()} [${entry.direction}] gatePass=${entry.gatePass} remarks=${entry.remarks}`);
  });

  const ledgerEntriesResult = stockEntryIds.length > 0
    ? await db.collection('ledger_entries').deleteMany({ stockEntryId: { $in: stockEntryIds } })
    : { deletedCount: 0 };

  console.log('Deleted ledger_entries linked to stock_entries:', ledgerEntriesResult.deletedCount);

  const deletedStock = stockEntryIds.length > 0
    ? await db.collection('stock_entries').deleteMany({ _id: { $in: stockEntryIds } })
    : { deletedCount: 0 };

  console.log('Deleted stock_entries:', deletedStock.deletedCount);

  const deletedLedgerTimeState = await db.collection('ledger_time_state').deleteMany({ 'affectedTransaction.transactionId': transactionId });
  console.log('Deleted ledger_time_state entries:', deletedLedgerTimeState.deletedCount);

  const deletedTransaction = await db.collection('transactions').deleteOne({ _id: txId });
  console.log('Deleted transaction:', deletedTransaction.deletedCount);

  console.log('Done. Please regenerate ledger and invoices for the affected account/month after this cleanup.');
  await client.close();
}

main().catch((error) => {
  console.error('Script failed:', error);
  process.exit(1);
});
