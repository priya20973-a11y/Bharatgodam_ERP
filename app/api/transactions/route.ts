import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { generateTimeStateLedger } from '@/lib/ledger-time-state-engine';
import { createStockEntry } from '@/app/actions/stock-ledger-actions';
import { getTenantFilterForMongo, appendOwnershipForMongo } from '@/lib/ownership';
import { ObjectId } from 'mongodb';

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

    // Create transaction record ONLY with valid master references
    const transaction = appendOwnershipForMongo({
      accountId: accountId,
      direction: direction,
      date: date,
      quantityMT: qty,
      commodityName: commodityFromMaster.name,
      commodityId: commodityFromMaster._id.toString(),
      gatePass: gatePass || `GP-${Date.now()}`,
      clientId: clientId,
      clientName: clientFromMaster.name,
      warehouseId: warehouseId || null,
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
      .project({ _id: 1 })
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
        status: t.status,
        createdAt: t.createdAt,
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