const { MongoClient } = require('mongodb');

async function debugAprilDashboard() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  const db = client.db('wms_production');

  console.log('=== DEBUG APRIL DASHBOARD ===\n');

  // Get all ledger entries
  const allEntries = await db.collection('ledger_entries').find({}).toArray();
  console.log(`Total ledger entries: ${allEntries.length}`);

  // Count entries by month
  const monthCounts = {};
  allEntries.forEach(entry => {
    let periodStart;
    if (typeof entry.periodStartDate === 'string') {
      periodStart = new Date(entry.periodStartDate + 'T00:00:00Z');
    } else if (entry.periodStartDate instanceof Date) {
      periodStart = new Date(entry.periodStartDate);
    } else {
      periodStart = new Date();
    }

    const monthKey = periodStart.toISOString().slice(0, 7);
    monthCounts[monthKey] = (monthCounts[monthKey] || 0) + 1;
  });

  console.log('Entries by month:');
  Object.keys(monthCounts).sort().forEach(month => {
    console.log(`  ${month}: ${monthCounts[month]} entries`);
  });

  // Get clients and warehouses
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

  // Process like dashboard
  const clientWarehouseData = new Map();

  allEntries.forEach(entry => {
    if (!entry.clientId || !entry.warehouseId) return;

    const clientIdStr = entry.clientId.toString();
    const warehouseIdStr = entry.warehouseId.toString();
    const key = `${clientIdStr}-${warehouseIdStr}`;

    let periodStart;
    if (typeof entry.periodStartDate === 'string') {
      periodStart = new Date(entry.periodStartDate + 'T00:00:00Z');
    } else if (entry.periodStartDate instanceof Date) {
      periodStart = new Date(entry.periodStartDate);
    } else {
      periodStart = new Date();
    }

    const monthKey = periodStart.toISOString().slice(0, 7);

    if (!clientWarehouseData.has(key)) {
      clientWarehouseData.set(key, {
        clientName: clientMap.get(clientIdStr) || 'Unknown',
        warehouseName: warehouseMap.get(warehouseIdStr) || 'Unknown',
        monthlyCharges: {},
        totalRevenue: 0
      });
    }

    const data = clientWarehouseData.get(key);
    data.monthlyCharges[monthKey] = (data.monthlyCharges[monthKey] || 0) + (entry.rentCalculated || 0);
    data.totalRevenue += entry.rentCalculated || 0;
  });

  console.log(`\nProcessed ${clientWarehouseData.size} client-warehouse combinations`);

  // Check for April data
  let aprilRows = 0;
  let totalAprilRevenue = 0;

  clientWarehouseData.forEach((data, key) => {
    if (data.monthlyCharges['2026-04']) {
      aprilRows++;
      totalAprilRevenue += data.monthlyCharges['2026-04'];
      console.log(`April data: ${data.clientName} - ${data.warehouseName}: ₹${data.monthlyCharges['2026-04']}`);
    }
  });

  console.log(`\nRows with April data: ${aprilRows}`);
  console.log(`Total April revenue: ₹${totalAprilRevenue}`);

  await client.close();
}

debugAprilDashboard().catch(console.error);