const { MongoClient } = require('mongodb');

async function checkDuplicates() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  const db = client.db('wms_production');

  const invoices = await db.collection('invoice_master').find({}).toArray();
  const grouped = {};

  invoices.forEach(inv => {
    const match = inv.invoiceId?.match(/\/(\d{5})$/);
    if (match) {
      const key = `${inv.warehouseId}-${inv.invoiceMonth}`;
      const serial = match[1];
      if (!grouped[key]) grouped[key] = {};
      if (!grouped[key][serial]) grouped[key][serial] = [];
      grouped[key][serial].push(inv.invoiceId);
    }
  });

  let duplicates = 0;
  Object.keys(grouped).forEach(key => {
    Object.keys(grouped[key]).forEach(serial => {
      if (grouped[key][serial].length > 1) {
        duplicates++;
        console.log(`Duplicate serial ${serial} for ${key}:`, grouped[key][serial]);
      }
    });
  });

  console.log('Total duplicate serials found:', duplicates);
  await client.close();
}

checkDuplicates().catch(console.error);