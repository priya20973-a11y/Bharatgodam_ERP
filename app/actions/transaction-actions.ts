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
import { getTenantFilterForMongo, appendOwnershipForMongo, requireSession } from '@/lib/ownership';

async function createTransactionSession() {
  await connectToDatabase();
  if (!mongoose.connection.db) {
    throw new Error('Database connection not established');
  }
  
  const admin = mongoose.connection.db.admin();
  const serverInfo = await admin.command({ hello: 1 }).catch(() => admin.command({ isMaster: 1 }));
  const supportsTransactions = Boolean(serverInfo.setName || serverInfo.msg === 'isdbgrid');

  if (!supportsTransactions) {
    return null;
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  return session;
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
export async function getStockBalance(clientId: string, commodityId: string, warehouseId: string) {
  await connectToDatabase();

  const inwardResult = await Inward.aggregate([
    {
      $match: {
        clientId: new mongoose.Types.ObjectId(clientId),
        commodityId: new mongoose.Types.ObjectId(commodityId),
        warehouseId: new mongoose.Types.ObjectId(warehouseId),
      },
    },
    { $group: { _id: null, total: { $sum: '$quantityMT' } } },
  ]);

  const outwardResult = await Outward.aggregate([
    {
      $match: {
        clientId: new mongoose.Types.ObjectId(clientId),
        commodityId: new mongoose.Types.ObjectId(commodityId),
        warehouseId: new mongoose.Types.ObjectId(warehouseId),
      },
    },
    { $group: { _id: null, total: { $sum: '$quantityMT' } } },
  ]);

  const totalInwardValue = inwardResult[0]?.total || 0;
  const totalOutwardValue = outwardResult[0]?.total || 0;

  return totalInwardValue - totalOutwardValue;
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
}) {
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
    const ledgerEntry = {
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
    };

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
}) {
  const authSession = await requireSession();
  const session = await createTransactionSession();

  try {
    const outwardDate = data.date ? new Date(data.date) : new Date();

    const currentBalance = await getStockBalance(data.clientId, data.commodityId, data.warehouseId);
    if (data.quantityMT > currentBalance) {
      throw new Error(`Insufficient stock. Available: ${currentBalance} MT`);
    }

    const clientQuery = Client.findById(data.clientId);
    const commodityQuery = Commodity.findById(data.commodityId);
    const warehouseQuery = Warehouse.findById(data.warehouseId);
    const [client, commodity, warehouse] = session
      ? await Promise.all([clientQuery.session(session), commodityQuery.session(session), warehouseQuery.session(session)])
      : await Promise.all([clientQuery, commodityQuery, warehouseQuery]);

    if (!client) throw new Error('Client not found');
    if (!commodity) throw new Error('Commodity not found');
    if (!warehouse) throw new Error('Warehouse not found');

    const outwardPayload = appendOwnershipForMongo({
      ...data,
      date: outwardDate,
    }, authSession);

    const [newOutward] = session
      ? await Outward.create([outwardPayload], { session })
      : await Outward.create([outwardPayload]);

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
      stackNo: data.stackNo,
      lotNo: data.lotNo,
      gatePass: data.gatePass || `GP-${Date.now()}`,
      status: 'COMPLETED',
      sourceType: 'outward',
      sourceId: newOutward._id?.toString(),
      createdAt: new Date(),
      updatedAt: new Date(),
    }, authSession);

    if (warehouse.occupiedCapacity - data.quantityMT < 0) {
      throw new Error('Warehouse stock cannot become negative');
    }
    warehouse.occupiedCapacity -= data.quantityMT;
    if (warehouse.occupiedCapacity < warehouse.totalCapacity && warehouse.status === 'FULL') {
      warehouse.status = 'ACTIVE';
    }
    if (session) {
      await warehouse.save({ session });
    } else {
      await warehouse.save();
    }

    const db = mongoose.connection.db;
    if (!db) throw new Error('Database connection not established');

    await db.collection('transactions').insertOne(
      outwardTransaction,
      session ? { session } : undefined
    );

    // Update ledger entries for this client/commodity/warehouse combination
    // Find active ledger entries and update their end date to reflect actual stock withdrawal
    await db.collection('ledger_entries').updateMany(
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

    if (session) {
      await session.commitTransaction();
    }
    revalidatePath('/dashboard/outward');
    revalidatePath('/dashboard/warehouses');
    revalidatePath('/dashboard/ledger');
    revalidatePath('/dashboard/reports');

    return { success: true, data: JSON.parse(JSON.stringify(newOutward)) };
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
 * Get warehouse-level revenue analytics with month-wise charges from ledger
 * Groups by warehouse and returns month-wise revenue totals.
 */
export async function getClientRevenueAnalytics(warehouseId?: string) {
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
    
    const tenantFilter = session ? getTenantFilterForMongo(session) : {};
    console.log('[getClientRevenueAnalytics] Tenant filter applied');
    
    const db = mongoose.connection.db;
    if (!db) throw new Error('Database connection not established');

    // Get all ledger entries
    const allLedgerEntries = await db.collection('ledger_entries').find(session ? { ...tenantFilter } : {}).toArray();
    console.log('[getClientRevenueAnalytics] Total ledger entries:', allLedgerEntries.length);

    // Filter by warehouse if provided
    let filteredEntries = allLedgerEntries;
    if (warehouseId && warehouseId !== 'ALL') {
      const warehouseObjectId = new mongoose.Types.ObjectId(warehouseId);
      filteredEntries = allLedgerEntries.filter(entry =>
        entry.warehouseId.toString() === warehouseObjectId.toString()
      );
    }

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
      ...(session ? tenantFilter : {}),
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
      if (!endDate) {
        const daysStored = typeof entry.daysStored === 'number' ? entry.daysStored : 0;
        if (daysStored > 0 && startDate) {
          endDate = addDays(startDate, daysStored - 1);
        }
      }
      if (!startDate || !endDate) {
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
        item.monthlyCharges.forEach((charge: number, month: string) => {
          monthlyCharges[month] = Math.round(charge * 100) / 100;
        });

        return {
          warehouseId: item.warehouseId.toString(),
          warehouseName: item.warehouseName,
          monthlyCharges,
          totalRevenue: Math.round(item.totalRevenue * 100) / 100,
          ownerShare: Math.round(item.totalRevenue * 0.6 * 100) / 100,
          platformShare: Math.round(item.totalRevenue * 0.4 * 100) / 100
        };
      })
      .sort((a, b) => a.warehouseName.localeCompare(b.warehouseName));

    // Calculate overall summary
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
