const mongoose = require('mongoose');
const { ObjectId } = require('mongodb');

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017';
const MONGODB_DB = process.env.MONGODB_DB || 'wms_production';

async function testRevenueCalculation() {
  try {
    // Connect to database
    await mongoose.connect(MONGODB_URL, { dbName: MONGODB_DB });
    const db = mongoose.connection.db;
    
    // Create tenant filter manually for WSP user
    const userId = new ObjectId('69eaf253f99dac99d279ad5c');
    const userEmail = 'bharatgodam.techsolutions@gmail.com';
    
    const tenantFilter = {
      $or: [
        { userId: userId },
        { userEmail: userEmail }
      ]
    };
    
    console.log('Tenant filter:', JSON.stringify(tenantFilter, null, 2));
    
    // Test 1: Get all ledger entries with tenant filter
    const allLedgerEntries = await db.collection('ledger_entries').find(tenantFilter).toArray();
    console.log('\nLedger entries found:', allLedgerEntries.length);
    if (allLedgerEntries.length > 0) {
      console.log('Sample ledger entry:', JSON.stringify(allLedgerEntries[0], null, 2));
    }
    
    // Test 2: Get invoices with tenant filter
    const invoices = await db.collection('invoice_master').find(tenantFilter).toArray();
    console.log('\nInvoices found:', invoices.length);
    if (invoices.length > 0) {
      console.log('Sample invoice:', JSON.stringify(invoices[0], null, 2));
    }
    
    // Test 3: Get warehouse names
    const warehouseIds = [...new Set(allLedgerEntries.map((entry) => entry.warehouseId.toString()))];
    console.log('\nWarehouse IDs from ledger:', warehouseIds);
    
    const warehouses = await db.collection('warehouses').find({
      _id: { $in: warehouseIds.map(id => new ObjectId(id)) },
      ...tenantFilter
    }).toArray();
    
    console.log('Warehouses found:', warehouses.length);
    warehouses.forEach(w => console.log(`- ${w.name}`));
    
    // Test 4: Get invoice totals by warehouse and month
    const invoiceMatch = tenantFilter;
    const invoiceTotals = await db.collection('invoice_master').aggregate([
      { $match: invoiceMatch },
      {
        $group: {
          _id: {
            warehouseId: '$warehouseId',
            month: '$month'
          },
          totalAmount: { $sum: '$totalAmount' }
        }
      }
    ]).toArray();
    
    console.log('\nInvoice totals by warehouse/month:', invoiceTotals.length);
    invoiceTotals.forEach(item => {
      console.log(`- WH: ${item._id.warehouseId}, Month: ${item._id.month}, Total: ${item.totalAmount}`);
    });
    
  } catch (error) {
    console.error('ERROR:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await mongoose.connection.close();
  }
}

testRevenueCalculation();
