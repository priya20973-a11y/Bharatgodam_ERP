/*
  Usage:
    MONGODB_URL="your_mongo_uri" MONGODB_DB="your_db_name" node scripts/delete-client-data.js "Ranjanaben Bhalala"
    MONGODB_URL="your_mongo_uri" MONGODB_DB="your_db_name" node scripts/delete-client-data.js "Ranjanaben Bhalala" --warehouse "Warehouse Name"
    MONGODB_URL="your_mongo_uri" MONGODB_DB="your_db_name" node scripts/delete-client-data.js --warehouse "Warehouse Name"

  This script removes all data for one or more clients with the exact name provided.
  It can also remove one warehouse by exact name or ID when passed with --warehouse or --warehouseId.
  It cleans:
    - clients
    - bookings
    - transactions
    - stock_entries
    - ledger_entries
    - ledger_time_state
    - invoice_master
    - invoice_line_items
    - invoice_adjustments
    - payments
    - warehouses (when warehouse is specified)
    - optional legacy collections if present
*/

const { MongoClient, ObjectId } = require('mongodb');

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('Usage: node scripts/delete-client-data.js "Client Name" [--warehouse "Warehouse Name" | --warehouseId <warehouseId>]');
    process.exit(1);
  }

  let clientName = '';
  let warehouseName = '';
  let warehouseIdArg = '';

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--warehouse' && args[i + 1]) {
      warehouseName = args[i + 1];
      i += 1;
    } else if (arg === '--warehouseId' && args[i + 1]) {
      warehouseIdArg = args[i + 1];
      i += 1;
    } else if (!clientName) {
      clientName = arg;
    } else {
      clientName += ` ${arg}`;
    }
  }

  clientName = clientName.trim();
  if (!clientName && !warehouseName && !warehouseIdArg) {
    console.error('Client name cannot be empty unless you also provide --warehouse or --warehouseId');
    process.exit(1);
  }

  const MONGODB_URL = process.env.MONGODB_URL;
  const MONGODB_DB = process.env.MONGODB_DB;

  if (!MONGODB_URL || !MONGODB_DB) {
    console.error('Please set MONGODB_URL and MONGODB_DB environment variables.');
    process.exit(1);
  }

  const client = new MongoClient(MONGODB_URL, { maxPoolSize: 5 });
  await client.connect();
  const db = client.db(MONGODB_DB);

  const hasClientName = clientName.length > 0;

  let clients = [];
  if (hasClientName) {
    clients = await db.collection('clients').find({ name: clientName }).toArray();

    if (clients.length === 0) {
      console.error(`No client found with name: ${clientName}`);
      await client.close();
      process.exit(1);
    }

    console.log(`Found ${clients.length} client(s) with name: ${clientName}`);
    clients.forEach((c) => console.log(` - ${c._id.toString()}`));
  }

  const clientIds = clients.map((c) => c._id).filter((id) => id);
  const clientIdStrings = clientIds.map((id) => id.toString());

  const warehouseIdCandidates = [];
  if (warehouseIdArg) {
    try {
      warehouseIdCandidates.push(new ObjectId(warehouseIdArg));
    } catch {
      warehouseIdCandidates.push(warehouseIdArg);
    }
    warehouseIdCandidates.push(warehouseIdArg);
  }

  let warehouseIds = [];
  let warehouseNameQuery = null;

  if (warehouseName || warehouseIdCandidates.length > 0) {
    const warehouseLookupQuery = { $or: [] };
    if (warehouseName) {
      warehouseLookupQuery.$or.push({ name: warehouseName });
    }
    if (warehouseIdCandidates.length > 0) {
      warehouseIdCandidates.forEach((candidate) => {
        warehouseLookupQuery.$or.push({ _id: candidate });
      });
    }

    const warehouses = await db.collection('warehouses').find(warehouseLookupQuery).toArray();
    if (warehouses.length === 0) {
      console.error('No warehouses found matching provided warehouse name or id');
      await client.close();
      process.exit(1);
    }

    warehouseIds = warehouses.map((ws) => ws._id).filter((id) => id);
    warehouseNameQuery = warehouseName || null;

    console.log(`Found ${warehouses.length} warehouse(s) to delete:`);
    warehouses.forEach((ws) => console.log(` - ${ws._id.toString()} ${ws.name || ''}`));
  }

  const warehouseIdStrings = warehouseIds.map((id) => id.toString());

  const warehouseQuery = warehouseIds.length > 0 ? {
    $or: [
      { warehouseId: { $in: warehouseIds } },
      { warehouseId: { $in: warehouseIdStrings } },
      ...(warehouseNameQuery ? [{ warehouseName: warehouseNameQuery }] : []),
    ],
  } : null;

  const invoiceMasterFilters = [];
  if (clientIds.length > 0) {
    invoiceMasterFilters.push({ clientId: { $in: clientIds } });
  }
  if (warehouseQuery) {
    invoiceMasterFilters.push(warehouseQuery);
  }

  const invoiceMasters = invoiceMasterFilters.length > 0
    ? await db.collection('invoice_master').find({ $or: invoiceMasterFilters }).toArray()
    : [];

  const invoiceMasterIds = invoiceMasters.map((inv) => inv._id).filter((id) => id);
  const invoiceIds = invoiceMasters
    .map((inv) => inv.invoiceId)
    .filter((value) => typeof value === 'string' && value.trim().length > 0);

  const transactionFilters = [];
  if (clientIds.length > 0) {
    transactionFilters.push({ clientId: { $in: clientIds } });
    transactionFilters.push({ accountId: { $in: clientIdStrings } });
  }
  if (warehouseQuery) {
    transactionFilters.push(warehouseQuery);
  }

  const transactions = transactionFilters.length > 0
    ? await db.collection('transactions')
        .find({ $or: transactionFilters })
        .project({ _id: 1 })
        .toArray()
    : [];
  const transactionIds = transactions.map((txn) => txn._id.toString());

  const deleteActions = [
    {
      name: 'bookings',
      query: {
        $or: [
          { clientId: { $in: clientIds } },
          { accountId: { $in: clientIdStrings } },
          { clientName },
          ...(warehouseQuery ? [warehouseQuery] : []),
        ],
      },
    },
    {
      name: 'transactions',
      query: {
        $or: [
          { clientId: { $in: clientIds } },
          { accountId: { $in: clientIdStrings } },
          ...(warehouseQuery ? [warehouseQuery] : []),
        ],
      },
    },
    {
      name: 'stock_entries',
      query: {
        $or: [
          { clientId: { $in: clientIds } },
          ...(warehouseQuery ? [warehouseQuery] : []),
        ],
      },
    },
    {
      name: 'ledger_entries',
      query: {
        $or: [
          { clientId: { $in: clientIds } },
          ...(warehouseQuery ? [warehouseQuery] : []),
        ],
      },
    },
    {
      name: 'ledger_time_state',
      query: {
        $or: [
          { accountId: { $in: clientIdStrings } },
          { 'affectedTransaction.transactionId': { $in: transactionIds } },
          ...(warehouseQuery ? [warehouseQuery] : []),
        ],
      },
    },
    {
      name: 'payments',
      query: {
        $or: [
          { clientId: { $in: clientIds } },
          { accountId: { $in: clientIdStrings } },
          { invoiceId: { $in: invoiceIds } },
          ...(warehouseQuery ? [warehouseQuery] : []),
        ],
      },
    },
    {
      name: 'invoice_master',
      query: {
        $or: [
          { clientId: { $in: clientIds } },
          ...(warehouseQuery ? [warehouseQuery] : []),
        ],
      },
    },
    {
      name: 'invoice_line_items',
      query: { invoiceMasterId: { $in: invoiceMasterIds } },
    },
    {
      name: 'invoice_adjustments',
      query: {
        $or: [
          { masterId: { $in: invoiceMasterIds.map((id) => id.toString()) } },
          { invoiceId: { $in: invoiceIds } },
          ...(warehouseQuery ? [warehouseQuery] : []),
        ],
      },
    },
    {
      name: 'clients',
      query: { _id: { $in: clientIds } },
    },
    ...(warehouseIds.length > 0 ? [{
      name: 'warehouses',
      query: {
        $or: [
          { _id: { $in: warehouseIds } },
          ...(warehouseName ? [{ name: warehouseName }] : []),
        ],
      },
    }] : []),
  ];

  // Optional legacy/auxiliary collections, if present
  const extraCollections = [
    { name: 'inwards', query: { $or: [{ clientId: { $in: clientIds } }, { clientName }] } },
    { name: 'outwards', query: { $or: [{ clientId: { $in: clientIds } }, { clientName }] } },
    { name: 'revenue_distributions', query: { $or: [{ clientId: { $in: clientIds } }, { clientName }] } },
    { name: 'revenuedistributions', query: { $or: [{ clientId: { $in: clientIds } }, { clientName }] } },
  ];

  for (const action of deleteActions) {
    const result = await db.collection(action.name).deleteMany(action.query);
    console.log(`Deleted ${result.deletedCount} document(s) from ${action.name}`);
  }

  for (const extra of extraCollections) {
    const exists = await db.listCollections({ name: extra.name }).hasNext();
    if (!exists) continue;
    const result = await db.collection(extra.name).deleteMany(extra.query);
    console.log(`Deleted ${result.deletedCount} document(s) from ${extra.name}`);
  }

  console.log(`Client cleanup complete for '${clientName}'`);
  await client.close();
}

main().catch((error) => {
  console.error('Script failed:', error);
  process.exit(1);
});
