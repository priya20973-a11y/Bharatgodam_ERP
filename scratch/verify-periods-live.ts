import { MongoClient, ObjectId } from 'mongodb';
import { getTransactionsForInvoiceMonth } from '../app/api/invoice/utils';
import * as fs from 'fs';
import * as path from 'path';

async function test() {
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
  } catch (err) {}

  const client = new MongoClient(mongoUri);
  await client.connect();
  const db = client.db(dbName);

  const clientId = '6a34dea6afcdcf5066353093';
  const warehouseId = '6a34de20afcdcf5066353092';
  const invoiceMonth = '2026-06';
  const tenantFilter = {};

  console.log('=== VERIFYING VIA REAL IMPLEMENTATION ===');

  const transactions = await getTransactionsForInvoiceMonth(
    db,
    clientId,
    warehouseId,
    invoiceMonth,
    tenantFilter
  );

  console.log(`getTransactionsForInvoiceMonth returned ${transactions.length} transactions:`);
  transactions.forEach((t: any, i: number) => {
    console.log(`[${i}] Date (formatted): ${t.date}`);
    console.log(`    Commodity: ${t.commodityName}`);
    console.log(`    Direction: ${t.direction}`);
    console.log(`    Quantity:  ${t.quantityMT}`);
  });

  await client.close();
}

test().catch(console.error);
