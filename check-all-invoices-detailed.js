const mongoose = require('mongoose');

async function checkAllInvoicesDetailed() {
  // Connect to database like the app does
  const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017';
  const MONGODB_DB = process.env.MONGODB_DB || 'wms_production';

  await mongoose.connect(MONGODB_URL, { dbName: MONGODB_DB });
  const db = mongoose.connection.db;

  console.log('Checking all invoices with details...');

  // Get all invoices
  const allInvoices = await db.collection('invoice_master').find({}).toArray();

  console.log('Total invoices:', allInvoices.length);
  console.log('\nDetailed invoice list:');

  // Get client names
  const clientIds = [...new Set(allInvoices.map(inv => inv.clientId.toString()))];
  const clients = await db.collection('clients').find({
    _id: { $in: clientIds.map(id => new mongoose.Types.ObjectId(id)) }
  }).toArray();

  const clientMap = new Map(clients.map(c => [c._id.toString(), c.name]));

  allInvoices.forEach((invoice, index) => {
    const clientName = clientMap.get(invoice.clientId.toString()) || 'Unknown';
    console.log(`${index + 1}. ${clientName}: ₹${(invoice.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })} (Month: ${invoice.invoiceMonth || 'undefined'})`);
  });

  await mongoose.disconnect();
}

checkAllInvoicesDetailed().catch(console.error);