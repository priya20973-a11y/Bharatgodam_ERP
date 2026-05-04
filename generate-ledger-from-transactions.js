const { MongoClient, ObjectId } = require('mongodb');

async function generateLedgerEntriesFromTransactions() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  const db = client.db('wms_production');

  console.log('=== GENERATING LEDGER ENTRIES FROM TRANSACTIONS ===\n');

  // Get all clients
  const allClients = await db.collection('clients').find({}).toArray();
  console.log(`Found ${allClients.length} clients\n`);

  let totalEntriesCreated = 0;
  let totalRentCalculated = 0;

  for (const client of allClients) {
    const clientId = client._id.toString();
    const clientName = client.name;

    console.log(`Processing client: ${clientName} (${clientId})`);

    // Get all transactions for this client
    const transactions = await db.collection('transactions').find({
      clientId: clientId
    }).sort({ date: 1 }).toArray();

    if (transactions.length === 0) {
      console.log(`  No transactions found for ${clientName}\n`);
      continue;
    }

    console.log(`  Found ${transactions.length} transactions`);

    // Group transactions by commodity and warehouse
    const commodityWarehouseGroups = new Map();

    for (const txn of transactions) {
      const key = `${txn.commodityId}-${txn.warehouseId}`;
      if (!commodityWarehouseGroups.has(key)) {
        commodityWarehouseGroups.set(key, {
          commodityId: txn.commodityId,
          warehouseId: txn.warehouseId,
          transactions: []
        });
      }
      commodityWarehouseGroups.get(key).transactions.push(txn);
    }

    console.log(`  Processing ${commodityWarehouseGroups.size} commodity-warehouse groups`);

    // Process each group
    for (const [key, group] of commodityWarehouseGroups) {
      const { commodityId, warehouseId, transactions: groupTxns } = group;

      // Get commodity details for rate
      const commodity = await db.collection('commodities').findOne({ _id: new ObjectId(commodityId) });
      if (!commodity) {
        console.log(`    Skipping group ${key} - commodity not found`);
        continue;
      }

      const ratePerMtPerDay = commodity.ratePerMtPerDay || 10;
      console.log(`    Processing ${groupTxns.length} transactions for ${commodity.name} at ₹${ratePerMtPerDay}/MT/day`);

      // Calculate storage periods
      const periods = calculateStoragePeriods(groupTxns, ratePerMtPerDay);

      // Create ledger entries for each period
      for (const period of periods) {
        // Check if ledger entry already exists
        const existingEntry = await db.collection('ledger_entries').findOne({
          clientId: client._id,
          commodityId: new ObjectId(commodityId),
          warehouseId: new ObjectId(warehouseId),
          fromDate: period.fromDate,
          toDate: period.toDate
        });

        if (existingEntry) {
          console.log(`    Skipping existing entry for period ${period.fromDate} to ${period.toDate}`);
          continue;
        }

        const ledgerEntry = {
          clientId: client._id,
          clientName: clientName,
          commodityId: new ObjectId(commodityId),
          commodityName: commodity.name,
          warehouseId: new ObjectId(warehouseId),
          warehouseName: (await db.collection('warehouses').findOne({ _id: new ObjectId(warehouseId) }))?.name || 'Unknown',
          fromDate: period.fromDate,
          toDate: period.toDate,
          quantityMT: period.quantity,
          days: period.days,
          ratePerMtPerDay: ratePerMtPerDay,
          rent: period.rent,
          status: period.status,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        await db.collection('ledger_entries').insertOne(ledgerEntry);
        totalEntriesCreated++;
        totalRentCalculated += period.rent;

        console.log(`    Created entry: ${period.fromDate} to ${period.toDate} - ${period.quantity}MT × ${period.days} days = ₹${period.rent}`);
      }
    }

    console.log(`  Completed processing ${clientName}\n`);
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Total ledger entries created: ${totalEntriesCreated}`);
  console.log(`Total rent calculated: ₹${totalRentCalculated.toFixed(2)}`);

  await client.close();
}

function calculateStoragePeriods(transactions, ratePerMtPerDay) {
  const periods = [];
  let currentStock = 0;
  let currentPeriodStart = null;
  let lastDate = null;

  // Sort transactions by date
  transactions.sort((a, b) => new Date(a.date) - new Date(b.date));

  for (const txn of transactions) {
    const txnDate = new Date(txn.date);
    const quantity = txn.quantityMT || 0;
    const isInward = txn.direction === 'INWARD';

    // If we have a current period, close it before this transaction
    if (currentPeriodStart && currentStock > 0 && lastDate) {
      const periodEnd = new Date(txnDate);
      periodEnd.setDate(periodEnd.getDate() - 1); // End day before this transaction

      if (periodEnd >= currentPeriodStart) {
        const days = Math.ceil((periodEnd - currentPeriodStart) / (1000 * 60 * 60 * 24)) + 1;
        const rent = currentStock * ratePerMtPerDay * days;

        periods.push({
          fromDate: currentPeriodStart,
          toDate: periodEnd,
          quantity: currentStock,
          days: days,
          rent: Math.round(rent * 100) / 100, // Round to 2 decimal places
          status: 'ACTIVE'
        });
      }
    }

    // Update stock
    if (isInward) {
      currentStock += quantity;
    } else {
      currentStock = Math.max(0, currentStock - quantity);
    }

    // Start new period if we have stock
    if (currentStock > 0) {
      currentPeriodStart = new Date(txnDate);
    } else {
      currentPeriodStart = null;
    }

    lastDate = new Date(txnDate);
  }

  // Close final period if stock remains
  if (currentPeriodStart && currentStock > 0 && lastDate) {
    const periodEnd = new Date(); // Current date as end
    const days = Math.ceil((periodEnd - currentPeriodStart) / (1000 * 60 * 60 * 24)) + 1;
    const rent = currentStock * ratePerMtPerDay * days;

    periods.push({
      fromDate: currentPeriodStart,
      toDate: periodEnd,
      quantity: currentStock,
      days: days,
      rent: Math.round(rent * 100) / 100,
      status: 'ACTIVE'
    });
  }

  return periods;
}

generateLedgerEntriesFromTransactions().catch(console.error);