const { MongoClient } = require('mongodb');

async function checkClientWarehouseIds() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  const db = client.db('wms_production');

  console.log('=== CHECKING CLIENT WAREHOUSE IDs ===\n');

  const allEntries = await db.collection('ledger_entries').find({}).toArray();

  const marchEntries = [];
  const aprilEntries = [];

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

    if (monthKey === '2026-03') {
      marchEntries.push(entry);
    } else if (monthKey === '2026-04') {
      aprilEntries.push(entry);
    }
  });

  console.log(`March entries: ${marchEntries.length}`);
  console.log(`April entries: ${aprilEntries.length}\n`);

  // Get unique client-warehouse combinations for each month
  const marchCombos = new Set();
  const aprilCombos = new Set();

  marchEntries.forEach(entry => {
    if (entry.clientId && entry.warehouseId) {
      marchCombos.add(`${entry.clientId.toString()}-${entry.warehouseId.toString()}`);
    }
  });

  aprilEntries.forEach(entry => {
    if (entry.clientId && entry.warehouseId) {
      aprilCombos.add(`${entry.clientId.toString()}-${entry.warehouseId.toString()}`);
    }
  });

  console.log(`March combinations: ${marchCombos.size}`);
  console.log(`April combinations: ${marchCombos.size}`);

  // Find intersection
  const intersection = new Set([...marchCombos].filter(x => aprilCombos.has(x)));
  console.log(`Common combinations: ${intersection.size}`);

  if (intersection.size === 0) {
    console.log('\nNo common client-warehouse combinations between March and April!');
    console.log('\nMarch combinations:');
    [...marchCombos].slice(0, 5).forEach(combo => console.log(`  ${combo}`));

    console.log('\nApril combinations:');
    [...aprilCombos].slice(0, 5).forEach(combo => console.log(`  ${combo}`));
  }

  // Check if April entries have valid client/warehouse references
  const clients = await db.collection('clients').find({}).toArray();
  const warehouses = await db.collection('warehouses').find({}).toArray();

  const clientIds = new Set(clients.map(c => c._id.toString()));
  const warehouseIds = new Set(warehouses.map(w => w._id.toString()));

  console.log(`\nValid clients: ${clientIds.size}, Valid warehouses: ${warehouseIds.size}`);

  let aprilValid = 0;
  let aprilInvalid = 0;

  aprilEntries.forEach(entry => {
    const clientId = entry.clientId?.toString();
    const warehouseId = entry.warehouseId?.toString();

    if (clientId && warehouseId && clientIds.has(clientId) && warehouseIds.has(warehouseId)) {
      aprilValid++;
    } else {
      aprilInvalid++;
      console.log(`Invalid April entry: client=${clientId}, warehouse=${warehouseId}`);
    }
  });

  console.log(`\nApril entries: ${aprilValid} valid, ${aprilInvalid} invalid`);

  await client.close();
}

checkClientWarehouseIds().catch(console.error);