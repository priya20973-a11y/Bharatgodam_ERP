const mongoose = require('mongoose');

async function checkAllInvoices() {
  // Connect to database like the app does
  const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017';
  const MONGODB_DB = process.env.MONGODB_DB || 'wms_production';

  await mongoose.connect(MONGODB_URL, { dbName: MONGODB_DB });
  const db = mongoose.connection.db;

  console.log('Checking all invoice amounts by month...');

  // Get all invoices
  const allInvoices = await db.collection('invoice_master').find({}).toArray();

  console.log('Total invoices:', allInvoices.length);

  // Group by month and client
  const monthlyClientTotals = new Map();

  for (const invoice of allInvoices) {
    const month = invoice.invoiceMonth;
    const clientId = invoice.clientId.toString();
    const totalAmount = Number(invoice.totalAmount || 0);

    const key = `${month}-${clientId}`;
    if (!monthlyClientTotals.has(key)) {
      monthlyClientTotals.set(key, { month, clientId, total: 0, count: 0 });
    }

    const data = monthlyClientTotals.get(key);
    data.total += totalAmount;
    data.count += 1;
  }

  // Get unique months and clients
  const months = [...new Set(allInvoices.map(inv => inv.invoiceMonth))].sort();
  const clientIds = [...new Set(allInvoices.map(inv => inv.clientId.toString()))];

  const clients = await db.collection('clients').find({
    _id: { $in: clientIds.map(id => new mongoose.Types.ObjectId(id)) }
  }).toArray();

  const clientMap = new Map(clients.map(c => [c._id.toString(), c.name]));

  console.log('\nInvoice Totals by Month and Client:');
  for (const month of months) {
    console.log(`\n${month}:`);
    let monthTotal = 0;
    const monthClients = Array.from(monthlyClientTotals.values())
      .filter(data => data.month === month)
      .sort((a, b) => (clientMap.get(a.clientId) || '').localeCompare(clientMap.get(b.clientId) || ''));

    for (const data of monthClients) {
      const clientName = clientMap.get(data.clientId) || 'Unknown';
      const total = Math.round(data.total * 100) / 100;
      monthTotal += total;
      console.log(`  ${clientName}: ₹${total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
    }
    console.log(`  Month Total: ₹${monthTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
  }

  await mongoose.disconnect();
}

checkAllInvoices().catch(console.error);