const mongoose = require('mongoose');

async function checkMarchLedgerByWarehouse() {
  // Connect to database like the app does
  const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017';
  const MONGODB_DB = process.env.MONGODB_DB || 'wms_production';

  await mongoose.connect(MONGODB_URL, { dbName: MONGODB_DB });
  const db = mongoose.connection.db;

  console.log('Checking March 2026 ledger entries by warehouse...');

  // Get all ledger entries for March 2026
  const marchLedgerEntries = await db.collection('ledger_entries').find({
    periodStartDate: { $regex: /^2026-03/ }
  }).toArray();

  console.log('Total March ledger entries:', marchLedgerEntries.length);

  // Get warehouse names
  const warehouseIds = [...new Set(marchLedgerEntries.map(entry => entry.warehouseId.toString()))];
  const warehouses = await db.collection('warehouses').find({
    _id: { $in: warehouseIds.map(id => new mongoose.Types.ObjectId(id)) }
  }).toArray();

  const warehouseMap = new Map(warehouses.map(w => [w._id.toString(), w.name]));

  // Group by warehouse, then by client
  const warehouseData = new Map();

  for (const entry of marchLedgerEntries) {
    const warehouseId = entry.warehouseId.toString();
    const clientId = entry.clientId.toString();
    const rentCalculated = Number(entry.rentCalculated || 0);

    if (!warehouseData.has(warehouseId)) {
      warehouseData.set(warehouseId, {
        warehouseName: warehouseMap.get(warehouseId) || 'Unknown',
        clients: new Map()
      });
    }

    const warehouse = warehouseData.get(warehouseId);
    if (!warehouse.clients.has(clientId)) {
      warehouse.clients.set(clientId, { total: 0, count: 0 });
    }

    const clientData = warehouse.clients.get(clientId);
    clientData.total += rentCalculated;
    clientData.count += 1;
  }

  // Get client names
  const allClientIds = [];
  for (const warehouse of warehouseData.values()) {
    allClientIds.push(...Array.from(warehouse.clients.keys()));
  }
  const uniqueClientIds = [...new Set(allClientIds)];

  const clients = await db.collection('clients').find({
    _id: { $in: uniqueClientIds.map(id => new mongoose.Types.ObjectId(id)) }
  }).toArray();

  const clientMap = new Map(clients.map(c => [c._id.toString(), c.name]));

  // Display results by warehouse
  console.log('\nMarch 2026 Ledger Totals by Warehouse and Client:');
  for (const [warehouseId, warehouse] of warehouseData) {
    console.log(`\n${warehouse.warehouseName} (${warehouseId}):`);
    let warehouseTotal = 0;

    for (const [clientId, clientData] of warehouse.clients) {
      const clientName = clientMap.get(clientId) || 'Unknown';
      const total = Math.round(clientData.total * 100) / 100;
      warehouseTotal += total;
      console.log(`  ${clientName}: ₹${total.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (${clientData.count} entries)`);
    }

    console.log(`  Warehouse Total: ₹${warehouseTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
  }

  await mongoose.disconnect();
}

checkMarchLedgerByWarehouse().catch(console.error);