const mongoose = require('mongoose');

async function checkInvoiceGeneration() {
  const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017';
  const MONGODB_DB = process.env.MONGODB_DB || 'wms_production';

  await mongoose.connect(MONGODB_URL, { dbName: MONGODB_DB });
  const db = mongoose.connection.db;

  console.log('Checking if invoices should be generated from ledger data...');

  // Get March ledger totals by client
  const marchEntries = await db.collection('ledger_entries').find({
    periodStartDate: { $regex: /^2026-03/ }
  }).toArray();

  const clientTotals = new Map();
  for (const entry of marchEntries) {
    const clientId = entry.clientId.toString();
    const rent = Number(entry.rentCalculated || 0);

    if (!clientTotals.has(clientId)) {
      clientTotals.set(clientId, { total: 0, count: 0 });
    }

    const data = clientTotals.get(clientId);
    data.total += rent;
    data.count += 1;
  }

  // Get client names
  const clientIds = Array.from(clientTotals.keys());
  const clients = await db.collection('clients').find({
    _id: { $in: clientIds.map(id => new mongoose.Types.ObjectId(id)) }
  }).toArray();

  const clientMap = new Map(clients.map(c => [c._id.toString(), c.name]));

  console.log('Expected March 2026 invoice amounts (from ledger):');
  for (const [clientId, data] of clientTotals) {
    const clientName = clientMap.get(clientId) || 'Unknown';
    const total = Math.round(data.total * 100) / 100;
    console.log(clientName + ': ₹' + total.toLocaleString('en-IN', { minimumFractionDigits: 2 }));
  }

  // Check existing invoices
  const existingInvoices = await db.collection('invoice_master').find({
    invoiceMonth: '2026-03'
  }).toArray();

  console.log('\nExisting March invoices: ' + existingInvoices.length);
  for (const invoice of existingInvoices) {
    const clientName = clientMap.get(invoice.clientId.toString()) || 'Unknown';
    console.log(clientName + ': ₹' + (invoice.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 }));
  }

  await mongoose.disconnect();
}

checkInvoiceGeneration().catch(console.error);