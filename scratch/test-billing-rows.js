const { MongoClient, ObjectId } = require('mongodb');
const fs = require('fs');
const path = require('path');
const { transformTransactionsToBillingRows } = require('../lib/storage-engine');

async function test() {
  let mongoUri = 'mongodb://localhost:27017';
  let dbName = 'wms_production';

  try {
    const envPath = path.join(__dirname, '..', '.env.local');
    if (fs.existsSync(envPath)) {
      const envLines = fs.readFileSync(envPath, 'utf8').split('\n');
      envLines.forEach(line => {
        const parts = line.split('=');
        if (parts.length >= 2) {
          const key = parts[0].trim();
          const val = parts.slice(1).join('=').trim();
          if (key === 'MONGODB_URI') mongoUri = val;
          if (key === 'MONGODB_DB') dbName = val;
        }
      });
    }
  } catch (err) {}

  const client = new MongoClient(mongoUri);
  await client.connect();
  const db = client.db(dbName);

  const clientId = '6a34dea6afcdcf5066353093';
  const warehouseId = '6a34de20afcdcf5066353092';
  const invoiceMonth = '2026-06';

  console.log(`=== RUNNING TRANSFORMATION TEST FOR ${clientId} ===`);

  // We need to fetch transactions like getTransactionsForInvoiceMonth does
  const [yearPart, monthPart] = invoiceMonth.split('-');
  const month = Number(monthPart);
  const year = Number(yearPart);
  const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  
  const transactions = await db.collection('transactions').find({
    clientId: clientId,
    warehouseId: warehouseId,
    $or: [
      { date: { $lte: monthEnd } },
      { inwardDate: { $lte: monthEnd } },
      { actualOutwardDate: { $lte: monthEnd } }
    ]
  }).toArray();

  console.log(`Fetched ${transactions.length} raw transactions.`);

  // Map them to include ratePerMTPerDay and resolve commodity details
  const commodityIds = [...new Set(transactions.map(t => t.commodityId))];
  const commodities = await db.collection('commodities').find({
    _id: { $in: commodityIds.filter(id => id).map(id => new ObjectId(id)) }
  }).toArray();
  const commodityMap = new Map(commodities.map(c => [c._id.toString(), c]));

  const mappedTransactions = transactions.map(txn => {
    const rawQuantity = txn.quantityMT ?? txn.quantity ?? txn.qty ?? 0;
    const rawBags = txn.bags ?? txn.bagsCount ?? txn.bagCount ?? txn.bags_count ?? '';
    const commodityIdStr = txn.commodityId?.toString();
    const commodity = commodityIdStr ? commodityMap.get(commodityIdStr) : null;
    const ratePerMTPerDay = (() => {
      const txnRate = Number(
        txn.ratePerMTPerDay ??
          txn.rate ??
          txn.rateFixedAt ??
          txn.ratePerDayPerMT ??
          txn.ratePerDay ??
          txn.dailyRate ??
          0
      );
      if (txnRate > 0) return txnRate;
      if (commodity) {
        return Number(
          commodity.ratePerMtPerDay ??
            (commodity.ratePerMtMonth ? commodity.ratePerMtMonth / 30 : 0)
        );
      }
      return 0;
    })();

    return {
      ...txn,
      date: (txn.date || txn.inwardDate || txn.outwardDate || '').toString().split('T')[0],
      inwardDate: txn.inwardDate || txn.date || '',
      actualOutwardDate: txn.actualOutwardDate || txn.outwardDate || null,
      outwardDate: txn.outwardDate || null,
      direction: (txn.direction || 'INWARD').toUpperCase(),
      commodityName: txn.commodityName || txn.commodity || commodity?.name || 'Unknown',
      quantityMT: Number(rawQuantity || 0),
      quantity: Number(rawQuantity || 0),
      bags: rawBags,
      gatePass: txn.gatePass || txn.gatepass || '',
      ratePerMTPerDay,
      monthlyRate: Number(txn.monthlyRate || txn.monthlyRatePerMT || 0),
    };
  });

  const billingRows = transformTransactionsToBillingRows(mappedTransactions, invoiceMonth);

  console.log(`\nReturned ${billingRows.length} billing rows:`);
  billingRows.forEach((r, idx) => {
    console.log(`[${idx}] ${r.startDate} to ${r.endDate} | ${r.direction} | ${r.commodityName} | Qty: ${r.quantityMT} | Days: ${r.daysTotal} | Rent: ${r.rentTotal}`);
  });

  await client.close();
}

test().catch(console.error);
