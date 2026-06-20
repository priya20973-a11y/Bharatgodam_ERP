const { MongoClient, ObjectId } = require('mongodb');
const fs = require('fs');
const path = require('path');
const { differenceInDays } = require('date-fns');

// Copy-pasted helper functions from app/api/invoice/utils.ts and lib/storage-engine.ts
function calculateStorageDays(fromDate, toDate, status) {
  const from = typeof fromDate === 'string' ? new Date(fromDate) : fromDate;
  const to = typeof toDate === 'string' ? new Date(toDate) : toDate;

  if (from.getTime() === to.getTime()) {
    return 1;
  }

  if (status === 'ACTIVE') {
    return Math.max(1, differenceInDays(to, from) + 1);
  }

  return Math.max(0, differenceInDays(to, from));
}

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
    if (rawValue.includes('T')) {
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

function parseUTCDate(dateString) {
  if (!dateString) return null;
  const date = new Date(`${dateString}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildOpeningBalanceRows(transactions, monthStartStr, billingEndDateStr, monthDays) {
  if (!transactions.length || monthDays <= 0) return [];

  const balanceMap = new Map();

  for (const txn of transactions) {
    const direction = (txn.direction || 'INWARD').toUpperCase();
    const rawQuantity = Number(txn.quantityMT ?? txn.quantity ?? txn.qty ?? 0);
    const quantityMT = direction === 'OUTWARD' ? -Math.abs(rawQuantity) : rawQuantity;

    const rawBags = Number(
      txn.bags ?? txn.bagCount ?? txn.bagsCount ?? txn.bags_count ?? 0
    );
    const bags = direction === 'OUTWARD' ? -Math.abs(rawBags) : rawBags;

    const ratePerDay = Number(
      txn.ratePerMTPerDay ??
        txn.rate ??
        txn.rateFixedAt ??
        txn.ratePerDayPerMT ??
        txn.ratePerDay ??
        txn.dailyRate ??
        0
    );

    const commodityKey = `${txn.commodityId || txn.commodityName || 'unknown'}::${txn.commodityName || 'Unknown'}`;
    const existing = balanceMap.get(commodityKey);

    if (!existing) {
      balanceMap.set(commodityKey, {
        commodityName: txn.commodityName || 'Unknown',
        quantityMT,
        bags,
        ratePerDay: ratePerDay || 0,
        lastTxnDate: txn._transactionDate || new Date(0),
      });
    } else {
      existing.quantityMT += quantityMT;
      existing.bags += bags;
      if (
        txn._transactionDate &&
        existing.lastTxnDate &&
        txn._transactionDate > existing.lastTxnDate
      ) {
        existing.lastTxnDate = txn._transactionDate;
        if (ratePerDay > 0) {
          existing.ratePerDay = ratePerDay;
        }
      } else if (existing.ratePerDay <= 0 && ratePerDay > 0) {
        existing.ratePerDay = ratePerDay;
      }
    }
  }

  return Array.from(balanceMap.values())
    .filter((balance) => balance.quantityMT > 0)
    .map((balance) => ({
      date: monthStartStr,
      startDate: monthStartStr,
      endDate: billingEndDateStr,
      commodityName: balance.commodityName,
      quantityMT: balance.quantityMT,
      quantity: balance.quantityMT,
      bags: balance.bags || '',
      daysTotal: monthDays,
      rentTotal: Number(balance.quantityMT * balance.ratePerDay * monthDays || 0),
      status: 'OPENING_BALANCE',
      rate: balance.ratePerDay,
      direction: 'OPENING BALANCE',
    }));
}

function transformTransactionsToBillingRows(transactions, invoiceMonth) {
  try {
    const [yearPart, monthPart] = invoiceMonth.split('-');
    const month = Number(monthPart);
    const year = Number(yearPart);

    if (!year || !month || month < 1 || month > 12) {
      return [];
    }

    const monthStartDateStr = `${yearPart}-${monthPart.padStart(2, '0')}-01`;
    const monthStartDate = new Date(`${monthStartDateStr}T00:00:00Z`);
    const monthEnd = new Date(Date.UTC(year, month, 0));
    const monthEndStr = monthEnd.toISOString().split('T')[0];

    const today = new Date();
    const todayMonthKey = `${today.getFullYear()}-${String(
      today.getMonth() + 1
    ).padStart(2, '0')}`;
    const todayStr = today.toISOString().split('T')[0];
    const billingEndDateStr =
      invoiceMonth === todayMonthKey ? todayStr : monthEndStr;
    const billingEndDate = new Date(`${billingEndDateStr}T00:00:00Z`);

    const monthDays = calculateStorageDays(
      monthStartDateStr,
      billingEndDateStr,
      'ACTIVE'
    );

    const preparedTransactions = (transactions || [])
      .map((txn) => {
        const txnDateStr = resolveTransactionDateString(txn);
        const txnDate = parseUTCDate(txnDateStr);

        if (!txnDate) {
          return null;
        }

        return {
          ...txn,
          _transactionDateStr: txnDateStr,
          _transactionDate: txnDate,
        };
      })
      .filter(Boolean);

    const priorTransactions = preparedTransactions.filter(
      (txn) => txn._transactionDate < monthStartDate
    );

    const currentMonthTransactions = preparedTransactions.filter(
      (txn) =>
        txn._transactionDate >= monthStartDate &&
        txn._transactionDate <= billingEndDate
    );

    const openingBalanceRows = buildOpeningBalanceRows(
      priorTransactions,
      monthStartDateStr,
      billingEndDateStr,
      monthDays
    );

    const transactionRows = currentMonthTransactions
      .map((txn) => {
        const direction = (txn.direction || 'INWARD').toUpperCase();
        const txnDateStr = txn._transactionDateStr;
        const rawQuantity = Number(txn.quantityMT ?? txn.quantity ?? txn.qty ?? 0);
        const quantityMT =
          direction === 'OUTWARD' ? -Math.abs(rawQuantity) : rawQuantity;
        const ratePerDay = Number(
          txn.ratePerMTPerDay ??
            txn.rate ??
            txn.rateFixedAt ??
            txn.ratePerDayPerMT ??
            txn.ratePerDay ??
            txn.dailyRate ??
            0
        );
        const bagCountValue =
          txn.bags ??
          txn.bagCount ??
          txn.bagsCount ??
          txn.bagscount ??
          txn.bags_count ??
          '';

        const startDate =
          txnDateStr > monthStartDateStr ? txnDateStr : monthStartDateStr;
        const endDate = billingEndDateStr;
        const days = calculateStorageDays(startDate, endDate, 'ACTIVE');
        const rentTotal = Number(quantityMT * ratePerDay * days || 0);

        if (Number.isNaN(days) || days <= 0) {
          return null;
        }

        return {
          date: txnDateStr,
          startDate,
          endDate,
          commodityName: txn.commodityName || 'Unknown',
          quantityMT,
          quantity: quantityMT,
          bags: bagCountValue,
          daysTotal: days,
          rentTotal,
          status: txn.status || 'COMPLETED',
          rate: ratePerDay,
          direction,
          gatePass: txn.gatePass || txn.gatepass || '',
        };
      })
      .filter(Boolean);

    return [...openingBalanceRows, ...transactionRows].sort((a, b) => {
      const aIsOpening = a.status === 'OPENING_BALANCE';
      const bIsOpening = b.status === 'OPENING_BALANCE';
      if (aIsOpening && !bIsOpening) return -1;
      if (bIsOpening && !aIsOpening) return 1;
      if (a.startDate !== b.startDate) {
        return a.startDate.localeCompare(b.startDate);
      }
      if (a.direction !== b.direction) {
        return a.direction.localeCompare(b.direction);
      }
      if (a.commodityName !== b.commodityName) {
        return a.commodityName.localeCompare(b.commodityName);
      }
      return a.quantityMT - b.quantityMT;
    });
  } catch (error) {
    console.error('Error transforming transactions:', error);
    return [];
  }
}

async function run() {
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

  console.log(`=== RUNNING SIMULATION FOR CLIENT: ${clientId} ===`);

  const txns = await db.collection('transactions').find({
    clientId: clientId,
    warehouseId: warehouseId
  }).toArray();

  console.log(`Found ${txns.length} raw transactions in database.`);
  txns.forEach((t, i) => {
    console.log(`Raw [${i}]: ID=${t._id}, date=${t.date}, dir=${t.direction}, commodity=${t.commodityName}, qty=${t.quantityMT || t.quantity}`);
  });

  const commodityIds = [...new Set(txns.map(t => t.commodityId))];
  const commodities = await db.collection('commodities').find({
    _id: { $in: commodityIds.filter(id => id).map(id => new ObjectId(id)) }
  }).toArray();
  const commodityMap = new Map(commodities.map(c => [c._id.toString(), c]));

  const mappedTransactions = txns.map(txn => {
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
      commodityName: txn.commodityName || txn.commodity || commodity?.name || 'Unknown',
      quantityMT: Number(rawQuantity || 0),
      quantity: Number(rawQuantity || 0),
      bags: rawBags,
      gatePass: txn.gatePass || txn.gatepass || '',
      ratePerMTPerDay,
      monthlyRate: Number(txn.monthlyRate || txn.monthlyRatePerMT || 0),
    };
  });

  console.log("\nMapped Transactions (input to transformTransactionsToBillingRows):");
  mappedTransactions.forEach((t, i) => {
    console.log(`Mapped [${i}]: date=${t.date}, dir=${t.direction}, commodity=${t.commodityName}, qty=${t.quantityMT}, rate=${t.ratePerMTPerDay}`);
  });

  // Let's run parts of transformTransactionsToBillingRows step-by-step
  const [yearPart, monthPart] = invoiceMonth.split('-');
  const month = Number(monthPart);
  const year = Number(yearPart);
  const monthStartDateStr = `${yearPart}-${monthPart.padStart(2, '0')}-01`;
  const monthStartDate = new Date(`${monthStartDateStr}T00:00:00Z`);
  const monthEnd = new Date(Date.UTC(year, month, 0));
  const monthEndStr = monthEnd.toISOString().split('T')[0];
  const billingEndDateStr = '2026-06-19'; // Today is June 19
  const billingEndDate = new Date(`${billingEndDateStr}T00:00:00Z`);

  const preparedTransactions = mappedTransactions
    .map((txn, idx) => {
      const txnDateStr = resolveTransactionDateString(txn);
      const txnDate = parseUTCDate(txnDateStr);

      console.log(`Prep Step [${idx}] (${txn.commodityName} ${txn.direction}):`);
      console.log(`  - txn.date:`, txn.date, `(type: ${typeof txn.date})`);
      console.log(`  - txn.inwardDate:`, txn.inwardDate);
      console.log(`  - txn.outwardDate:`, txn.outwardDate);
      console.log(`  - txn.actualOutwardDate:`, txn.actualOutwardDate);
      console.log(`  - resolved txnDateStr:`, txnDateStr);
      console.log(`  - resolved txnDate:`, txnDate);

      if (!txnDate) {
        return null;
      }

      return {
        ...txn,
        _transactionDateStr: txnDateStr,
        _transactionDate: txnDate,
      };
    })
    .filter(Boolean);

  console.log("\nPrepared Transactions:");
  preparedTransactions.forEach((t, i) => {
    console.log(`Prep [${i}]: _transactionDateStr=${t._transactionDateStr}, _transactionDate=${t._transactionDate.toISOString()}, dir=${t.direction}, commodity=${t.commodityName}`);
  });

  const currentMonthTransactions = preparedTransactions.filter(
    (txn) =>
      txn._transactionDate >= monthStartDate &&
      txn._transactionDate <= billingEndDate
  );

  console.log("\nCurrent Month Transactions:");
  currentMonthTransactions.forEach((t, i) => {
    console.log(`Current [${i}]: _transactionDateStr=${t._transactionDateStr}, dir=${t.direction}, commodity=${t.commodityName}`);
  });

  const transactionRows = currentMonthTransactions
    .map((txn) => {
      const direction = (txn.direction || 'INWARD').toUpperCase();
      const txnDateStr = txn._transactionDateStr;
      const rawQuantity = Number(txn.quantityMT ?? txn.quantity ?? txn.qty ?? 0);
      const quantityMT =
        direction === 'OUTWARD' ? -Math.abs(rawQuantity) : rawQuantity;
      const ratePerDay = txn.ratePerMTPerDay;
      const bagCountValue = txn.bags;

      const startDate =
        txnDateStr > monthStartDateStr ? txnDateStr : monthStartDateStr;
      const endDate = billingEndDateStr;
      const days = calculateStorageDays(startDate, endDate, 'ACTIVE');
      const rentTotal = Number(quantityMT * ratePerDay * days || 0);

      const isSkipped = (Number.isNaN(days) || days <= 0);

      console.log(`Mapping Current: date=${txnDateStr}, dir=${direction}, commodity=${txn.commodityName}, qty=${quantityMT}, days=${days}, rent=${rentTotal}, isSkipped=${isSkipped}`);

      if (isSkipped) {
        return null;
      }

      return {
        date: txnDateStr,
        startDate,
        endDate,
        commodityName: txn.commodityName || 'Unknown',
        quantityMT,
        quantity: quantityMT,
        bags: bagCountValue,
        daysTotal: days,
        rentTotal,
        status: txn.status || 'COMPLETED',
        rate: ratePerDay,
        direction,
        gatePass: txn.gatePass || txn.gatepass || '',
      };
    })
    .filter(Boolean);


  console.log(`\nSimulation returned ${transactionRows.length} billing rows:`);
  transactionRows.forEach((r, idx) => {
    console.log(`[${idx}] ${r.startDate} to ${r.endDate} | ${r.direction} | ${r.commodityName} | Qty: ${r.quantityMT} | Days: ${r.daysTotal} | Rent: ${r.rentTotal}`);
  });

  await client.close();
}

run().catch(console.error);
