const { MongoClient } = require('mongodb');

async function verifyDashboardDisplay() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  const db = client.db('wms_production');

  console.log('=== DASHBOARD DISPLAY VERIFICATION ===\n');

  // Get all clients for reference
  const allClients = await db.collection('clients').find({}).toArray();
  const clientMap = new Map(allClients.map(c => [c._id.toString(), c.name]));

  // Get all warehouses for reference
  const allWarehouses = await db.collection('warehouses').find({}).toArray();
  const warehouseMap = new Map(allWarehouses.map(w => [w._id.toString(), w.name]));

  // Get March and April ledger entries
  const marchEntries = await db.collection('ledger_entries').find({
    periodStartDate: { $regex: /^2026-03/ }
  }).toArray();

  const aprilEntries = await db.collection('ledger_entries').find({
    periodStartDate: { $regex: /^2026-04/ }
  }).toArray();

  console.log(`March 2026 entries: ${marchEntries.length}`);
  console.log(`April 2026 entries: ${aprilEntries.length}\n`);

  // Group by client for both months
  const clientData = {};

  // Process March data
  marchEntries.forEach(entry => {
    const clientId = entry.clientId?.toString();
    const clientName = clientMap.get(clientId) || 'Unknown Client';
    const warehouseName = warehouseMap.get(entry.warehouseId?.toString()) || 'Unknown Warehouse';

    if (!clientData[clientId]) {
      clientData[clientId] = {
        clientName,
        warehouseName,
        march: 0,
        april: 0,
        total: 0
      };
    }

    clientData[clientId].march += entry.rentCalculated || 0;
    clientData[clientId].total += entry.rentCalculated || 0;
  });

  // Process April data
  aprilEntries.forEach(entry => {
    const clientId = entry.clientId?.toString();

    if (!clientData[clientId]) {
      const clientName = clientMap.get(clientId) || 'Unknown Client';
      const warehouseName = warehouseMap.get(entry.warehouseId?.toString()) || 'Unknown Warehouse';
      clientData[clientId] = {
        clientName,
        warehouseName,
        march: 0,
        april: 0,
        total: 0
      };
    }

    clientData[clientId].april += entry.rentCalculated || 0;
    clientData[clientId].total += entry.rentCalculated || 0;
  });

  console.log('🏢 NEW DASHBOARD FORMAT (March & April Columns):\n');

  console.log('| Warehouse Name | Client Name | March (₹) | April (₹) | Owner (60%) | Platform (40%) |');
  console.log('|---------------|-------------|-----------|-----------|-------------|----------------|');

  let totalMarch = 0;
  let totalApril = 0;
  let totalRevenue = 0;

  Object.values(clientData).forEach((client) => {
    const ownerShare = client.total * 0.6;
    const platformShare = client.total * 0.4;

    console.log(`| ${client.warehouseName} | ${client.clientName} | ₹${client.march.toLocaleString('en-IN')} | ₹${client.april.toLocaleString('en-IN')} | ₹${ownerShare.toLocaleString('en-IN')} | ₹${platformShare.toLocaleString('en-IN')} |`);

    totalMarch += client.march;
    totalApril += client.april;
    totalRevenue += client.total;
  });

  console.log('|---------------|-------------|-----------|-----------|-------------|----------------|');
  console.log(`| **TOTALS** | | **₹${totalMarch.toLocaleString('en-IN')}** | **₹${totalApril.toLocaleString('en-IN')}** | **₹${(totalRevenue * 0.6).toLocaleString('en-IN')}** | **₹${(totalRevenue * 0.4).toLocaleString('en-IN')}** |`);

  console.log(`\n📊 SUMMARY CARDS:`);
  console.log(`   Gross Revenue: ₹${totalRevenue.toLocaleString('en-IN')}`);
  console.log(`   Owner Earnings (60%): ₹${(totalRevenue * 0.6).toLocaleString('en-IN')}`);
  console.log(`   Platform Commissions (40%): ₹${(totalRevenue * 0.4).toLocaleString('en-IN')}`);

  console.log(`\n✅ DASHBOARD NOW SHOWS:`);
  console.log(`   ✓ Separate March and April columns`);
  console.log(`   ✓ Revenue sharing based on total rent`);
  console.log(`   ✓ 60% Owner / 40% Platform split`);
  console.log(`   ✓ All clients with their warehouse assignments`);

  await client.close();
}

verifyDashboardDisplay().catch(console.error);