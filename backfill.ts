import mongoose from 'mongoose';
import connectToDatabase from './lib/mongoose';
import ColdInward from './lib/models/ColdInward';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function backfill() {
  await connectToDatabase();
  console.log('Connected to DB');

  const inwards = await ColdInward.find({ 'stackAllocations.rowId': { $exists: false } });
  console.log('Found ' + inwards.length + ' inwards to backfill');

  const processedRowIds = new Set();
  let updatedCount = 0;
  let duplicateCount = 0;

  for (const inward of inwards) {
    let needsUpdate = false;
    const clientId = inward.clientId?.toString() || '';
    const commodityId = inward.commodityId?.toString() || '';
    const warehouseId = inward.warehouseId?.toString() || '';
    
    let dateKey = '';
    if (inward.date) {
        dateKey = new Date(inward.date).toISOString().slice(0, 10);
    }
    
    const truckNo = (inward.truckNo || '').trim();
    const weighbridgeSlipNo = (inward.weighbridgeSlipNo || '').trim();
    const receiptKey = [clientId, commodityId, warehouseId, dateKey, truckNo, weighbridgeSlipNo].join('|');

    for (const alloc of inward.stackAllocations as any[]) {
      if (!alloc.rowId) {
        const chamberNo = alloc.chamberNo || alloc.chamberName || '';
        const floorNo = alloc.floorNo || '';
        const stackNo = alloc.stackNo || '';
        const rowId = ['bulkinw', receiptKey, chamberNo, floorNo, stackNo].join('|');

        if (processedRowIds.has(rowId)) {
          duplicateCount++;
        } else {
          processedRowIds.add(rowId);
          alloc.rowId = rowId;
          needsUpdate = true;
        }
      }
    }
    
    if (needsUpdate) {
      await inward.save({ validateBeforeSave: false });
      updatedCount++;
    }
  }

  console.log('Updated ' + updatedCount + ' inwards. Skipped ' + duplicateCount + ' duplicate stack allocations.');
  
  // Create index
  try {
    await ColdInward.collection.createIndex({ 'stackAllocations.rowId': 1 }, { unique: true, sparse: true });
    console.log('Index created successfully');
  } catch (err) {
    console.error('Index creation failed:', err);
  }
  
  process.exit(0);
}

backfill().catch(console.error);