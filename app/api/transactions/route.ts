import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { generateTimeStateLedger } from '@/lib/ledger-time-state-engine';
import { createStockEntry, generateMonthlyInvoices } from '@/app/actions/stock-ledger-actions';
import { getTenantFilterForMongo, appendOwnershipForMongo, isAdmin } from '@/lib/ownership';
import Warehouse from '@/lib/models/Warehouse';
import { ObjectId } from 'mongodb';
import { calculateRent } from '@/lib/pricing-engine';
import { validateOutwardStock } from '@/app/actions/transaction-actions';

function extractInvoiceMonth(dateString: string) {
  if (!dateString) return '';
  const parsed = new Date(dateString);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 7);
}

function normalizeDateToYYYYMMDD(d: any): string {
  if (!d) return '';
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return '';

  const match = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }

  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function getTransactionInfo(db: any, transactionId: string, sourceType?: string) {
  if (!transactionId || !ObjectId.isValid(transactionId)) return null;
  const objectId = new ObjectId(transactionId);
  let transaction: any = null;
  let resolvedSourceType = sourceType ? String(sourceType).toLowerCase() : '';

  // 1. If sourceType is specified, look there first
  if (resolvedSourceType === 'transactions' || resolvedSourceType === 'transaction') {
    transaction = await db.collection('transactions').findOne({ _id: objectId });
  } else if (resolvedSourceType === 'inward') {
    transaction = await db.collection('inwards').findOne({ _id: objectId });
  } else if (resolvedSourceType === 'outward') {
    transaction = await db.collection('outwards').findOne({ _id: objectId });
  } else if (resolvedSourceType === 'stock_entries' || resolvedSourceType === 'stock_entry') {
    transaction = await db.collection('stock_entries').findOne({ _id: objectId });
  }

  // 2. Fallback: search all collections sequentially if not found
  if (!transaction) {
    transaction = await db.collection('transactions').findOne({ _id: objectId });
    if (transaction) resolvedSourceType = 'transactions';
  }
  if (!transaction) {
    transaction = await db.collection('inwards').findOne({ _id: objectId });
    if (transaction) resolvedSourceType = 'inward';
  }
  if (!transaction) {
    transaction = await db.collection('outwards').findOne({ _id: objectId });
    if (transaction) resolvedSourceType = 'outward';
  }
  if (!transaction) {
    transaction = await db.collection('stock_entries').findOne({ _id: objectId });
    if (transaction) resolvedSourceType = 'stock_entries';
  }

  if (transaction) {
    // Standardize fields for internal processing
    transaction.sourceType = transaction.sourceType || resolvedSourceType;
    transaction.direction = transaction.direction || transaction.type || (resolvedSourceType === 'outward' ? 'OUTWARD' : 'INWARD');
    transaction.clientId = transaction.clientId || transaction.accountId;
  }

  return transaction;
}

async function findLinkedStockEntries(db: any, transactionId: string, transaction: any) {
  const query: any = {
    $or: [
      { remarks: `Synced from transaction ${transactionId}` }
    ],
  };

  try {
    if (ObjectId.isValid(transactionId)) {
      query.$or.push({ _id: new ObjectId(transactionId) });
    }
  } catch (err) {}

  if (transaction?.gatePass) {
    query.$or.push({ gatePass: transaction.gatePass });
  }

  if (transaction?.sourceId) {
    try {
      if (ObjectId.isValid(transaction.sourceId)) {
        query.$or.push({ _id: new ObjectId(transaction.sourceId) });
      }
      query.$or.push({ remarks: `Synced from transaction ${transaction.sourceId}` });
    } catch (err) {}
  }

  return db.collection('stock_entries').find(query).toArray();
}

async function deleteStockEntriesAndLedger(db: any, stockEntries: any[]) {
  if (!stockEntries.length) return;

  const stockEntryIds = stockEntries.map((entry) => entry._id).filter(Boolean);

  if (stockEntryIds.length > 0) {
    await db.collection('ledger_entries').deleteMany({ stockEntryId: { $in: stockEntryIds } });
    await db.collection('stock_entries').deleteMany({ _id: { $in: stockEntryIds } });
  }

  for (const entry of stockEntries) {
    if (entry.warehouseId && entry.quantityMT) {
      const warehouse = await Warehouse.findById(entry.warehouseId);
      if (warehouse) {
        const dir = (entry.direction || '').toUpperCase();
        // If we delete an INWARD entry, capacity goes DOWN.
        // If we delete an OUTWARD entry, capacity goes UP.
        const capacityDelta = dir === 'INWARD' ? -Number(entry.quantityMT) : Number(entry.quantityMT);
        const nextOccupied = warehouse.occupiedCapacity + capacityDelta;
        warehouse.occupiedCapacity = Math.max(0, nextOccupied);
        warehouse.status = warehouse.occupiedCapacity >= warehouse.totalCapacity ? 'FULL' : 'ACTIVE';
        await warehouse.save();
      }
    }
  }
}

async function deleteInvoicesForMonths(db: any, clientId: string, warehouseId: string | null | undefined, invoiceMonths: Set<string>) {
  if (!clientId || !invoiceMonths.size) return;

  const query: any = {
    clientId: new ObjectId(clientId),
    invoiceMonth: { $in: Array.from(invoiceMonths) },
  };

  if (warehouseId) {
    try {
      query.warehouseId = new ObjectId(warehouseId);
    } catch {
      query.warehouseId = warehouseId;
    }
  }

  const masters = await db.collection('invoice_master').find(query).project({ _id: 1 }).toArray();
  const masterIds = masters.map((master: any) => master._id).filter(Boolean);

  await db.collection('invoice_master').deleteMany(query);

  if (masterIds.length > 0) {
    await db.collection('invoice_line_items').deleteMany({ invoiceMasterId: { $in: masterIds } });
  }
}

async function removeTransactionStockAndLedger(db: any, transaction: any) {
  const stockEntries = await findLinkedStockEntries(db, transaction._id.toString(), transaction);
  await deleteStockEntriesAndLedger(db, stockEntries);

  // Directly adjust warehouse capacity for processInward/processOutward transactions on delete
  const isDirectTransaction = !transaction.sourceId && (!transaction.sourceType || (transaction.sourceType !== 'inward' && transaction.sourceType !== 'outward'));
  if (!isDirectTransaction && transaction.warehouseId && transaction.quantityMT) {
    try {
      const warehouse = await Warehouse.findById(transaction.warehouseId);
      if (warehouse) {
        const dir = (transaction.direction || '').toUpperCase();
        const capacityDelta = dir === 'INWARD' ? -Number(transaction.quantityMT) : Number(transaction.quantityMT);
        const nextOccupied = warehouse.occupiedCapacity + capacityDelta;
        warehouse.occupiedCapacity = Math.max(0, nextOccupied);
        warehouse.status = warehouse.occupiedCapacity >= warehouse.totalCapacity ? 'FULL' : 'ACTIVE';
        await warehouse.save();
        console.log(`[DELETE] Adjusted warehouse capacity for processInward/Outward transaction deletion: delta=${capacityDelta}, newOccupied=${warehouse.occupiedCapacity}`);
      }
    } catch (capError) {
      console.error('Failed to adjust warehouse capacity on processInward/Outward delete:', capError);
    }
  }

  // Directly clean up processInward ledger entries and revenue distributions on delete
  try {
    const txnObjectId = new ObjectId(transaction._id);
    const txnIdStr = transaction._id.toString();
    const sourceId = transaction.sourceId;
    const sourceObjectId = sourceId && ObjectId.isValid(sourceId) ? new ObjectId(sourceId) : null;

    const ledgerMatchClauses: any[] = [];
    ledgerMatchClauses.push({ inwardId: txnObjectId });
    ledgerMatchClauses.push({ inwardId: txnIdStr });
    if (sourceObjectId) {
      ledgerMatchClauses.push({ inwardId: sourceObjectId });
      ledgerMatchClauses.push({ inwardId: sourceId });
    }

    const oldDate = transaction.date;
    const oldQuantity = transaction.quantityMT;
    if (transaction.clientId && transaction.warehouseId && transaction.commodityId && oldDate != null && oldQuantity != null) {
      const clientIds: any[] = [transaction.clientId];
      const warehouseIds: any[] = [transaction.warehouseId];
      const commodityIds: any[] = [transaction.commodityId];
      try { clientIds.push(new ObjectId(String(transaction.clientId))); } catch {}
      try { warehouseIds.push(new ObjectId(String(transaction.warehouseId))); } catch {}
      try { commodityIds.push(new ObjectId(String(transaction.commodityId))); } catch {}

      const oldDateStr = normalizeDateToYYYYMMDD(oldDate);

      ledgerMatchClauses.push({
        clientId: { $in: clientIds },
        warehouseId: { $in: warehouseIds },
        commodityId: { $in: commodityIds },
        periodStartDate: oldDateStr,
        quantityMT: Number(oldQuantity),
        stockEntryId: { $exists: false },
      });
    }

    if (ledgerMatchClauses.length > 0) {
      const deleteLedgerRes = await db.collection('ledger_entries').deleteMany({ $or: ledgerMatchClauses });
      console.log(`[DELETE] Direct ledger_entries cleanup: deleted=${deleteLedgerRes.deletedCount}`);
    }

    const revenueMatchClauses: any[] = [];
    revenueMatchClauses.push({ inwardId: txnObjectId });
    revenueMatchClauses.push({ inwardId: txnIdStr });
    if (sourceObjectId) {
      revenueMatchClauses.push({ inwardId: sourceObjectId });
      revenueMatchClauses.push({ inwardId: sourceId });
    }

    if (revenueMatchClauses.length > 0) {
      const deleteRevRes = await db.collection('revenuedistributions').deleteMany({ $or: revenueMatchClauses });
      console.log(`[DELETE] Direct revenuedistributions cleanup: deleted=${deleteRevRes.deletedCount}`);
    }
  } catch (err) {
    console.error('Failed to directly clean up ledger_entries/revenuedistributions on delete:', err);
  }
}

async function syncTransactionStockEntry(db: any, transaction: any, updates: any) {
  const stockEntries = await findLinkedStockEntries(db, transaction._id.toString(), transaction);
  const oldStockEntries = stockEntries.map((entry: any) => ({ ...entry }));

  // Remove old linked stock / ledger records before re-sync.
  await deleteStockEntriesAndLedger(db, stockEntries);

  const warehouseId = transaction.warehouseId;
  const commodityId = transaction.commodityId;
  const date = updates.date || transaction.date;
  const quantityMT = updates.quantityMT ?? transaction.quantityMT;
  const direction = transaction.direction;
  const gatePass = updates.gatePass || transaction.gatePass;

  if (warehouseId && commodityId && direction && quantityMT > 0) {
    try {
      await createStockEntry({
        clientId: transaction.clientId,
        warehouseId: warehouseId,
        commodityId: commodityId,
        direction,
        quantityMT,
        inwardDate: date,
        actualOutwardDate: direction === 'OUTWARD' ? date : undefined,
        ratePerMTPerDay: transaction.ratePerMTPerDay || 10,
        gatePass,
        remarks: `Synced from transaction ${transaction._id.toString()}`,
      });
    } catch (error) {
      // restore old stock entries if re-sync fails
      for (const oldEntry of oldStockEntries) {
        try {
          await createStockEntry({
            clientId: oldEntry.clientId.toString(),
            warehouseId: oldEntry.warehouseId.toString(),
            commodityId: oldEntry.commodityId.toString(),
            direction: oldEntry.direction,
            quantityMT: oldEntry.quantityMT,
            inwardDate: oldEntry.inwardDate,
            actualOutwardDate: oldEntry.actualOutwardDate,
            ratePerMTPerDay: oldEntry.ratePerMTPerDay,
            gatePass: oldEntry.gatePass,
            remarks: oldEntry.remarks || `Synced from transaction ${transaction._id.toString()}`,
          });
        } catch (restoreError) {
          console.error('Failed to restore old stock entry after sync failure:', restoreError);
        }
      }

      throw error;
    }
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      type,
      clientId,
      warehouseId,
      commodityId,
      quantity,
      date,
      bookingId,      // NEW: account ID from client accounts
      clientName,     // NEW: client name for easier lookup
      commodityName,  // NEW: commodity name
      gatePass,       // NEW: gate pass reference
      quantityMT,     // NEW: alias for quantity with MT unit
    } = body;

    // Validate required fields
    if (!type || !clientId || !quantity || !date) {
      return NextResponse.json({
        success: false,
        message: 'Missing required fields: type, clientId, quantity, date'
      }, { status: 400 });
    }

    // Validate transaction type (support both formats)
    const direction = type === 'Inward' || type === 'INWARD' ? 'INWARD' :
      type === 'Outward' || type === 'OUTWARD' ? 'OUTWARD' : null;

    if (!direction) {
      return NextResponse.json({
        success: false,
        message: 'Invalid transaction type. Must be "Inward"/"INWARD" or "Outward"/"OUTWARD"'
      }, { status: 400 });
    }

    // Validate quantity
    const qty = Number(quantity || quantityMT);
    if (qty <= 0) {
      return NextResponse.json({
        success: false,
        message: 'Quantity must be greater than 0'
      }, { status: 400 });
    }

    const db = await getDb();

    // ENFORCE: All references MUST exist in master tables. No auto-creation or fallbacks.

    // Validate client exists in master
    let clientFromMaster;
    try {
      clientFromMaster = await db.collection('clients').findOne({ _id: new ObjectId(clientId) });
      if (!clientFromMaster) {
        return NextResponse.json({
          success: false,
          message: `Client '${clientId}' not found in Client Master. Please add to Master first.`
        }, { status: 400 });
      }
    } catch (e) {
      return NextResponse.json({
        success: false,
        message: `Invalid client ID format: ${clientId}`
      }, { status: 400 });
    }

    // Validate commodity exists in master
    let commodityFromMaster = null;
    if (commodityId) {
      try {
        commodityFromMaster = await db.collection('commodities').findOne({ _id: new ObjectId(commodityId) });
        if (!commodityFromMaster) {
          return NextResponse.json({
            success: false,
            message: `Commodity '${commodityId}' not found in Commodity Master. Please add to Master first.`
          }, { status: 400 });
        }
      } catch (e) {
        return NextResponse.json({
          success: false,
          message: `Invalid commodity ID format: ${commodityId}`
        }, { status: 400 });
      }
    } else if (commodityName) {
      commodityFromMaster = await db.collection('commodities').findOne({
        name: { $regex: `^${commodityName.trim()}$`, $options: 'i' }
      });
      if (!commodityFromMaster) {
        return NextResponse.json({
          success: false,
          message: `Commodity '${commodityName}' not found in Commodity Master. Please add to Master first.`
        }, { status: 400 });
      }
    } else {
      return NextResponse.json({
        success: false,
        message: 'Either commodityId or commodityName must be provided'
      }, { status: 400 });
    }

    // Validate warehouse exists in master
    if (warehouseId) {
      try {
        const warehouseFromMaster = await db.collection('warehouses').findOne({ _id: new ObjectId(warehouseId) });
        if (!warehouseFromMaster) {
          return NextResponse.json({
            success: false,
            message: `Warehouse '${warehouseId}' not found in Warehouse Master. Please add to Master first.`
          }, { status: 400 });
        }
      } catch (e) {
        return NextResponse.json({
          success: false,
          message: `Invalid warehouse ID format: ${warehouseId}`
        }, { status: 400 });
      }
    }

    const accountId = clientId; // Use client ID as account ID

    // Check warehouse capacity for inward transactions
    if (direction === 'INWARD') {
      try {
        const warehouseConfig = await db.collection('warehouse_config').findOne({});
        if (warehouseConfig) {
          const totalCapacity = warehouseConfig.totalCapacity || 5000;

          // Calculate current inbound usage
          const currentUsage = await db.collection('transactions').aggregate([
            {
              $match: {
                direction: 'INWARD',
                ...(warehouseId && { warehouseId }),
              }
            },
            {
              $group: {
                _id: null,
                totalInward: { $sum: '$quantityMT' }
              }
            }
          ]).toArray();

          const usedCapacity = currentUsage[0]?.totalInward || 0;
          const availableCapacity = totalCapacity - usedCapacity;

          if (qty > availableCapacity) {
            return NextResponse.json({
              success: false,
              message: `Insufficient warehouse capacity. Available: ${availableCapacity} MT, Requested: ${qty} MT`
            }, { status: 400 });
          }
        }
      } catch (error) {
        // Proceed without capacity check if config not found
        console.warn('Warehouse config not found, skipping capacity check');
      }
    }

    if (direction === 'OUTWARD') {
      try {
        await validateOutwardStock(
          clientId,
          commodityFromMaster._id.toString(),
          warehouseId || '',
          date,
          qty
        );
      } catch (validationError: any) {
        return NextResponse.json({
          success: false,
          message: validationError.message || 'Stock validation failed'
        }, { status: 400 });
      }
    }

    // Create transaction record ONLY with valid master references
    const ratePerMTPerDay =
      commodityFromMaster.ratePerMtPerDay ??
      (commodityFromMaster.ratePerMtMonth
        ? commodityFromMaster.ratePerMtMonth / 30
        : 10);

    const transaction = appendOwnershipForMongo({
      accountId: accountId,
      direction: direction,
      date: normalizeDateToYYYYMMDD(date),
      quantityMT: qty,
      commodityName: commodityFromMaster.name,
      commodityId: commodityFromMaster._id.toString(),
      gatePass: gatePass || `GP-${Date.now()}`,
      clientId: clientId,
      clientName: clientFromMaster.name,
      warehouseId: warehouseId || null,
      ratePerMTPerDay,
      rate: ratePerMTPerDay,
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'COMPLETED',
      type: direction,
    }, session);

    // Insert transaction
    const result = await db.collection('transactions').insertOne(transaction);

    // Mirror transaction into stock/ledger entries for full traceability
    if (warehouseId && commodityFromMaster) {
      try {
        const ratePerMTPerDay =
          commodityFromMaster.ratePerMtPerDay ??
          (commodityFromMaster.ratePerMtMonth ? commodityFromMaster.ratePerMtMonth / 30 : 10);

        await createStockEntry({
          clientId,
          warehouseId,
          commodityId: commodityFromMaster._id.toString(),
          direction,
          quantityMT: qty,
          inwardDate: date,
          actualOutwardDate: direction === 'OUTWARD' ? date : undefined,
          ratePerMTPerDay,
          gatePass: transaction.gatePass,
          remarks: `Synced from transaction ${result.insertedId}`,
        });
      } catch (syncError) {
        console.warn('Failed to sync transaction to stock/ledger entries:', syncError);
      }
    }

    // Now regenerate TIME-STATE ledger for this account
    try {
      const allTransactions = await db.collection('transactions')
        .find({ accountId: accountId })
        .sort({ date: 1 })
        .toArray();

      // Convert to ledger-engine format
      const txnsForLedger = allTransactions.map((txn: any) => ({
        _id: txn._id?.toString() || '',
        date: txn.date,
        direction: txn.direction,
        mt: txn.quantityMT,
        clientName: txn.clientName || clientName || 'Unknown',
        commodityName: txn.commodityName || 'Unknown',
        gatePass: txn.gatePass || '',
      }));

      // Generate and save time-state ledger
      const timeStateLedger = generateTimeStateLedger(txnsForLedger, clientName || 'Unknown');

      // Delete old time-state entries and insert new ones
      await db.collection('ledger_time_state').deleteMany({ accountId });

      if (timeStateLedger.timeStatePeriods.length > 0) {
        const entriesToInsert = timeStateLedger.timeStatePeriods.map(period => ({
          accountId,
          periodStartDate: period.periodStartDate,
          periodEndDate: period.periodEndDate,
          quantityMT: period.quantityMT,
          status: period.status,
          reasonForChange: period.reasonForChange,
          affectedTransaction: period.transaction
            ? {
              transactionId: period.transaction.id,
              direction: period.transaction.direction,
              quantity: period.transaction.quantity,
              date: period.transaction.date,
            }
            : undefined,
          ratePerDayPerMT: period.ratePerDayPerMT,
          rentCalculated: period.rentCalculated,
          historicalRecord: new Date(period.periodEndDate) < new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        }));

        await db.collection('ledger_time_state').insertMany(entriesToInsert);
      }
    } catch (ledgerError) {
      console.error('Error updating TIME-STATE ledger:', ledgerError);
      // Don't fail the transaction if ledger update fails
    }

    return NextResponse.json({
      success: true,
      message: `${direction} transaction recorded successfully`,
      transactionId: result.insertedId,
      transaction: {
        id: result.insertedId.toString(),
        accountId: accountId,
        direction: direction,
        quantityMT: qty,
        date: date,
      }
    });

  } catch (error) {
    console.error('Error creating transaction:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to create transaction' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !isAdmin(session)) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { transactionId, date, quantityMT, sourceType } = body;

    if (!transactionId || !date || quantityMT === undefined) {
      return NextResponse.json({ success: false, message: 'transactionId, date and quantityMT are required' }, { status: 400 });
    }

    if (!ObjectId.isValid(transactionId)) {
      return NextResponse.json({ success: false, message: 'Invalid transactionId' }, { status: 400 });
    }

    const parsedQuantity = Number(quantityMT);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      return NextResponse.json({ success: false, message: 'quantityMT must be a positive number' }, { status: 400 });
    }

    const parsedDate = new Date(date);
    if (Number.isNaN(parsedDate.getTime())) {
      return NextResponse.json({ success: false, message: 'Invalid date format. Use YYYY-MM-DD' }, { status: 400 });
    }

    const db = await getDb();
    const transaction = await getTransactionInfo(db, transactionId, sourceType);
    if (!transaction) {
      return NextResponse.json({ success: false, message: 'Transaction not found' }, { status: 404 });
    }

    if (transaction.direction !== transaction.type && transaction.direction) {
      // If older records stored direction differently, still allow
    }

    await db.collection('transactions').updateMany(
      { 
        $or: [
          { _id: new ObjectId(transaction._id) },
          { sourceId: transaction._id.toString() }
        ]
      },
      {
        $set: {
          date: normalizeDateToYYYYMMDD(date),
          quantityMT: parsedQuantity,
          updatedAt: new Date(),
        },
      }
    );

    // Sync corresponding inward/outward collection documents if they exist
    try {
      const srcType = (transaction.sourceType || '').toLowerCase();
      const objectId = new ObjectId(transaction._id);
      if (srcType === 'inward') {
        await db.collection('inwards').updateOne(
          { _id: objectId },
          {
            $set: {
              date: parsedDate,
              quantityMT: parsedQuantity,
              updatedAt: new Date(),
            }
          }
        );
      } else if (srcType === 'outward') {
        await db.collection('outwards').updateOne(
          { _id: objectId },
          {
            $set: {
              date: parsedDate,
              quantityMT: parsedQuantity,
              updatedAt: new Date(),
            }
          }
        );
      }

      if (transaction.sourceId) {
        const sourceObjectId = new ObjectId(transaction.sourceId);
        await db.collection('inwards').updateOne(
          { _id: sourceObjectId },
          {
            $set: {
              date: parsedDate,
              quantityMT: parsedQuantity,
              updatedAt: new Date(),
            }
          }
        );
        await db.collection('outwards').updateOne(
          { _id: sourceObjectId },
          {
            $set: {
              date: parsedDate,
              quantityMT: parsedQuantity,
              updatedAt: new Date(),
            }
          }
        );
      }
    } catch (syncDocError) {
      console.error('Failed to sync linked inward/outward document after transaction edit:', syncDocError);
    }

    const isDirectTransaction = !transaction.sourceId && (!transaction.sourceType || (transaction.sourceType !== 'inward' && transaction.sourceType !== 'outward'));

    if (isDirectTransaction) {
      try {
        await syncTransactionStockEntry(db, transaction, { date, quantityMT: parsedQuantity });
      } catch (syncError) {
        console.error('Failed to resync stock entry after transaction update:', syncError);
        // Continue, but keep transaction updated. Don't fail the entire request on sync failure.
      }
    } else {
      // For processInward/processOutward transactions:
      // Adjust warehouse capacity only if quantity changed
      const oldQuantity = Number(transaction.quantityMT || 0);
      if (parsedQuantity !== oldQuantity && transaction.warehouseId) {
        try {
          const warehouse = await Warehouse.findById(transaction.warehouseId);
          if (warehouse) {
            const dir = (transaction.direction || '').toUpperCase();
            const qtyDiff = parsedQuantity - oldQuantity;
            const capacityDelta = dir === 'INWARD' ? qtyDiff : -qtyDiff;
            
            const nextOccupied = warehouse.occupiedCapacity + capacityDelta;
            warehouse.occupiedCapacity = Math.max(0, nextOccupied);
            warehouse.status = warehouse.occupiedCapacity >= warehouse.totalCapacity ? 'FULL' : 'ACTIVE';
            await warehouse.save();
            console.log(`[PATCH] Adjusted warehouse capacity for processInward/Outward transaction: diff=${qtyDiff}, newOccupied=${warehouse.occupiedCapacity}`);
          }
        } catch (capError) {
          console.error('Failed to adjust warehouse capacity on processInward/Outward edit:', capError);
        }
      }
    }

    // ── Direct ledger_entries sync (covers entries created by processInward) ──
    try {
      const txnObjectId = new ObjectId(transaction._id);
      const txnIdStr = transaction._id.toString();
      const sourceId = transaction.sourceId;
      const sourceObjectId = sourceId && ObjectId.isValid(sourceId) ? new ObjectId(sourceId) : null;

      // Build a comprehensive query to find ALL ledger entries related to this transaction,
      // including those created by processInward (which have no stockEntryId).
      const ledgerMatchClauses: any[] = [];

      // Match by inwardId (ObjectId or string) – covers processInward entries
      ledgerMatchClauses.push({ inwardId: txnObjectId });
      ledgerMatchClauses.push({ inwardId: txnIdStr });
      if (sourceObjectId) {
        ledgerMatchClauses.push({ inwardId: sourceObjectId });
        ledgerMatchClauses.push({ inwardId: sourceId });
      }

      // Match by property signature: same client + warehouse + commodity + old date + old quantity
      // This is a fallback for legacy records with no inwardId or stockEntryId
      const oldDate = transaction.date;
      const oldQuantity = transaction.quantityMT;
      if (transaction.clientId && transaction.warehouseId && transaction.commodityId && oldDate != null && oldQuantity != null) {
        const clientIds: any[] = [transaction.clientId];
        const warehouseIds: any[] = [transaction.warehouseId];
        const commodityIds: any[] = [transaction.commodityId];
        try { clientIds.push(new ObjectId(String(transaction.clientId))); } catch {}
        try { warehouseIds.push(new ObjectId(String(transaction.warehouseId))); } catch {}
        try { commodityIds.push(new ObjectId(String(transaction.commodityId))); } catch {}

        // Normalize old date for comparison (handle both Date objects and strings)
        const oldDateStr = normalizeDateToYYYYMMDD(oldDate);

        ledgerMatchClauses.push({
          clientId: { $in: clientIds },
          warehouseId: { $in: warehouseIds },
          commodityId: { $in: commodityIds },
          periodStartDate: oldDateStr,
          quantityMT: Number(oldQuantity),
          stockEntryId: { $exists: false }, // Only match processInward-created entries
        });
      }

      // Normalize new date string for storage
      const newDateStr = normalizeDateToYYYYMMDD(parsedDate);

      // Find the matched ledger entries
      const matchedLedgerEntries = await db.collection('ledger_entries').find({ $or: ledgerMatchClauses }).toArray();

      // Recalculate rate and rent
      const commodityId = transaction.commodityId;
      let ratePerMTPerDay = transaction.ratePerMTPerDay;
      if (!ratePerMTPerDay && commodityId) {
        const commodity = await db.collection('commodities').findOne({ _id: new ObjectId(commodityId) });
        if (commodity) {
          ratePerMTPerDay = commodity.ratePerMtPerDay ?? (commodity.ratePerMtMonth ? commodity.ratePerMtMonth / 30 : 10);
        }
      }
      if (!ratePerMTPerDay) {
        ratePerMTPerDay = 10;
      }

      let totalRentCalculated = 0;

      for (const entry of matchedLedgerEntries) {
        const rentEndDate = entry.periodEndDate ? new Date(entry.periodEndDate) : null;
        let newRentTotal = 0;
        if (rentEndDate) {
          const monthlyRate = ratePerMTPerDay * 30;
          const rent = calculateRent(parsedQuantity, monthlyRate, parsedDate as any, rentEndDate as any);
          newRentTotal = rent.totalAmount;
        }
        totalRentCalculated += newRentTotal;

        await db.collection('ledger_entries').updateOne(
          { _id: entry._id },
          {
            $set: {
              periodStartDate: newDateStr,
              quantityMT: parsedQuantity,
              rentCalculated: newRentTotal,
              updatedAt: new Date(),
            },
          }
        );
      }
      console.log(`[PATCH] Direct ledger_entries sync: matched=${matchedLedgerEntries.length}, recalculated rent=${totalRentCalculated}`);

      // ── Sync/recalculate revenuedistributions ──
      const revenueMatchClauses: any[] = [];
      revenueMatchClauses.push({ inwardId: txnObjectId });
      revenueMatchClauses.push({ inwardId: txnIdStr });
      if (sourceObjectId) {
        revenueMatchClauses.push({ inwardId: sourceObjectId });
        revenueMatchClauses.push({ inwardId: sourceId });
      }

      if (revenueMatchClauses.length > 0) {
        const newOwnerShare = Math.round(totalRentCalculated * 0.6 * 100) / 100;
        const newPlatformShare = Math.round((totalRentCalculated - newOwnerShare) * 100) / 100;

        await db.collection('revenuedistributions').updateMany(
          { $or: revenueMatchClauses },
          {
            $set: {
              totalAmount: totalRentCalculated,
              ownerShare: newOwnerShare,
              platformShare: newPlatformShare,
              updatedAt: new Date(),
            },
          }
        );
      }
    } catch (directLedgerError) {
      console.error('Failed to directly sync ledger_entries/revenuedistributions after transaction edit:', directLedgerError);
    }

    try {
      const accountId = transaction.accountId || transaction.clientId;
      const allTransactions = await db.collection('transactions')
        .find({ accountId: accountId })
        .sort({ date: 1 })
        .toArray();

      const txnsForLedger = allTransactions.map((txn: any) => ({
        _id: txn._id?.toString() || '',
        date: normalizeDateToYYYYMMDD(txn.date),
        direction: txn.direction,
        mt: txn.quantityMT,
        clientName: txn.clientName || '',
        commodityName: txn.commodityName || 'Unknown',
        gatePass: txn.gatePass || '',
      }));

      const timeStateLedger = generateTimeStateLedger(txnsForLedger, transaction.clientName || 'Unknown');
      await db.collection('ledger_time_state').deleteMany({ accountId });

      if (timeStateLedger.timeStatePeriods.length > 0) {
        const entriesToInsert = timeStateLedger.timeStatePeriods.map((period) => ({
          accountId,
          periodStartDate: period.periodStartDate,
          periodEndDate: period.periodEndDate,
          quantityMT: period.quantityMT,
          status: period.status,
          reasonForChange: period.reasonForChange,
          affectedTransaction: period.transaction
            ? {
              transactionId: period.transaction.id,
              direction: period.transaction.direction,
              quantity: period.transaction.quantity,
              date: period.transaction.date,
            }
            : undefined,
          ratePerDayPerMT: period.ratePerDayPerMT,
          rentCalculated: period.rentCalculated,
          historicalRecord: new Date(period.periodEndDate) < new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        }));

        await db.collection('ledger_time_state').insertMany(entriesToInsert);
      }
    } catch (ledgerError) {
      console.error('Error updating TIME-STATE ledger after transaction edit:', ledgerError);
    }

    try {
      const invoiceMonths = new Set<string>([
        extractInvoiceMonth(transaction.date),
        extractInvoiceMonth(date),
      ].filter(Boolean));

      await deleteInvoicesForMonths(db, transaction.clientId, transaction.warehouseId, invoiceMonths);

      // Regenerate invoices for affected months
      for (const month of invoiceMonths) {
        try {
          await generateMonthlyInvoices(month, undefined, { clientId: transaction.clientId, warehouseId: transaction.warehouseId });
        } catch (regenerateError) {
          console.error(`Error regenerating invoices for month ${month}:`, regenerateError);
        }
      }
    } catch (invoiceError) {
      console.error('Error clearing affected invoices after transaction edit:', invoiceError);
    }

    try {
      revalidatePath('/dashboard/transactions-report');
      revalidatePath('/dashboard/warehouses');
      revalidatePath('/dashboard/ledger');
      revalidatePath('/dashboard/reports');
      revalidatePath('/dashboard/revenue');
      revalidatePath('/dashboard');
      revalidatePath('/dashboard/inward');
      revalidatePath('/dashboard/outward');
    } catch (revalError) {
      console.error('Failed to revalidate paths after transaction edit:', revalError);
    }

    return NextResponse.json({ success: true, message: 'Transaction updated successfully' });
  } catch (error) {
    console.error('Error updating transaction:', error);
    return NextResponse.json({ success: false, message: 'Failed to update transaction' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !isAdmin(session)) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { transactionId, sourceType } = body;

    if (!transactionId || !ObjectId.isValid(transactionId)) {
      return NextResponse.json({ success: false, message: 'Valid transactionId is required' }, { status: 400 });
    }

    const db = await getDb();
    const transaction = await getTransactionInfo(db, transactionId, sourceType);
    if (!transaction) {
      return NextResponse.json({ success: false, message: 'Transaction not found' }, { status: 404 });
    }

    try {
      await removeTransactionStockAndLedger(db, transaction);
    } catch (cleanupError) {
      console.error('Error cleaning up linked stock/ledger entries:', cleanupError);
    }

    try {
      const invoiceMonths = new Set<string>([extractInvoiceMonth(transaction.date)].filter(Boolean));
      await deleteInvoicesForMonths(db, transaction.clientId, transaction.warehouseId, invoiceMonths);

      // Regenerate invoices for affected months
      for (const month of invoiceMonths) {
        try {
          await generateMonthlyInvoices(month, undefined, { clientId: transaction.clientId, warehouseId: transaction.warehouseId });
        } catch (regenerateError) {
          console.error(`Error regenerating invoices for month ${month}:`, regenerateError);
        }
      }
    } catch (invoiceError) {
      console.error('Error clearing affected invoices after transaction delete:', invoiceError);
    }

    // Delete corresponding inward/outward collection documents if they exist
    try {
      const srcType = (transaction.sourceType || '').toLowerCase();
      const objectId = new ObjectId(transaction._id);
      if (srcType === 'inward') {
        await db.collection('inwards').deleteOne({ _id: objectId });
      } else if (srcType === 'outward') {
        await db.collection('outwards').deleteOne({ _id: objectId });
      }

      if (transaction.sourceId) {
        const sourceObjectId = new ObjectId(transaction.sourceId);
        await db.collection('inwards').deleteOne({ _id: sourceObjectId });
        await db.collection('outwards').deleteOne({ _id: sourceObjectId });
      }
    } catch (syncDocError) {
      console.error('Failed to delete linked inward/outward document:', syncDocError);
    }

    await db.collection('transactions').deleteMany({
      $or: [
        { _id: new ObjectId(transaction._id) },
        { sourceId: transaction._id.toString() }
      ]
    });

    try {
      const accountId = transaction.accountId || transaction.clientId;
      const remainingTransactions = await db.collection('transactions')
        .find({ accountId })
        .sort({ date: 1 })
        .toArray();

      const txnsForLedger = remainingTransactions.map((txn: any) => ({
        _id: txn._id?.toString() || '',
        date: normalizeDateToYYYYMMDD(txn.date),
        direction: txn.direction,
        mt: txn.quantityMT,
        clientName: txn.clientName || '',
        commodityName: txn.commodityName || 'Unknown',
        gatePass: txn.gatePass || '',
      }));

      const timeStateLedger = generateTimeStateLedger(txnsForLedger, transaction.clientName || 'Unknown');
      await db.collection('ledger_time_state').deleteMany({ accountId });

      if (timeStateLedger.timeStatePeriods.length > 0) {
        const entriesToInsert = timeStateLedger.timeStatePeriods.map((period) => ({
          accountId,
          periodStartDate: period.periodStartDate,
          periodEndDate: period.periodEndDate,
          quantityMT: period.quantityMT,
          status: period.status,
          reasonForChange: period.reasonForChange,
          affectedTransaction: period.transaction
            ? {
              transactionId: period.transaction.id,
              direction: period.transaction.direction,
              quantity: period.transaction.quantity,
              date: period.transaction.date,
            }
            : undefined,
          ratePerDayPerMT: period.ratePerDayPerMT,
          rentCalculated: period.rentCalculated,
          historicalRecord: new Date(period.periodEndDate) < new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        }));

        await db.collection('ledger_time_state').insertMany(entriesToInsert);
      }
    } catch (ledgerError) {
      console.error('Error regenerating TIME-STATE ledger after transaction delete:', ledgerError);
    }

    try {
      revalidatePath('/dashboard/transactions-report');
      revalidatePath('/dashboard/warehouses');
      revalidatePath('/dashboard/ledger');
      revalidatePath('/dashboard/reports');
      revalidatePath('/dashboard/revenue');
      revalidatePath('/dashboard');
      revalidatePath('/dashboard/inward');
      revalidatePath('/dashboard/outward');
    } catch (revalError) {
      console.error('Failed to revalidate paths after transaction delete:', revalError);
    }

    return NextResponse.json({ success: true, message: 'Transaction deleted successfully' });
  } catch (error) {
    console.error('Error deleting transaction:', error);
    return NextResponse.json({ success: false, message: 'Failed to delete transaction' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('clientId');
    const accountId = searchParams.get('accountId');
    const warehouseId = searchParams.get('warehouseId');
    const direction = searchParams.get('direction');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const db = await getDb();
    const tenantFilter = getTenantFilterForMongo(session);

    const warehouseDocs = await db.collection('warehouses')
      .find({ ...tenantFilter })
      .project({ _id: 1, name: 1 })
      .toArray();
    const ownedWarehouseIdStrings = warehouseDocs.map((warehouse: any) => warehouse._id.toString());
    const ownedWarehouseObjectIds = warehouseDocs
      .map((warehouse: any) => warehouse._id)
      .filter((id: any) => id instanceof ObjectId);
    const warehouseQueryIds = [...ownedWarehouseIdStrings, ...ownedWarehouseObjectIds];

    // Build query
    const query: any = { ...tenantFilter };
    if (clientId) query.clientId = clientId;
    if (accountId) query.accountId = accountId;
    if (direction) query.direction = direction.toUpperCase();
    query.deletedAt = { $exists: false };
    query.status = { $nin: ['DELETED', 'CANCELLED'] };

    if (warehouseId) {
      const requestedWarehouseIds: Array<string | ObjectId> = [warehouseId];
      const warehouseIdString = String(warehouseId);
      if (ObjectId.isValid(warehouseIdString)) requestedWarehouseIds.push(new ObjectId(warehouseIdString));

      const ownsWarehouse = warehouseQueryIds.some((id: any) => id.toString() === warehouseIdString);
      query.warehouseId = ownsWarehouse ? { $in: requestedWarehouseIds } : { $in: [] };
    } else if (warehouseQueryIds.length > 0) {
      query.warehouseId = { $in: warehouseQueryIds };
    }

    // Date range filtering
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = startDate;
      if (endDate) query.date.$lte = endDate;
    }

    // Get transactions
    const transactions = await db.collection('transactions')
      .find(query)
      .sort({ date: -1, createdAt: -1 })
      .toArray();

    const transactionIds = transactions
      .map((t: any) => t._id?.toString())
      .filter((id: string | undefined): id is string => typeof id === 'string');

    const rentEntries = transactionIds.length > 0
      ? await db.collection('ledger_time_state')
        .find({ 'affectedTransaction.transactionId': { $in: transactionIds } })
        .project({ 'affectedTransaction.transactionId': 1, rentCalculated: 1 })
        .toArray()
      : [];

    const rentByTransactionId = new Map<string, number>();
    rentEntries.forEach((entry: any) => {
      const transactionId = entry?.affectedTransaction?.transactionId;
      if (!transactionId) return;
      const rentValue = Number(entry.rentCalculated || 0);
      rentByTransactionId.set(transactionId, (rentByTransactionId.get(transactionId) || 0) + rentValue);
    });

    const userIds = [...new Set(transactions.map((t: any) => t.userId?.toString()).filter(Boolean))];
    const uniqueUserIds = userIds.map(id => {
      try { return new ObjectId(id as string); } catch { return id; }
    });
    const users = uniqueUserIds.length > 0
      ? await db.collection('users').find({ _id: { $in: uniqueUserIds } }).project({ _id: 1, fullName: 1, email: 1, companyName: 1 }).toArray()
      : [];
    const userMap = new Map(users.map(u => [u._id.toString(), { fullName: u.fullName, email: u.email, companyName: u.companyName }]));

    const nameCounts = new Map<string, number>();
    warehouseDocs.forEach((w: any) => {
      const n = w.name?.toLowerCase() || '';
      nameCounts.set(n, (nameCounts.get(n) || 0) + 1);
    });

    const formatWarehouseName = (t: any) => {
      let wName = t.warehouseName || '';
      if (isAdmin(session) && t.userId && wName) {
        const isDuplicate = (nameCounts.get(wName.toLowerCase()) || 0) > 1;
        if (isDuplicate) {
          const userInfo = userMap.get(t.userId.toString());
          const wspName = userInfo?.companyName || userInfo?.fullName || userInfo?.email || 'Unknown';
          wName = `${wName} (${wspName})`;
        }
      }
      return wName;
    };

    return NextResponse.json({
      success: true,
      count: transactions.length,
      transactions: transactions.map((t: any) => ({
        id: t._id?.toString(),
        accountId: t.accountId,
        clientId: t.clientId,
        clientName: t.clientName,
        direction: t.direction,
        commodityName: t.commodityName,
        quantityMT: t.quantityMT,
        date: t.date,
        gatePass: t.gatePass,
        warehouseId: t.warehouseId,
        warehouseName: formatWarehouseName(t),
        status: t.status,
        createdAt: t.createdAt,
        rentTotal: Math.round((rentByTransactionId.get(t._id?.toString() || '') || 0) * 100) / 100,
      }))
    });

  } catch (error) {
    console.error('Error fetching transactions:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch transactions' },
      { status: 500 }
    );
  }
}