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

const DAYS_PER_MONTH = 30;
function toCalendarDay(date) {
  const raw = typeof date === 'string' ? date : date.toISOString();
  const datePart = raw.slice(0, 10);
  return new Date(datePart + 'T00:00:00.000Z');
}

function calculateRent(weightMT, ratePerMonth, inwardDate, outwardDate) {
  const start = toCalendarDay(inwardDate);
  const end   = toCalendarDay(outwardDate);
  const rawDays  = Math.round((end - start) / (1000 * 60 * 60 * 24));
  const totalDays = Math.max(1, rawDays);

  const monthlyRent = (Math.round(weightMT * 100) / 100) * (Math.round(ratePerMonth * 100) / 100);
  const monthlyPaise  = Math.round(monthlyRent * 100);
  const dailyPaise    = monthlyPaise / DAYS_PER_MONTH;
  const rentPaise     = Math.round(dailyPaise * totalDays);

  const storageRent = rentPaise / 100;
  const totalAmount = rentPaise / 100;
  const dailyRate   = Math.round(dailyPaise) / 100;

  return { totalDays, weightMT, appliedRate: ratePerMonth, monthlyRent, dailyRate, storageRent, totalAmount };
}

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
  const dbName = process.env.MONGODB_DB || 'wms_production';
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  // RESET STEP: Link the legacy ledger entry to inwardId and set start date to 15th
  await db.collection('ledger_entries').updateOne(
    { _id: new ObjectId('6a38ef288b1bb5d438810c45') },
    {
      $set: {
        inwardId: new ObjectId('6a38ef288b1bb5d438810c43'),
        periodStartDate: '2026-06-15',
        rentCalculated: 98000
      }
    }
  );
  console.log('RESET: Linked legacy ledger entry to inwardId and reset date to June 15');

  const transactionId = '6a38ef288b1bb5d438810c44';
  const transaction = await db.collection('transactions').findOne({ _id: new ObjectId(transactionId) });
  if (!transaction) {
    console.error('Transaction not found');
    await client.close();
    return;
  }

  const date = '2026-06-17';
  const parsedQuantity = 100;
  const parsedDate = new Date(date);

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

  const newDateStr = normalizeDateToYYYYMMDD(parsedDate);

  const matchedLedgerEntries = await db.collection('ledger_entries').find({ $or: ledgerMatchClauses }).toArray();
  console.log(`Found ${matchedLedgerEntries.length} matched ledger entries`);

  let ratePerMTPerDay = transaction.ratePerMTPerDay;
  if (!ratePerMTPerDay && transaction.commodityId) {
    const commodity = await db.collection('commodities').findOne({ _id: new ObjectId(transaction.commodityId) });
    if (commodity) {
      ratePerMTPerDay = commodity.ratePerMtPerDay ?? (commodity.ratePerMtMonth ? commodity.ratePerMtMonth / 30 : 10);
    }
  }
  if (!ratePerMTPerDay) {
    ratePerMTPerDay = 10;
  }

  let totalRentCalculated = 0;

  for (const entry of matchedLedgerEntries) {
    const rentEndDate = entry.periodEndDate ? new Date(entry.periodEndDate) : null;
    let newRentTotal = 0;
    if (rentEndDate) {
      const monthlyRate = ratePerMTPerDay * 30;
      const rent = calculateRent(parsedQuantity, monthlyRate, parsedDate, rentEndDate);
      newRentTotal = rent.totalAmount;
    }
    totalRentCalculated += newRentTotal;

    const res = await db.collection('ledger_entries').updateOne(
      { _id: entry._id },
      {
        $set: {
          periodStartDate: newDateStr,
          quantityMT: parsedQuantity,
          rentCalculated: newRentTotal,
          updatedAt: new Date(),
        },
      }
    );
    console.log(`Updated ledger_entry ${entry._id}: matched=${res.matchedCount}, modified=${res.modifiedCount}, rentCalculated=${newRentTotal}`);
  }

  const revenueMatchClauses = [];
  revenueMatchClauses.push({ inwardId: txnObjectId });
  revenueMatchClauses.push({ inwardId: txnIdStr });
  if (sourceObjectId) {
    revenueMatchClauses.push({ inwardId: sourceObjectId });
    revenueMatchClauses.push({ inwardId: sourceId });
  }

  if (revenueMatchClauses.length > 0) {
    const newOwnerShare = Math.round(totalRentCalculated * 0.6 * 100) / 100;
    const newPlatformShare = Math.round((totalRentCalculated - newOwnerShare) * 100) / 100;

    const res = await db.collection('revenuedistributions').updateMany(
      { $or: revenueMatchClauses },
      {
        $set: {
          totalAmount: totalRentCalculated,
          ownerShare: newOwnerShare,
          platformShare: newPlatformShare,
          updatedAt: new Date(),
        },
      }
    );
    console.log(`Updated revenuedistributions: matched=${res.matchedCount}, modified=${res.modifiedCount}`);
  }

  await client.close();
}

main().catch(console.error);
