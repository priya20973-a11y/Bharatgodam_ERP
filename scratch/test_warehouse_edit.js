const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
  const dbName = process.env.MONGODB_DB || 'wms_production';
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  const warehouseId = new ObjectId('6a38ef0b8b1bb5d438810c42');
  const transactionId = new ObjectId('6a38ef288b1bb5d438810c44');

  // Let's first look at the current state:
  let warehouse = await db.collection('warehouses').findOne({ _id: warehouseId });
  let transaction = await db.collection('transactions').findOne({ _id: transactionId });

  console.log('=== BEFORE EDIT ===');
  console.log('Warehouse Occupied Capacity:', warehouse.occupiedCapacity);
  console.log('Transaction Date:', transaction.date);
  console.log('Transaction Quantity:', transaction.quantityMT);

  // Check how many stock entries are linked to this transaction
  let stockEntriesCount = await db.collection('stock_entries').countDocuments({
    $or: [
      { remarks: `Synced from transaction ${transactionId.toString()}` },
      { gatePass: transaction.gatePass }
    ]
  });
  console.log('Stock entries linked:', stockEntriesCount);

  // Let's simulate changing date to June 17, quantity remaining same (100 MT)
  console.log('\n--- SIMULATING EDIT: Date change only (15 -> 17) ---');
  let oldQuantity = Number(transaction.quantityMT || 0);
  let parsedQuantity = 100; // Same quantity

  let capChangeDateOnly = 0;
  if (parsedQuantity !== oldQuantity) {
    const qtyDiff = parsedQuantity - oldQuantity;
    capChangeDateOnly = transaction.direction === 'INWARD' ? qtyDiff : -qtyDiff;
  }
  console.log('Capacity change needed for date edit:', capChangeDateOnly);
  
  // Now let's simulate changing quantity to 150 MT (a diff of +50 MT)
  console.log('\n--- SIMULATING EDIT: Quantity change (100 -> 150) ---');
  parsedQuantity = 150;
  let capChangeQty = 0;
  if (parsedQuantity !== oldQuantity) {
    const qtyDiff = parsedQuantity - oldQuantity;
    capChangeQty = transaction.direction === 'INWARD' ? qtyDiff : -qtyDiff;
  }
  console.log('Capacity change needed for quantity edit (100 -> 150):', capChangeQty);

  // Verify that the isDirectTransaction flag behaves correctly
  const isDirectTransaction = !transaction.sourceType || (transaction.sourceType !== 'inward' && transaction.sourceType !== 'outward');
  console.log('\nIs direct transaction (uses stock entries):', isDirectTransaction);

  await client.close();
}

main().catch(console.error);
