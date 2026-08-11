'use server';

import mongoose from 'mongoose';
import connectToDatabase from '@/lib/mongoose';
import Inward from '@/lib/models/Inward';
import Outward from '@/lib/models/Outward';
import Warehouse from '@/lib/models/Warehouse';
import Commodity from '@/lib/models/Commodity';
import Client from '@/lib/models/Client';
import RevenueDistribution from '@/lib/models/RevenueDistribution';
import { revalidatePath } from 'next/cache';
import { calculateRent } from '@/lib/pricing-engine';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getTenantFilterForMongo, appendOwnershipForMongo, requireSession, isAdmin } from '@/lib/ownership';
import { requireWspActionPermission } from '@/lib/server-wsp-permissions';

async function createTransactionSession() {
  const dbConnection = await connectToDatabase();
  if (!mongoose.connection.db) {
    throw new Error('Database connection not established');
  }

  const admin = mongoose.connection.db.admin();
  const serverInfo = await admin.command({ hello: 1 }).catch(() => admin.command({ isMaster: 1 }));
  const supportsTransactions = Boolean(serverInfo.setName || serverInfo.msg === 'isdbgrid');

  console.log('[createTransactionSession] serverInfo', {
    serverInfo: {
      setName: serverInfo?.setName,
      msg: serverInfo?.msg,
      isWritablePrimary: serverInfo?.isWritablePrimary,
      ok: serverInfo?.ok,
    },
    supportsTransactions,
  });

  if (!supportsTransactions) {
    console.log('[createTransactionSession] transactions not supported, proceeding without session');
    return null;
  }

  let session: mongoose.ClientSession | null = null;
  try {
    session = await mongoose.connection.startSession({ causalConsistency: false });
    await session.startTransaction({
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
      readPreference: 'primary',
    });
    console.log('[createTransactionSession] mongoose transaction session started', {
      transactionOptions: {
        readConcern: 'snapshot',
        writeConcern: 'majority',
        readPreference: 'primary',
      },
    });
    return session;
  } catch (error: unknown) {
    const unsupportedTransaction = isTransactionError(error);
    console.error('[createTransactionSession] failed to start transaction, falling back to no transaction', {
      unsupportedTransaction,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    if (session) {
      try {
        await session.endSession();
      } catch (closeError) {
        console.error('[createTransactionSession] failed to end session after transaction failure', closeError);
      }
    }
    return null;
  }
}

function isTransactionError(error: unknown) {
  if (!(error instanceof Error) || typeof error.message !== 'string') return false;
  return error.message.includes('Only servers in a sharded cluster can start a new transaction at the active transaction number')
    || error.message.includes('Transaction numbers are only allowed on a replica set or mongos')
    || error.message.includes('Cannot start transaction on transaction pinned cursor');
}

function parseIsoDate(value: any): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatDateKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function getMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function getLedgerEntryDateRange(entry: any, outwardDate?: Date): { startDate: Date; endDate: Date } {
  const startDate = parseIsoDate(entry.periodStartDate) || new Date();
  let endDate = parseIsoDate(entry.periodEndDate);

  if (!endDate) {
    const daysStored = typeof entry.daysStored === 'number' ? entry.daysStored : 0;
    if (daysStored > 0) {
      endDate = addDays(startDate, daysStored - 1);
    }
  }

  if (!endDate) {
    endDate = new Date(startDate);
  }

  if (outwardDate && outwardDate >= startDate && outwardDate < endDate) {
    endDate = outwardDate;
  }

  return { startDate, endDate };
}

function getDailyRateForEntry(entry: any, commodityRateMap: Map<string, number>): number {
  if (typeof entry.ratePerMTPerDay === 'number' && entry.ratePerMTPerDay > 0) {
    return entry.ratePerMTPerDay;
  }

  const commodityId = entry.commodityId?.toString?.();
  if (commodityId && commodityRateMap.has(commodityId)) {
    return commodityRateMap.get(commodityId) || 10;
  }

  return 10;
}

/**
 * Calculates current stock balance for Client + Commodity + Warehouse
 */
export async function getStockBalance(clientId: string, commodityId: string, warehouseId: string, session?: mongoose.ClientSession) {
  await connectToDatabase();

  const inwardAgg = Inward.aggregate([
    {
      $match: {
        clientId: new mongoose.Types.ObjectId(clientId),
        commodityId: new mongoose.Types.ObjectId(commodityId),
        warehouseId: new mongoose.Types.ObjectId(warehouseId),
      },
    },
    { $group: { _id: null, total: { $sum: '$quantityMT' } } },
  ]);

  const outwardAgg = Outward.aggregate([
    {
      $match: {
        clientId: new mongoose.Types.ObjectId(clientId),
        commodityId: new mongoose.Types.ObjectId(commodityId),
        warehouseId: new mongoose.Types.ObjectId(warehouseId),
      },
    },
    { $group: { _id: null, total: { $sum: '$quantityMT' } } },
  ]);

  const inwardResult = session ? await inwardAgg.session(session).exec() : await inwardAgg.exec();
  const outwardResult = session ? await outwardAgg.session(session).exec() : await outwardAgg.exec();

  const totalInwardValue = inwardResult[0]?.total || 0;
  const totalOutwardValue = outwardResult[0]?.total || 0;

  return totalInwardValue - totalOutwardValue;
}

/**
 * Validates if an outward transaction is valid based on date-wise stock availability.
 */
export async function validateOutwardStock(
  clientId: string,
  commodityId: string,
  warehouseId: string,
  outwardDateStr: string | Date,
  quantityMT: number,
  session?: mongoose.ClientSession
): Promise<void> {
  await connectToDatabase();
  
  // Normalize date properly depending on type, avoiding UTC shifting if it's already a Date
  let targetDateStr;
  if (typeof outwardDateStr === 'string') {
    targetDateStr = outwardDateStr.split('T')[0];
  } else {
    // If it's a date, format it properly
    const y = outwardDateStr.getUTCFullYear();
    const m = String(outwardDateStr.getUTCMonth() + 1).padStart(2, '0');
    const d = String(outwardDateStr.getUTCDate()).padStart(2, '0');
    targetDateStr = `${y}-${m}-${d}`;
  }
  
  const parts = targetDateStr.split('-');
  const formattedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;

  const clientObjectId = new mongoose.Types.ObjectId(clientId);
  const commodityObjectId = new mongoose.Types.ObjectId(commodityId);
  const warehouseObjectId = new mongoose.Types.ObjectId(warehouseId);

  const inwardAgg = Inward.aggregate([
    { $match: { clientId: clientObjectId, commodityId: commodityObjectId, warehouseId: warehouseObjectId } },
    { $project: { date: 1, quantityMT: 1 } }
  ]);
  const outwardAgg = Outward.aggregate([
    { $match: { clientId: clientObjectId, commodityId: commodityObjectId, warehouseId: warehouseObjectId } },
    { $project: { date: 1, quantityMT: 1 } }
  ]);

  const inwards = session ? await inwardAgg.session(session).exec() : await inwardAgg.exec();
  const outwards = session ? await outwardAgg.session(session).exec() : await outwardAgg.exec();

  const getIsoDateStr = (d: Date) => {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const firstInwardDateStr = inwards.length > 0 
      ? inwards.map((i: any) => getIsoDateStr(i.date)).sort()[0] 
      : null;

  if (!firstInwardDateStr || targetDateStr < firstInwardDateStr) {
      throw new Error(`Insufficient stock available on selected date. Available stock on ${formattedDate} is 0 MT.`);
  }

  let availableStockOnDate = 0;
  for (const inv of inwards) {
    if (getIsoDateStr(inv.date) <= targetDateStr) {
       availableStockOnDate += inv.quantityMT;
    }
  }
  for (const out of outwards) {
    if (getIsoDateStr(out.date) <= targetDateStr) {
       availableStockOnDate -= out.quantityMT;
    }
  }

  availableStockOnDate = Math.round(availableStockOnDate * 10000) / 10000;

  if (quantityMT > availableStockOnDate) {
      throw new Error(`Insufficient stock available on selected date. Available stock on ${formattedDate} is ${availableStockOnDate} MT.`);
  }

  // Check historical negative balance
  const dateBalances = new Map<string, number>();
  for (const inv of inwards) {
     const d = getIsoDateStr(inv.date);
     dateBalances.set(d, (dateBalances.get(d) || 0) + inv.quantityMT);
  }
  for (const out of outwards) {
     const d = getIsoDateStr(out.date);
     dateBalances.set(d, (dateBalances.get(d) || 0) - out.quantityMT);
  }
  dateBalances.set(targetDateStr, (dateBalances.get(targetDateStr) || 0) - quantityMT);

  const sortedDates = Array.from(dateBalances.keys()).sort();
  let runningBalance = 0;
  for (const d of sortedDates) {
     runningBalance += dateBalances.get(d)!;
     if (runningBalance < -0.0001) {
         const dParts = d.split('-');
         const dFormatted = `${dParts[2]}-${dParts[1]}-${dParts[0]}`;
         throw new Error(`Transaction would cause stock to become negative on ${dFormatted}.`);
     }
  }
}

/**
 * Processes Inward entry with Grouped Invoicing and Revenue Distribution
 */
export async function processInward(data: {
  clientId: string;
  commodityId: string;
  warehouseId: string;
  quantityMT: number;
  bagsCount: number;
  stackNo?: string;
  lotNo?: string;
  gatePass?: string;
  date?: string | Date;
  outwardDate: string | Date;
  isColdStorage?: boolean;
}) {
  if (!data.isColdStorage) {
    await requireWspActionPermission('inward');
  }
  const authSession = await requireSession();
  const session = await createTransactionSession();
  const createOptions: { session: mongoose.ClientSession } | undefined = session ? { session } : undefined;

  try {
    const inwardDate = data.date ? new Date(data.date) : new Date();
    const outwardDate = new Date(data.outwardDate);

    // 0. Fetch Commodity for Rate
    const commodityQuery = Commodity.findById(data.commodityId);
    const commodity = session ? await commodityQuery.session(session) : await commodityQuery;
    if (!commodity) throw new Error('Commodity not found');

    // 1. Resolve client, commodity, and warehouse names for transaction linkage
    const clientQuery = Client.findById(data.clientId);
    const warehouseQuery = Warehouse.findById(data.warehouseId);
    const [client, warehouse] = session
      ? await Promise.all([clientQuery.session(session), warehouseQuery.session(session)])
      : await Promise.all([clientQuery, warehouseQuery]);

    if (!client) throw new Error('Client not found');
    if (!warehouse) throw new Error('Warehouse not found');
    if (warehouse.status === 'INACTIVE') {
      throw new Error('Warehouse is deactivated and cannot be used for new transactions');
    }

    // 2. Create Inward Record
    const inwardPayload = appendOwnershipForMongo({
      ...data,
      date: inwardDate,
      outwardDate: outwardDate,
    }, authSession);

    const [newInward] = session
      ? await Inward.create([inwardPayload], createOptions)
      : await Inward.create([inwardPayload]);

    // 3. Update Warehouse Capacity
    if (warehouse.occupiedCapacity + data.quantityMT > warehouse.totalCapacity) {
      throw new Error('Transaction exceeds warehouse total capacity');
    }
    warehouse.occupiedCapacity += data.quantityMT;
    if (warehouse.occupiedCapacity >= warehouse.totalCapacity) warehouse.status = 'FULL';
    if (session) {
      await warehouse.save({ session });
    } else {
      await warehouse.save();
    }

    // 4. Link into shared transaction history
    const inwardTransaction = appendOwnershipForMongo({
      accountId: data.clientId,
      clientId: data.clientId,
      commodityId: data.commodityId,
      warehouseId: data.warehouseId,
      clientName: client.name,
      commodityName: commodity.name,
      warehouseName: warehouse.name,
      direction: 'INWARD',
      type: 'INWARD',
      date: inwardDate,
      quantityMT: data.quantityMT,
      bagsCount: data.bagsCount,
      stackNo: data.stackNo,
      lotNo: data.lotNo,
      gatePass: data.gatePass || `GP-${Date.now()}`,
      status: 'COMPLETED',
      sourceType: 'inward',
      sourceId: newInward._id?.toString(),
      createdAt: new Date(),
      updatedAt: new Date(),
    }, authSession);

    const db = mongoose.connection.db;
    if (!db) throw new Error('Database connection not established');

    await db.collection('transactions').insertOne(
      inwardTransaction,
      session ? { session } : undefined
    );

    // 3. Financial Calculations
    const monthlyRate = commodity.ratePerMtPerDay * 30; // Convert daily rate to monthly
    const rent = calculateRent(data.quantityMT, monthlyRate, inwardDate, outwardDate);
    const totalAmount = rent.totalAmount;

    // 5. Create Ledger Entry for Invoice Generation
    const ratePerMTPerDay =
      commodity.ratePerMtPerDay ??
      (commodity.ratePerMtMonth ? commodity.ratePerMtMonth / 30 : 10);
    const ledgerEntry = appendOwnershipForMongo({
      inwardId: newInward._id,
      clientId: new mongoose.Types.ObjectId(data.clientId),
      warehouseId: new mongoose.Types.ObjectId(data.warehouseId),
      commodityId: new mongoose.Types.ObjectId(data.commodityId),
      periodStartDate: inwardDate.toISOString().split('T')[0],
      periodEndDate: outwardDate.toISOString().split('T')[0],
      quantityMT: data.quantityMT,
      status: 'ACTIVE',
      ratePerMTPerDay: ratePerMTPerDay,
      rentCalculated: totalAmount,
      version: 1,
      createdAt: new Date(),
    }, authSession);

    await db.collection('ledger_entries').insertOne(
      ledgerEntry,
      session ? { session } : undefined
    );
    const ownerShare = Math.round(totalAmount * 0.6 * 100) / 100;
    const platformShare = Math.round((totalAmount - ownerShare) * 100) / 100;

    if (session) {
      await RevenueDistribution.create([{
        inwardId: newInward._id,
        clientId: data.clientId,
        warehouseId: data.warehouseId,
        totalAmount,
        ownerShare,
        platformShare,
      }], { session });
    } else {
      await RevenueDistribution.create([{
        inwardId: newInward._id,
        clientId: data.clientId,
        warehouseId: data.warehouseId,
        totalAmount,
        ownerShare,
        platformShare,
      }]);
    }

    if (session) {
      await session.commitTransaction();
    }

    // Revalidation
    revalidatePath('/dashboard/inward');
    revalidatePath('/dashboard/warehouses');
    revalidatePath('/dashboard/ledger');
    revalidatePath('/dashboard/reports');
    revalidatePath('/dashboard/revenue');

    return {
      success: true,
      data: JSON.parse(JSON.stringify(newInward))
    };
  } catch (error: unknown) {
    if (session) {
      await session.abortTransaction();
    }
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    if (session) {
      session.endSession();
    }
  }
}

/**
 * Processes Outward withdrawal
 */
export async function processOutward(data: {
  clientId: string;
  commodityId: string;
  warehouseId: string;
  quantityMT: number;
  bagsCount?: number;
  stackNo?: string;
  lotNo?: string;
  gatePass?: string;
  date?: string | Date;
  actualWeight?: number;
  netWeightLoss?: number;
  partyName?: string;
  isColdStorage?: boolean;
}) {
  if (!data.isColdStorage) {
    await requireWspActionPermission('outward');
  }
  const authSession = await requireSession();
  const session = await createTransactionSession();

  console.log('[processOutward] transaction session created', {
    hasSession: Boolean(session),
  });

  try {
    const outwardDate = data.date ? new Date(data.date) : new Date();

    console.log('[processOutward] payload', {
      clientId: data.clientId,
      commodityId: data.commodityId,
      warehouseId: data.warehouseId,
      quantityMT: data.quantityMT,
      actualWeight: data.actualWeight,
      netWeightLoss: data.netWeightLoss,
      partyName: data.partyName,
      date: outwardDate.toISOString(),
      gatePass: data.gatePass,
    });

    console.log('[processOutward] authSession', {
      userId: authSession?.user?.id,
      email: authSession?.user?.email,
      role: authSession?.user?.role,
    });

    await validateOutwardStock(data.clientId, data.commodityId, data.warehouseId, outwardDate, data.quantityMT, session || undefined);
    console.log('[processOutward] stock validated successfully');

    const clientQuery = Client.findById(data.clientId);
    const commodityQuery = Commodity.findById(data.commodityId);
    const warehouseQuery = Warehouse.findById(data.warehouseId);

    let client = null;
    let commodity = null;
    let warehouse = null;

    if (session) {
      console.log('[processOutward] loading client/commodity/warehouse under transaction session');
      client = await clientQuery.session(session).exec();
      console.log('[processOutward] loaded client under session', { clientId: data.clientId });
      commodity = await commodityQuery.session(session).exec();
      console.log('[processOutward] loaded commodity under session', { commodityId: data.commodityId });
      warehouse = await warehouseQuery.session(session).exec();
      console.log('[processOutward] loaded warehouse under session', { warehouseId: data.warehouseId });
    } else {
      client = await clientQuery.exec();
      commodity = await commodityQuery.exec();
      warehouse = await warehouseQuery.exec();
    }

    console.log('[processOutward] loaded references', {
      client: client ? { id: client._id?.toString(), name: client.name } : null,
      commodity: commodity ? { id: commodity._id?.toString(), name: commodity.name } : null,
      warehouse: warehouse ? { id: warehouse._id?.toString(), name: warehouse.name, occupiedCapacity: warehouse.occupiedCapacity, totalCapacity: warehouse.totalCapacity, status: warehouse.status } : null,
    });

    if (!client) {
      console.error('[processOutward] client not found');
      throw new Error('Client not found');
    }
    if (!commodity) {
      console.error('[processOutward] commodity not found');
      throw new Error('Commodity not found');
    }
    if (!warehouse) {
      console.error('[processOutward] warehouse not found');
      throw new Error('Warehouse not found');
    }
    if (warehouse.status === 'INACTIVE') {
      throw new Error('Warehouse is deactivated and cannot be used for new transactions');
    }

    const c = commodity as any;
    const outwardPayload = appendOwnershipForMongo({
      ...data,
      actualWeight: data.actualWeight,
      netWeightLoss: data.netWeightLoss,
      partyName: data.partyName,
      unit: c.unit || 'MT',
      unitRate: c.ratePerMtPerDay || (c.ratePerMtMonth ? c.ratePerMtMonth / 30 : 10),
      date: outwardDate,
    }, authSession);

    const [newOutward] = session
      ? await Outward.create([outwardPayload], { session })
      : await Outward.create([outwardPayload]);

    console.log('[processOutward] created outward record', {
      outwardId: newOutward._id?.toString(),
      outwardPayload: {
        clientId: newOutward.clientId,
        commodityId: newOutward.commodityId,
        warehouseId: newOutward.warehouseId,
        quantityMT: newOutward.quantityMT,
        date: newOutward.date,
      },
    });

    const outwardTransaction = appendOwnershipForMongo({
      accountId: data.clientId,
      clientId: data.clientId,
      commodityId: data.commodityId,
      warehouseId: data.warehouseId,
      clientName: client.name,
      commodityName: commodity.name,
      warehouseName: warehouse.name,
      direction: 'OUTWARD',
      type: 'OUTWARD',
      date: outwardDate,
      quantityMT: data.quantityMT,
      actualWeight: data.actualWeight,
      netWeightLoss: data.netWeightLoss,
      stackNo: data.stackNo,
      lotNo: data.lotNo,
      gatePass: data.gatePass || `GP-${Date.now()}`,
      partyName: data.partyName,
      status: 'COMPLETED',
      sourceType: 'outward',
      sourceId: newOutward._id?.toString(),
      createdAt: new Date(),
      updatedAt: new Date(),
    }, authSession);

    console.log('[processOutward] Starting outward transaction', {
      userId: authSession?.user?.id,
      clientId: data.clientId,
      commodityId: data.commodityId,
      warehouseId: data.warehouseId,
      quantityMT: data.quantityMT,
      outwardId: newOutward._id?.toString(),
      occupiedCapacity: warehouse.occupiedCapacity,
    });

    if (!warehouse) {
      throw new Error('Warehouse not found');
    }

    if (warehouse.occupiedCapacity - data.quantityMT < 0) {
      throw new Error('Warehouse stock cannot become negative');
    }
    warehouse.occupiedCapacity -= data.quantityMT;
    if (warehouse.occupiedCapacity < warehouse.totalCapacity && warehouse.status === 'FULL') {
      warehouse.status = 'ACTIVE';
    }
    if (session) {
      await warehouse.save({ session });
      console.log('[processOutward] warehouse saved within session');
    } else {
      await warehouse.save();
      console.log('[processOutward] warehouse saved outside session');
    }

    const db = mongoose.connection.db;
    if (!db) throw new Error('Database connection not established');

    const transactionResult = await db.collection('transactions').insertOne(
      outwardTransaction,
      session ? { session } : undefined
    );
    console.log('[processOutward] Inserted transaction record', {
      transactionId: transactionResult.insertedId?.toString?.(),
      sourceId: newOutward._id?.toString(),
      acknowledged: transactionResult.acknowledged,
    });

    console.log('[processOutward] updating ledger entries', {
      clientId: data.clientId,
      commodityId: data.commodityId,
      warehouseId: data.warehouseId,
      outwardDate: outwardDate.toISOString().split('T')[0],
    });

    // Update ledger entries for this client/commodity/warehouse combination
    // Find active ledger entries and update their end date to reflect actual stock withdrawal
    const ledgerUpdateResult = await db.collection('ledger_entries').updateMany(
      {
        clientId: new mongoose.Types.ObjectId(data.clientId),
        commodityId: new mongoose.Types.ObjectId(data.commodityId),
        warehouseId: new mongoose.Types.ObjectId(data.warehouseId),
        status: 'ACTIVE'
      },
      {
        $set: {
          periodEndDate: outwardDate.toISOString().split('T')[0],
          updatedAt: new Date()
        }
      },
      session ? { session } : undefined
    );
    console.log('[processOutward] Ledger update result', {
      matchedCount: ledgerUpdateResult.matchedCount,
      modifiedCount: ledgerUpdateResult.modifiedCount,
    });

    if (session) {
      await session.commitTransaction();
      console.log('[processOutward] transaction committed');
    }
    revalidatePath('/dashboard/outward');
    revalidatePath('/dashboard/warehouses');
    revalidatePath('/dashboard/ledger');
    revalidatePath('/dashboard/reports');

    return { success: true, data: JSON.parse(JSON.stringify(newOutward)) };
  } catch (error: unknown) {
    console.error('[processOutward] caught error', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      hasSession: Boolean(session),
    });
    if (session) {
      try {
        await session.abortTransaction();
        console.log('[processOutward] transaction aborted');
      } catch (abortError) {
        console.error('[processOutward] failed to abort transaction', abortError);
      }
    }
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    if (session) {
      try {
        session.endSession();
        console.log('[processOutward] session ended');
      } catch (endError) {
        console.error('[processOutward] failed to end session', endError);
      }
    }
  }
}

/**
 * Get warehouse-level revenue analytics with month-wise charges from ledger
 * Groups by warehouse and returns month-wise revenue totals.
 */
export async function getClientRevenueAnalytics(warehouseId?: string, month?: string) {
  try {
    console.log('[getClientRevenueAnalytics] Starting client revenue calculation...');
    await connectToDatabase();

    let session;
    try {
      session = await requireSession();
      console.log('[getClientRevenueAnalytics] Session found for:', session.user?.email);
    } catch (error) {
      console.log('[getClientRevenueAnalytics] No session found, proceeding without tenant filter');
    }

    const tenantFilter = session
      ? getTenantFilterForMongo(session)
      : {};
    console.log('[getClientRevenueAnalytics] Tenant filter applied', tenantFilter);

    const db = mongoose.connection.db;
    if (!db) throw new Error('Database connection not established');

    const isAdminUser = session ? isAdmin(session) : false;
    let warehouseOwnerFilter: any = {};
    let warehouseObjectId: mongoose.Types.ObjectId | null = null;

    if (warehouseId && warehouseId !== 'ALL') {
      try {
        warehouseObjectId = new mongoose.Types.ObjectId(warehouseId);
      } catch (error) {
        console.warn('[getClientRevenueAnalytics] Invalid warehouseId provided:', warehouseId);
      }
    }

    if (isAdminUser && warehouseObjectId) {
      const selectedWarehouse = await db.collection('warehouses').findOne({ _id: warehouseObjectId });
      if (selectedWarehouse) {
        const ownerClauses: any[] = [];
        if (selectedWarehouse.userId) ownerClauses.push({ userId: selectedWarehouse.userId });
        if (selectedWarehouse.userEmail) ownerClauses.push({ userEmail: selectedWarehouse.userEmail });
        if (ownerClauses.length > 0) {
          warehouseOwnerFilter = { $or: ownerClauses };
        }
      }
    }

    const ownershipFilter = isAdminUser && warehouseObjectId && Object.keys(warehouseOwnerFilter).length > 0
      ? warehouseOwnerFilter
      : session
        ? tenantFilter
        : {};

    const ledgerQuery: any = {};
    let warehouseScopedFilter: any = {};
    let warehouseOwnedByTenant = false;

    if (warehouseObjectId) {
      const warehouseMatchIds: Array<string | mongoose.Types.ObjectId> = [warehouseObjectId];
      if (warehouseId) {
        warehouseMatchIds.push(warehouseId);
      }

      const warehouseQuery: any = {
        _id: { $in: warehouseMatchIds }
      };
      if (!isAdminUser && session) {
        warehouseQuery.$or = tenantFilter.$or ? tenantFilter.$or : [];
      }

      const selectedWarehouse = await db.collection('warehouses').findOne(warehouseQuery);
      if (!selectedWarehouse) {
        return {
          summary: { totalRevenue: 0, ownerEarnings: 0, platformCommissions: 0 },
          warehouseRevenue: [],
        };
      }

      warehouseOwnedByTenant = !isAdminUser;
      warehouseScopedFilter = {};

      const inwardQuery: any = {
        warehouseId: { $in: warehouseMatchIds },
      };
      const matchingInwards = await db
        .collection('inwards')
        .find(inwardQuery, { projection: { _id: 1 } })
        .toArray();
      const matchingInwardIds = matchingInwards.flatMap((inward: any) => {
        const ids: any[] = [];
        if (inward._id != null) {
          ids.push(inward._id);
          ids.push(inward._id.toString());
        }
        return ids;
      });

      const warehouseClause = { warehouseId: { $in: warehouseMatchIds } };
      const orClauses: any[] = [warehouseClause];
      if (matchingInwardIds.length > 0) {
        orClauses.push({ inwardId: { $in: matchingInwardIds } });
      }

      const accessClause = { $or: orClauses };
      if (Object.keys(ownershipFilter).length > 0 && isAdminUser) {
        ledgerQuery.$and = [accessClause, ownershipFilter];
      } else {
        Object.assign(ledgerQuery, accessClause);
      }
    } else if (Object.keys(ownershipFilter).length > 0) {
      const ownedWarehouses = await db.collection('warehouses')
        .find(ownershipFilter, { projection: { _id: 1 } })
        .toArray();
      const ownedWarehouseIds = ownedWarehouses.flatMap((warehouse: any) => {
        const ids: any[] = [];
        if (warehouse._id != null) {
          ids.push(warehouse._id);
          ids.push(warehouse._id.toString());
        }
        return ids;
      });

      const ownedInwards = ownedWarehouseIds.length > 0
        ? await db.collection('inwards')
          .find({ warehouseId: { $in: ownedWarehouseIds } }, { projection: { _id: 1 } })
          .toArray()
        : [];
      const ownedInwardIds = ownedInwards.flatMap((inward: any) => {
        const ids: any[] = [];
        if (inward._id != null) {
          ids.push(inward._id);
          ids.push(inward._id.toString());
        }
        return ids;
      });

      const warehouseClauses: any[] = [];
      if (ownedWarehouseIds.length > 0) {
        warehouseClauses.push({ warehouseId: { $in: ownedWarehouseIds } });
      }
      if (ownedInwardIds.length > 0) {
        warehouseClauses.push({ inwardId: { $in: ownedInwardIds } });
      }

      if (warehouseClauses.length > 0) {
        ledgerQuery.$or = warehouseClauses;
      } else {
        Object.assign(ledgerQuery, ownershipFilter);
      }
    }

    // Exclude stale SPLIT entries to avoid double counting
    ledgerQuery.status = { $ne: 'SPLIT' };

    // Get all ledger entries
    const allLedgerEntries = await db.collection('ledger_entries').find(ledgerQuery).toArray();
    console.log('[getClientRevenueAnalytics] Total ledger entries:', allLedgerEntries.length);

    const filteredEntries = allLedgerEntries;

    // Build lookup sets for warehouses, commodities, clients, and inward records
    const warehouseIds = new Set<string>();
    const commodityIds = new Set<string>();
    const clientIds = new Set<string>();
    const inwardIds = new Set<string>();

    filteredEntries.forEach((entry: any) => {
      if (entry.warehouseId) warehouseIds.add(entry.warehouseId.toString());
      if (entry.commodityId) commodityIds.add(entry.commodityId.toString());
      if (entry.clientId) clientIds.add(entry.clientId.toString());
      if (!entry.warehouseId && entry.inwardId) inwardIds.add(entry.inwardId.toString());
    });

    let inwardMap = new Map<string, { warehouseId: any; commodityId: any }>();
    if (inwardIds.size > 0) {
      const inwards = await db.collection('inwards').find({
        _id: { $in: Array.from(inwardIds).map(id => new mongoose.Types.ObjectId(id)) }
      }).toArray();

      inwardMap = new Map(inwards.map(inward => [
        inward._id.toString(),
        {
          warehouseId: inward.warehouseId,
          commodityId: inward.commodityId
        }
      ]));

      inwards.forEach(inward => {
        if (inward.warehouseId) warehouseIds.add(inward.warehouseId.toString());
        if (inward.commodityId) commodityIds.add(inward.commodityId.toString());
      });
    }

    const warehouses = await db.collection('warehouses').find({
      _id: { $in: Array.from(warehouseIds).map(id => new mongoose.Types.ObjectId(id)) },
      ...(session ? tenantFilter : {})
    }).toArray();
    const commodities = await db.collection('commodities').find({
      _id: { $in: Array.from(commodityIds).map(id => new mongoose.Types.ObjectId(id)) }
    }).toArray();

    const outwardFilter: any = {
      ...(Object.keys(ownershipFilter).length > 0 ? ownershipFilter : (session ? tenantFilter : {})),
      warehouseId: { $in: Array.from(warehouseIds).map(id => new mongoose.Types.ObjectId(id)) }
    };
    if (clientIds.size > 0) {
      outwardFilter.clientId = { $in: Array.from(clientIds).map(id => new mongoose.Types.ObjectId(id)) };
    }
    if (commodityIds.size > 0) {
      outwardFilter.commodityId = { $in: Array.from(commodityIds).map(id => new mongoose.Types.ObjectId(id)) };
    }

    const outwards = await db.collection('outwards').find(outwardFilter).toArray();
    const outwardGroups = new Map<string, Array<{ date: Date; quantity: number }>>();
    outwards.forEach((outward: any) => {
      const key = `${outward.clientId?.toString() || ''}-${outward.warehouseId?.toString() || ''}-${outward.commodityId?.toString() || ''}`;
      const outwardDate = parseIsoDate(outward.date);
      const quantity = typeof outward.quantityMT === 'number' ? outward.quantityMT : 0;
      if (!outwardDate || quantity <= 0) return;

      if (!outwardGroups.has(key)) {
        outwardGroups.set(key, []);
      }
      outwardGroups.get(key)?.push({ date: outwardDate, quantity });
    });

    outwardGroups.forEach((events) => {
      events.sort((a, b) => a.date.getTime() - b.date.getTime());
    });

    const warehouseMap = new Map(warehouses.map(w => [w._id.toString(), w.name]));
    const commodityRateMap = new Map(commodities.map(c => [
      c._id.toString(),
      c.ratePerMtPerDay ?? (c.ratePerMtMonth ? c.ratePerMtMonth / 30 : 10)
    ]));

    // Group by warehouse, then by month
    const warehouseRevenueData = new Map<string, any>();

    const entriesByKey = new Map<string, Array<any>>();
    const keyToWarehouseId = new Map<string, string>();

    for (const entry of filteredEntries) {
      let warehouseId = entry.warehouseId;
      let commodityId = entry.commodityId;

      if (!warehouseId && entry.inwardId) {
        const inwardData = inwardMap.get(entry.inwardId.toString());
        if (inwardData) {
          warehouseId = inwardData.warehouseId;
          commodityId = inwardData.commodityId;
        }
      }

      if (!warehouseId || !commodityId) {
        continue;
      }

      const warehouseIdStr = warehouseId.toString();
      const commodityIdStr = commodityId.toString();
      const ledgerKey = `${entry.clientId?.toString() || ''}-${warehouseIdStr}-${commodityIdStr}`;

      const startDate = parseIsoDate(entry.periodStartDate);
      let endDate = parseIsoDate(entry.periodEndDate);
      const today: Date = parseIsoDate(new Date()) ?? new Date();

      if (!endDate && startDate) {
        if (entry.status === 'ACTIVE') {
          endDate = today;
        } else {
          const daysStored = typeof entry.daysStored === 'number' ? entry.daysStored : 0;
          if (daysStored > 0) {
            endDate = addDays(startDate, daysStored - 1);
          }
        }
      }

      if (!startDate || !endDate) {
        continue;
      }

      if (endDate > today) {
        endDate = today;
      }
      if (startDate > endDate) {
        continue;
      }

      const dailyRate = getDailyRateForEntry(entry, commodityRateMap);
      const quantity = entry.quantityMT || 0;
      if (quantity <= 0) continue;

      if (!entriesByKey.has(ledgerKey)) {
        entriesByKey.set(ledgerKey, []);
        keyToWarehouseId.set(ledgerKey, warehouseIdStr);
      }
      entriesByKey.get(ledgerKey)?.push({
        startDate,
        endDate,
        quantity,
        remainingQuantity: quantity,
        dailyRate
      });
    }

    for (const [ledgerKey, ledgerEntries] of entriesByKey.entries()) {
      const warehouseIdStr = keyToWarehouseId.get(ledgerKey)!;
      const outwardEvents = outwardGroups.get(ledgerKey) || [];
      const warehouseData = warehouseRevenueData.get(warehouseIdStr) || {
        warehouseId: new mongoose.Types.ObjectId(warehouseIdStr),
        warehouseName: warehouseMap.get(warehouseIdStr) || 'Unknown Warehouse',
        monthlyCharges: new Map<string, number>(),
        totalRevenue: 0
      };

      const sortedEntries = ledgerEntries.slice().sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
      const startDate = sortedEntries.reduce((min: Date | null, entry: any) => {
        if (!min || entry.startDate < min) return entry.startDate;
        return min;
      }, null as Date | null) as Date;
      const endDate = sortedEntries.reduce((max: Date | null, entry: any) => {
        if (!max || entry.endDate > max) return entry.endDate;
        return max;
      }, null as Date | null) as Date;

      const eventsByDate = new Map<string, Array<{ date: Date; quantity: number }>>();
      outwardEvents.forEach(event => {
        const dateKey = formatDateKey(event.date);
        if (!eventsByDate.has(dateKey)) eventsByDate.set(dateKey, []);
        eventsByDate.get(dateKey)?.push(event);
      });

      let currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        const currentKey = formatDateKey(currentDate);
        const events = eventsByDate.get(currentKey) || [];
        let remainingOutwardQuantity = events.reduce((sum, event) => sum + event.quantity, 0);

        if (remainingOutwardQuantity > 0) {
          for (const entry of sortedEntries) {
            if (remainingOutwardQuantity <= 0) break;
            if (entry.remainingQuantity <= 0) continue;
            if (entry.startDate <= currentDate && currentDate <= entry.endDate) {
              const reduceQty = Math.min(entry.remainingQuantity, remainingOutwardQuantity);
              entry.remainingQuantity -= reduceQty;
              remainingOutwardQuantity -= reduceQty;
            }
          }
        }

        const monthlyRevenue = sortedEntries.reduce((sum, entry) => {
          if (entry.remainingQuantity <= 0) return sum;
          if (entry.startDate <= currentDate && currentDate <= entry.endDate) {
            return sum + entry.remainingQuantity * entry.dailyRate;
          }
          return sum;
        }, 0);

        if (monthlyRevenue > 0) {
          const monthKey = getMonthKey(currentDate);
          const currentMonthCharge = warehouseData.monthlyCharges.get(monthKey) || 0;
          warehouseData.monthlyCharges.set(monthKey, currentMonthCharge + monthlyRevenue);
          warehouseData.totalRevenue += monthlyRevenue;
        }

        currentDate = addDays(currentDate, 1);
      }

      if (!warehouseRevenueData.has(warehouseIdStr)) {
        warehouseRevenueData.set(warehouseIdStr, warehouseData);
      }
    }

    // Convert to array format with month columns
    const warehouseRevenue = Array.from(warehouseRevenueData.values())
      .map(item => {
        const monthlyCharges: { [key: string]: number } = {};
        item.monthlyCharges.forEach((charge: number, monthKey: string) => {
          // Filter by month if provided
          if (!month || month === 'ALL' || monthKey === month) {
            monthlyCharges[monthKey] = Math.round(charge * 100) / 100;
          }
        });

        // Calculate total revenue for filtered months only
        const filteredTotalRevenue = Object.values(monthlyCharges).reduce((sum, charge) => sum + charge, 0);

        return {
          warehouseId: item.warehouseId.toString(),
          warehouseName: item.warehouseName,
          monthlyCharges,
          totalRevenue: Math.round(filteredTotalRevenue * 100) / 100,
          ownerShare: Math.round(filteredTotalRevenue * 0.6 * 100) / 100,
          platformShare: Math.round(filteredTotalRevenue * 0.4 * 100) / 100
        };
      })
      .sort((a, b) => a.warehouseName.localeCompare(b.warehouseName));

    // Calculate overall summary from filtered data
    const totalRevenue = warehouseRevenue.reduce((sum, row) => sum + row.totalRevenue, 0);
    const ownerEarnings = Math.round(totalRevenue * 0.6 * 100) / 100;
    const platformCommissions = Math.round(totalRevenue * 0.4 * 100) / 100;

    const summary = {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      ownerEarnings,
      platformCommissions
    };

    console.log('[getClientRevenueAnalytics] Summary:', summary);
    console.log('[getClientRevenueAnalytics] Warehouse entries:', warehouseRevenue.length);

    return {
      summary,
      warehouseRevenue
    };
  } catch (error: any) {
    console.error('[getClientRevenueAnalytics] Error:', error?.message || error);
    if (error?.stack) console.error(error.stack);
    return {
      summary: { totalRevenue: 0, ownerEarnings: 0, platformCommissions: 0 },
      warehouseRevenue: []
    };
  }
}
