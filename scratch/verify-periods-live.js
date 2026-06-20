const { MongoClient, ObjectId } = require('mongodb');
const fs = require('fs');
const path = require('path');

function normalizeTransactionDateValue(value) {
  if (value instanceof Date) {
    return value.toISOString().split('T')[0];
  }

  if (typeof value === 'string') {
    const rawValue = value.trim();
    if (!rawValue) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
      return rawValue;
    }
    if (rawValue.includes('T') && !rawValue.includes(' ')) {
      return rawValue.split('T')[0];
    }
    const parsed = new Date(rawValue);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }
    return '';
  }

  return '';
}

function resolveTransactionDateString(txn) {
  const direction = (txn.direction || 'INWARD').toUpperCase();
  const rawDate =
    direction === 'OUTWARD'
      ? txn.actualOutwardDate || txn.outwardDate || txn.date || txn.inwardDate
      : txn.inwardDate || txn.date || txn.outwardDate || txn.actualOutwardDate;
  return normalizeTransactionDateValue(rawDate);
}

async function getTransactionsForInvoiceMonth(
  db,
  clientId,
  warehouseId,
  invoiceMonth,
  tenantFilter
) {
  try {
    const [yearPart, monthPart] = invoiceMonth.split('-');
    const month = Number(monthPart);
    const year = Number(yearPart);

    if (!year || !month || month < 1 || month > 12) {
      return [];
    }

    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    const monthStartStr = monthStart.toISOString().split('T')[0];
    const monthEndStr = monthEnd.toISOString().split('T')[0];

    const clientIdValues = [];
    const warehouseIdValues = [];

    if (ObjectId.isValid(clientId)) {
      clientIdValues.push(new ObjectId(clientId));
      clientIdValues.push(clientId.toString());
    } else if (clientId !== undefined && clientId !== null) {
      clientIdValues.push(clientId);
    }

    if (warehouseId !== undefined && warehouseId !== null) {
      if (ObjectId.isValid(warehouseId)) {
        warehouseIdValues.push(new ObjectId(warehouseId));
        warehouseIdValues.push(warehouseId.toString());
      } else {
        warehouseIdValues.push(warehouseId);
      }
    }

    const directionValues = ['INWARD', 'OUTWARD', 'inward', 'outward'];
    const query = {
      clientId: {
        $in: clientIdValues.filter((value) => value !== undefined && value !== null),
      },
      direction: { $in: directionValues },
      $or: [
        { date: { $lte: monthEnd } },
        { date: { $lte: monthEndStr } },
        { inwardDate: { $lte: monthEnd } },
        { inwardDate: { $lte: monthEndStr } },
        { outwardDate: { $lte: monthEnd } },
        { outwardDate: { $lte: monthEndStr } },
        { actualOutwardDate: { $lte: monthEnd } },
        { actualOutwardDate: { $lte: monthEndStr } },
      ],
      ...tenantFilter,
    };

    if (warehouseIdValues.length) {
      query.warehouseId = {
        $in: warehouseIdValues.filter((value) => value !== undefined && value !== null),
      };
    }

    const transactions = await db
      .collection('transactions')
      .find(query)
      .sort({ date: 1, inwardDate: 1, actualOutwardDate: 1 })
      .toArray();

    const commodityIds = Array.from(
      new Set(
        transactions
          .map((txn) => txn.commodityId)
          .filter((id) => id !== undefined && id !== null)
          .map((id) => String(id))
      )
    );

    const commodityDocs = commodityIds.length
      ? await db
          .collection('commodities')
          .find({
            _id: {
              $in: commodityIds
                .filter((id) => ObjectId.isValid(id))
                .map((id) => new ObjectId(id)),
            },
          })
          .toArray()
      : [];

    const commodityMap = new Map(
      commodityDocs.map((commodity) => [commodity._id.toString(), commodity])
    );

    return transactions.map((txn) => {
      const rawQuantity = txn.quantityMT ?? txn.quantity ?? txn.qty ?? 0;
      const rawBags = txn.bags ?? txn.bagsCount ?? txn.bagCount ?? txn.bags_count ?? '';

      return {
        date: (() => {
          const d = txn.date || txn.inwardDate || txn.outwardDate;
          if (!d) return '';
          if (d instanceof Date) return d.toISOString().split('T')[0];
          if (typeof d === 'string') {
            const raw = d.trim();
            if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
            if (raw.includes('T') && !raw.includes(' ')) return raw.split('T')[0];
            const parsed = new Date(raw);
            if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
            return raw;
          }
          return String(d);
        })(),
        inwardDate: txn.inwardDate || txn.date || '',
        actualOutwardDate: txn.actualOutwardDate || txn.outwardDate || null,
        outwardDate: txn.outwardDate || null,
        direction: (txn.direction || 'INWARD').toUpperCase(),
        commodityName: txn.commodityName || txn.commodity || 'Unknown',
        quantityMT: Number(rawQuantity || 0),
        quantity: Number(rawQuantity || 0),
        bags: rawBags,
        gatePass: txn.gatePass || txn.gatepass || '',
      };
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return [];
  }
}

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
  const tenantFilter = {};

  console.log('=== VERIFYING VIA REAL IMPLEMENTATION ===');

  const transactions = await getTransactionsForInvoiceMonth(
    db,
    clientId,
    warehouseId,
    invoiceMonth,
    tenantFilter
  );

  console.log(`getTransactionsForInvoiceMonth returned ${transactions.length} transactions:`);
  transactions.forEach((t, i) => {
    console.log(`[${i}] Date (formatted): ${t.date}`);
    console.log(`    Commodity: ${t.commodityName}`);
    console.log(`    Direction: ${t.direction}`);
    console.log(`    Quantity:  ${t.quantityMT}`);
  });

  await client.close();
}

test().catch(console.error);
