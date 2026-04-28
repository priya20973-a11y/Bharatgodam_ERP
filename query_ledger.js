const { MongoClient } = require('mongodb');

const uri = 'mongodb+srv://root:root@cluster0.7hwq2.mongodb.net/warehouse-management?retryWrites=true&w=majority';

async function queryLedgerEntries() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('warehouse-management');
    const ledgerCollection = db.collection('ledger_entries');
    
    const query = {
      periodStartDate: {
        $gte: new Date('2026-03-01T00:00:00Z'),
        $lt: new Date('2026-04-01T00:00:00Z')
      }
    };
    
    const entries = await ledgerCollection.find(query).project({
      _id: 1,
      commodityName: 1,
      periodStartDate: 1,
      periodEndDate: 1,
      quantityMT: 1,
      status: 1
    }).toArray();
    
    console.log('\n📊 LEDGER ENTRIES FOR MARCH 2026');
    console.log('='.repeat(160));
    console.log(`Total entries: ${entries.length}\n`);
    
    if (entries.length === 0) {
      console.log('No ledger entries found for March 2026');
    } else {
      console.log(String('_id').padEnd(25) + ' | ' + 
                  String('Commodity').padEnd(15) + ' | ' + 
                  String('Start Date').padEnd(12) + ' | ' + 
                  String('End Date').padEnd(12) + ' | ' + 
                  String('Qty (MT)').padEnd(10) + ' | ' + 
                  String('Status').padEnd(15));
      console.log('-'.repeat(160));
      
      entries.forEach(entry => {
        const id = entry._id ? entry._id.toString().substring(0,24) : 'N/A';
        const commodity = entry.commodityName || 'N/A';
        const startDate = entry.periodStartDate ? entry.periodStartDate.toISOString().split('T')[0] : 'N/A';
        const endDate = entry.periodEndDate ? entry.periodEndDate.toISOString().split('T')[0] : 'N/A';
        const qty = entry.quantityMT || 0;
        const status = entry.status || 'N/A';
        
        console.log(String(id).padEnd(25) + ' | ' + 
                    String(commodity).padEnd(15) + ' | ' + 
                    String(startDate).padEnd(12) + ' | ' + 
                    String(endDate).padEnd(12) + ' | ' + 
                    String(qty).padEnd(10) + ' | ' + 
                    String(status).padEnd(15));
      });
    }
    
  } catch (error) {
    console.error('Error querying ledger entries:', error.message);
  } finally {
    await client.close();
  }
}

queryLedgerEntries();
