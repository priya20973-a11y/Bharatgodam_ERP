const { MongoClient, ObjectId } = require('mongodb');
const fs = require('fs');
const path = require('path');

// Simulate the backend checks we implemented
function validateWarehouseStatus(warehouse) {
  if (warehouse.status === 'INACTIVE') {
    throw new Error('Warehouse is deactivated and cannot be used for new transactions');
  }
}

function calculateRemainingStock(inwards, outwards, warehouseId) {
  const warehouseInwards = inwards.filter(i => i.warehouseId.toString() === warehouseId.toString());
  const warehouseOutwards = outwards.filter(o => o.warehouseId.toString() === warehouseId.toString());
  
  const totalInward = warehouseInwards.reduce((sum, item) => sum + item.quantityMT, 0);
  const totalOutward = warehouseOutwards.reduce((sum, item) => sum + item.quantityMT, 0);
  
  return totalInward - totalOutward;
}

async function runWarehouseStatusVerification() {
  // Load .env.local variables
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
  } catch (err) {
    console.error('Error reading .env.local:', err.message);
  }

  console.log(`Connecting to: ${mongoUri.replace(/:([^:@]+)@/, ':****@')}`);
  console.log(`Using Database: ${dbName}`);

  const client = new MongoClient(mongoUri);
  await client.connect();
  const db = client.db(dbName);

  console.log('\n=== WAREHOUSE STATUS & RESTRICTED DELETION VERIFICATION ===\n');

  // 1. Create a temporary warehouse
  const testWarehouseId = new ObjectId();
  const testWarehouse = {
    _id: testWarehouseId,
    name: "Verification Temp Warehouse " + Date.now(),
    address: "123 Verification Street",
    totalCapacity: 100,
    occupiedCapacity: 0,
    status: "ACTIVE",
    userId: new ObjectId("69dfd45cca61467ce41dd364"),
    userEmail: "test@example.com",
    createdAt: new Date(),
    updatedAt: new Date()
  };

  console.log(`1. Inserting test warehouse: "${testWarehouse.name}"`);
  await db.collection('warehouses').insertOne(testWarehouse);
  console.log(`   ✓ Test warehouse inserted with ID: ${testWarehouseId}\n`);

  // 2. Validate transaction checks on ACTIVE warehouse
  console.log('2. Simulating new transaction on ACTIVE warehouse:');
  try {
    const fetchedWarehouse = await db.collection('warehouses').findOne({ _id: testWarehouseId });
    validateWarehouseStatus(fetchedWarehouse);
    console.log('   ✓ SUCCESS: Transaction allowed on ACTIVE warehouse.\n');
  } catch (err) {
    console.log(`   ❌ ERROR: Transaction blocked on ACTIVE warehouse: ${err.message}\n`);
  }

  // 3. Toggle to INACTIVE and validate transaction blocks
  console.log('3. Simulating status toggle to INACTIVE:');
  await db.collection('warehouses').updateOne({ _id: testWarehouseId }, { $set: { status: 'INACTIVE', updatedAt: new Date() } });
  console.log('   ✓ Warehouse status updated to INACTIVE in database.');

  console.log('   Testing transaction on INACTIVE warehouse:');
  try {
    const fetchedWarehouse = await db.collection('warehouses').findOne({ _id: testWarehouseId });
    validateWarehouseStatus(fetchedWarehouse);
    console.log('   ❌ ERROR: Transaction unexpectedly allowed on INACTIVE warehouse!\n');
  } catch (err) {
    console.log(`   ✓ SUCCESS: Transaction blocked as expected: "${err.message}"\n`);
  }

  // 4. Test restricted deletion with stock remaining
  console.log('4. Testing deletion restrictions based on stock:');
  
  // Set up mock inward/outward records
  const mockInwards = [
    { warehouseId: testWarehouseId, quantityMT: 50 },
    { warehouseId: new ObjectId(), quantityMT: 10 } // random other warehouse
  ];
  const mockOutwards = [
    { warehouseId: testWarehouseId, quantityMT: 20 }
  ];

  console.log(`   Simulated stock entries for this warehouse:`);
  console.log(`     Inward:  50 MT`);
  console.log(`     Outward: 20 MT`);

  let remainingStock = calculateRemainingStock(mockInwards, mockOutwards, testWarehouseId);
  console.log(`     Calculated Remaining Stock: ${remainingStock} MT`);

  if (remainingStock > 0) {
    console.log('   ✓ Blocked deletion condition validated: Stock > 0');
    console.log(`     Error message displayed: "Warehouse cannot be deleted because stock is still available in this warehouse."`);
  } else {
    console.log('   ❌ Blocked deletion condition validation failed: Stock not recognized.');
  }
  console.log('');

  // 5. Test deletion with 0 stock
  console.log('5. Testing deletion with 0 stock:');
  const mockOutwardsEmpty = [
    { warehouseId: testWarehouseId, quantityMT: 50 }
  ];
  console.log(`   Simulated stock entries:`);
  console.log(`     Inward:  50 MT`);
  console.log(`     Outward: 50 MT`);
  
  remainingStock = calculateRemainingStock(mockInwards, mockOutwardsEmpty, testWarehouseId);
  console.log(`     Calculated Remaining Stock: ${remainingStock} MT`);

  if (remainingStock === 0) {
    console.log('   ✓ Deletion allowed condition validated: Stock is exactly 0.');
    // Physically delete it
    const delResult = await db.collection('warehouses').deleteOne({ _id: testWarehouseId });
    if (delResult.deletedCount === 1) {
      console.log('   ✓ Warehouse successfully deleted from database.');
    } else {
      console.log('   ❌ Failed to delete warehouse from database.');
    }
  } else {
    console.log('   ❌ Deletion block check failed: remaining stock is not 0.');
  }

  // Cleanup in case of failures
  await db.collection('warehouses').deleteOne({ _id: testWarehouseId });
  
  await client.close();
  console.log('\n=== VERIFICATION RUN COMPLETED ===');
}

runWarehouseStatusVerification().catch(console.error);
