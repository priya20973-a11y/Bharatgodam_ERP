const { MongoClient } = require('mongodb');

async function main() {
  const uri = 'mongodb://localhost:27017';
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    const db = client.db('wms_production');
    const ledger = db.collection('ledger_entries');
    
    const results = await ledger.find({
      periodStartDate: {
        $gte: new Date('2026-03-01'),
        $lt: new Date('2026-04-01')
      }
    }).project({
      _id: 1,
      periodStartDate: 1,
      periodEndDate: 1,
      quantityMT: 1,
      commodityName: 1,
      status: 1
    }).sort({ periodStartDate: 1 }).toArray();
    
    console.log('\n📊 LEDGER ENTRIES FOR MARCH 2026');
    console.log('Total records:', results.length);
    console.log('='.repeat(140));
    console.log('\n' + 'ID'.padEnd(26) + 'Commodity'.padEnd(16) + 'Start Date'.padEnd(12) + 'End Date'.padEnd(12) + 'QTY (MT)'.padEnd(10) + 'Status');
    console.log('-'.repeat(140));
    
    results.forEach(r => {
      const id = r._id.toString().substring(0,24);
      const comm = (r.commodityName || '').substring(0,14);
      const start = r.periodStartDate?.toISOString().split('T')[0] || '';
      const end = r.periodEndDate?.toISOString().split('T')[0] || '';
      const qty = r.quantityMT || 0;
      const status = r.status || '';
      console.log(id.padEnd(26) + comm.padEnd(16) + start.padEnd(12) + end.padEnd(12) + String(qty).padEnd(10) + status);
    });
    
  } finally {
    await client.close();
  }
}

main().catch(console.error);
