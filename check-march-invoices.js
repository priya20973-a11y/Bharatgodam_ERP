const mongoose = require('mongoose');

async function checkMarchInvoices() {
  // Connect to database like the app does
  const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017';
  const MONGODB_DB = process.env.MONGODB_DB || 'wms_production';

  await mongoose.connect(MONGODB_URL, { dbName: MONGODB_DB });
  const db = mongoose.connection.db;

  console.log('Checking March 2026 invoice amounts...');

  // Get all invoices for March 2026
  const marchInvoices = await db.collection('invoice_master').find({
    invoiceMonth: '2026-03'
  }).toArray();

  console.log('Total March invoices:', marchInvoices.length);

  // Group by client
  const clientTotals = new Map();

  for (const invoice of marchInvoices) {
    const clientId = invoice.clientId.toString();
    const totalAmount = Number(invoice.totalAmount || 0);

    if (!clientTotals.has(clientId)) {
      clientTotals.set(clientId, { total: 0, count: 0 });
    }

    const data = clientTotals.get(clientId);
    data.total += totalAmount;
    data.count += 1;
  }

  // Get client names and display results
  const clientIds = Array.from(clientTotals.keys());
  const clients = await db.collection('clients').find({
    _id: { $in: clientIds.map(id => new mongoose.Types.ObjectId(id)) }
  }).toArray();

  const clientMap = new Map(clients.map(c => [c._id.toString(), c.name]));

  console.log('\nMarch 2026 Invoice Totals by Client:');
  let grandTotal = 0;
  for (const [clientId, data] of clientTotals) {
    const clientName = clientMap.get(clientId) || 'Unknown';
    const total = Math.round(data.total * 100) / 100;
    grandTotal += total;
    console.log(clientName + ': ₹' + total.toLocaleString('en-IN', { minimumFractionDigits: 2 }));
  }

  console.log('\nGrand Total: ₹' + grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 }));

  await mongoose.disconnect();
}

checkMarchInvoices().catch(console.error);