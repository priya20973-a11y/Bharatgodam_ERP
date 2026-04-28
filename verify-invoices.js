const { MongoClient } = require('mongodb');

async function verifyInvoiceGeneration() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  const db = client.db('wms_production');

  console.log('=== VERIFYING INVOICE GENERATION ===\n');

  // Check all collections that might contain invoices
  const collections = await db.listCollections().toArray();
  const invoiceCollections = collections.filter(col =>
    col.name.toLowerCase().includes('invoice') ||
    col.name.toLowerCase().includes('bill') ||
    col.name.toLowerCase().includes('payment')
  );

  console.log('Invoice-related collections:');
  invoiceCollections.forEach(col => console.log(`  - ${col.name}`));

  // Check invoice_master again with different query
  const allInvoices = await db.collection('invoice_master').find({}).toArray();
  console.log(`\nTotal invoices in invoice_master: ${allInvoices.length}`);

  // Check for invoices with different status or date ranges
  const draftInvoices = await db.collection('invoice_master').find({ status: 'DRAFT' }).toArray();
  const paidInvoices = await db.collection('invoice_master').find({ status: 'PAID' }).toArray();

  console.log(`Draft invoices: ${draftInvoices.length}`);
  console.log(`Paid invoices: ${paidInvoices.length}`);

  // Check for March 2026 invoices specifically
  const marchInvoices = await db.collection('invoice_master').find({
    $or: [
      { month: '2026-03' },
      { invoiceMonth: '2026-03' },
      { month: 'March 2026' },
      { invoiceMonth: 'March 2026' },
      { invoiceDate: { $gte: new Date('2026-03-01'), $lt: new Date('2026-04-01') } }
    ]
  }).toArray();

  console.log(`\nMarch 2026 invoices: ${marchInvoices.length}`);
  marchInvoices.forEach(inv => {
    console.log(`  - ${inv.invoiceNumber || inv.invoiceId}: ₹${inv.totalAmount?.toLocaleString('en-IN')} (${inv.status})`);
  });

  // Check if there are other invoice collections
  for (const col of invoiceCollections) {
    if (col.name !== 'invoice_master') {
      const count = await db.collection(col.name).countDocuments();
      console.log(`\n${col.name}: ${count} documents`);
      if (count > 0 && count < 50) {
        const sample = await db.collection(col.name).findOne();
        console.log(`Sample from ${col.name}:`, JSON.stringify(sample, null, 2));
      }
    }
  }

  await client.close();
}

verifyInvoiceGeneration().catch(console.error);