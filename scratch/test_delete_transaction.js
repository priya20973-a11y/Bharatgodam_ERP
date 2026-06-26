const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config({ path: '.env.local' });

function normalizeDateToYYYYMMDD(d) {
  if (!d) return '';
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return '';

  const match = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }

  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
  const dbName = process.env.MONGODB_DB || 'wms_production';
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  const transactionId = '6a38ef288b1bb5d438810c44';
  const transaction = await db.collection('transactions').findOne({ _id: new ObjectId(transactionId) });
  if (!transaction) {
    console.error('Transaction not found');
    await client.close();
    return;
  }

  const txnObjectId = new ObjectId(transaction._id);
  const txnIdStr = transaction._id.toString();
  const sourceId = transaction.sourceId;
  const sourceObjectId = sourceId && ObjectId.isValid(sourceId) ? new ObjectId(sourceId) : null;

  const ledgerMatchClauses = [];
  ledgerMatchClauses.push({ inwardId: txnObjectId });
  ledgerMatchClauses.push({ inwardId: txnIdStr });
  if (sourceObjectId) {
    ledgerMatchClauses.push({ inwardId: sourceObjectId });
    ledgerMatchClauses.push({ inwardId: sourceId });
  }

  const oldDate = transaction.date;
  const oldQuantity = transaction.quantityMT;
  if (transaction.clientId && transaction.warehouseId && transaction.commodityId && oldDate != null && oldQuantity != null) {
    const clientIds = [transaction.clientId];
    const warehouseIds = [transaction.warehouseId];
    const commodityIds = [transaction.commodityId];
    try { clientIds.push(new ObjectId(String(transaction.clientId))); } catch {}
    try { warehouseIds.push(new ObjectId(String(transaction.warehouseId))); } catch {}
    try { commodityIds.push(new ObjectId(String(transaction.commodityId))); } catch {}

    const oldDateStr = normalizeDateToYYYYMMDD(oldDate);

    ledgerMatchClauses.push({
      clientId: { $in: clientIds },
      warehouseId: { $in: warehouseIds },
      commodityId: { $in: commodityIds },
      periodStartDate: oldDateStr,
      quantityMT: Number(oldQuantity),
      stockEntryId: { $exists: false },
    });
  }

  if (ledgerMatchClauses.length > 0) {
    const deleteLedgerRes = await db.collection('ledger_entries').deleteMany({ $or: ledgerMatchClauses });
    console.log(`[DELETE] Direct ledger_entries cleanup: deleted=${deleteLedgerRes.deletedCount}`);
  }

  const revenueMatchClauses = [];
  revenueMatchClauses.push({ inwardId: txnObjectId });
  revenueMatchClauses.push({ inwardId: txnIdStr });
  if (sourceObjectId) {
    revenueMatchClauses.push({ inwardId: sourceObjectId });
    revenueMatchClauses.push({ inwardId: sourceId });
  }

  if (revenueMatchClauses.length > 0) {
    const deleteRevRes = await db.collection('revenuedistributions').deleteMany({ $or: revenueMatchClauses });
    console.log(`[DELETE] Direct revenuedistributions cleanup: deleted=${deleteRevRes.deletedCount}`);
  }

  // Double check if they are gone:
  const ledgerCount = await db.collection('ledger_entries').countDocuments({ $or: ledgerMatchClauses });
  const revCount = await db.collection('revenuedistributions').countDocuments({ $or: revenueMatchClauses });

  console.log(`VERIFICATION: Remaining ledger entries: ${ledgerCount}, Remaining revenue distributions: ${revCount}`);

  await client.close();
}

main().catch(console.error);
