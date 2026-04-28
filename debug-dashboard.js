const { MongoClient } = require('mongodb');

async function debugDashboardData() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  const db = client.db('wms_production');

  console.log('=== DEBUGGING DASHBOARD DATA ===\n');

  // Simulate the dashboard logic
  const allLedgerEntries = await db.collection('ledger_entries').find({}).toArray();
  console.log(`Total ledger entries: ${allLedgerEntries.length}`);

  // Get client and warehouse maps
  const clients = await db.collection('clients').find({}).toArray();
  const warehouses = await db.collection('warehouses').find({}).toArray();

  const clientMap = new Map();
  const warehouseMap = new Map();

  clients.forEach(client => {
    clientMap.set(client._id.toString(), client.name);
  });

  warehouses.forEach(warehouse => {
    warehouseMap.set(warehouse._id.toString(), warehouse.name);
  });

  console.log(`Client map size: ${clientMap.size}, Warehouse map size: ${warehouseMap.size}`);

  // Process entries like the dashboard does
  const clientWarehouseData = new Map();

  allLedgerEntries.forEach(entry => {
    // Skip entries with missing client or warehouse IDs
    if (!entry.clientId || !entry.warehouseId) {
      console.log(`Skipping entry with missing IDs: ${JSON.stringify(entry)}`);
      return;
    }

    const clientIdStr = entry.clientId.toString();
    const warehouseIdStr = entry.warehouseId.toString();
    const key = `${clientIdStr}-${warehouseIdStr}`;

    // Extract month from periodStartDate - handle both string and Date formats
    let periodStart;
    if (typeof entry.periodStartDate === 'string') {
      periodStart = new Date(entry.periodStartDate + 'T00:00:00Z');
    } else if (entry.periodStartDate instanceof Date) {
      periodStart = new Date(entry.periodStartDate);
    } else {
      periodStart = new Date();
    }

    const monthKey = periodStart.toISOString().slice(0, 7); // YYYY-MM

    if (!clientWarehouseData.has(key)) {
      clientWarehouseData.set(key, {
        clientId: entry.clientId,
        warehouseId: entry.warehouseId,
        clientName: clientMap.get(clientIdStr) || 'Unknown Client',
        warehouseName: warehouseMap.get(warehouseIdStr) || 'Unknown Warehouse',
        monthlyCharges: new Map(),
        totalRevenue: 0
      });
    }

    const data = clientWarehouseData.get(key);
    const currentMonthCharge = data.monthlyCharges.get(monthKey) || 0;
    data.monthlyCharges.set(monthKey, currentMonthCharge + (entry.rentCalculated || 0));
    data.totalRevenue += entry.rentCalculated || 0;
  });

  console.log(`\nProcessed ${clientWarehouseData.size} client-warehouse combinations`);

  // Convert to array format
  const clientWarehouseRevenue = Array.from(clientWarehouseData.values())
    .map(item => {
      const monthlyCharges = {};
      item.monthlyCharges.forEach((charge, month) => {
        monthlyCharges[month] = Math.round(charge * 100) / 100;
      });

      return {
        clientId: item.clientId.toString(),
        warehouseId: item.warehouseId.toString(),
        clientName: item.clientName,
        warehouseName: item.warehouseName,
        monthlyCharges,
        totalRevenue: Math.round(item.totalRevenue * 100) / 100,
        ownerShare: Math.round(item.totalRevenue * 0.6 * 100) / 100,
        platformShare: Math.round(item.totalRevenue * 0.4 * 100) / 100
      };
    })
    .sort((a, b) => a.clientName.localeCompare(b.clientName));

  console.log(`\nFinal result has ${clientWarehouseRevenue.length} rows`);

  // Show sample rows with April data
  const rowsWithApril = clientWarehouseRevenue.filter(row => row.monthlyCharges['2026-04']);
  console.log(`\nRows with April data: ${rowsWithApril.length}`);

  if (rowsWithApril.length > 0) {
    console.log('\nSample April data:');
    rowsWithApril.slice(0, 3).forEach(row => {
      console.log(`${row.clientName} - ${row.warehouseName}: March: ₹${row.monthlyCharges['2026-03'] || 0}, April: ₹${row.monthlyCharges['2026-04'] || 0}`);
    });
  }

  // Show total April revenue
  const totalAprilRevenue = clientWarehouseRevenue.reduce((sum, row) => sum + (row.monthlyCharges['2026-04'] || 0), 0);
  console.log(`\nTotal April revenue: ₹${totalAprilRevenue}`);

  await client.close();
}

debugDashboardData().catch(console.error);