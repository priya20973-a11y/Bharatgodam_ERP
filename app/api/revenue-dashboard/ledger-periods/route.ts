import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getTenantFilterForMongo, isAdmin } from '@/lib/ownership';
import { ObjectId } from 'mongodb';
import { calculateStorageDays } from '@/lib/storage-engine';

const parseDateOnly = (value: string | Date): Date => {
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  const [year, month, day] = String(value).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

const getMonthStart = (year: number, monthIndex: number): Date => new Date(Date.UTC(year, monthIndex, 1));
const getMonthEnd = (year: number, monthIndex: number): Date => new Date(Date.UTC(year, monthIndex + 1, 0));

/**
 * GET /api/revenue-dashboard/ledger-periods
 * Fetch ledger-derived invoice periods for revenue sharing page detail table
 * Query params: warehouseId (optional), month (optional, YYYY-MM)
 * 
 * Returns ledger entries grouped by client/warehouse/commodity with rent calculations
 * matching invoice line item format for consistency
 */
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const warehouseId = url.searchParams.get('warehouseId') || undefined;
    const month = url.searchParams.get('month') || undefined; // YYYY-MM format
    const clientId = url.searchParams.get('clientId') || undefined;

    const db = await getDb();
    const tenantFilter = getTenantFilterForMongo(session);

    // Build ledger query
    const ledgerQuery: any = { ...tenantFilter };

    if (clientId) {
      const clientObjectId = ObjectId.isValid(clientId) ? new ObjectId(clientId) : clientId;
      ledgerQuery.clientId = { $in: [clientObjectId, clientId] };
    }

    if (warehouseId) {
      const warehouseObjectId = ObjectId.isValid(warehouseId) ? new ObjectId(warehouseId) : warehouseId;
      ledgerQuery.warehouseId = { $in: [warehouseObjectId, warehouseId] };
    }

    // Fetch ledger entries
    const ledgerEntries = await db
      .collection('ledger_entries')
      .aggregate([
        { $match: ledgerQuery },
        {
          $lookup: {
            from: 'commodities',
            localField: 'commodityId',
            foreignField: '_id',
            as: 'commodity',
          },
        },
        {
          $lookup: {
            from: 'clients',
            localField: 'clientId',
            foreignField: '_id',
            as: 'client',
          },
        },
        {
          $lookup: {
            from: 'warehouses',
            localField: 'warehouseId',
            foreignField: '_id',
            as: 'warehouse',
          },
        },
        {
          $unwind: { path: '$commodity', preserveNullAndEmptyArrays: true },
        },
        {
          $unwind: { path: '$client', preserveNullAndEmptyArrays: true },
        },
        {
          $unwind: { path: '$warehouse', preserveNullAndEmptyArrays: true },
        },
        { $sort: { periodStartDate: 1 } },
      ])
      .toArray();

    // Format ledger entries into invoice-style periods
    const periods = ledgerEntries
      .map((entry: any) => {
        try {
          if (!entry.periodStartDate) {
            return null;
          }

          const entryStart = parseDateOnly(entry.periodStartDate);
          if (Number.isNaN(entryStart.getTime())) {
            return null;
          }

          // If month filter is active, check if period overlaps
          if (month) {
            const [monthYear, monthNum] = month.split('-');
            const monthStart = getMonthStart(Number(monthYear), Number(monthNum) - 1);
            const monthEnd = getMonthEnd(Number(monthYear), Number(monthNum) - 1);

            // Check if period intersects with month
            const periodEnd = entry.periodEndDate ? parseDateOnly(entry.periodEndDate) : monthEnd;
            if (periodEnd < monthStart || entryStart > monthEnd) {
              return null;
            }

            // Clamp period to month boundaries
            const clampedStart = entryStart > monthStart ? entryStart : monthStart;
            const clampedEnd = periodEnd < monthEnd ? periodEnd : monthEnd;

            const statusType = entry.status === 'ACTIVE' ? 'ACTIVE' : 'COMPLETED';
            const isTruncatedByMonth = clampedStart.getTime() !== entryStart.getTime() || clampedEnd.getTime() !== periodEnd.getTime();
            const effectiveStatus = statusType === 'ACTIVE' || isTruncatedByMonth ? 'ACTIVE' : 'COMPLETED';
            const days = calculateStorageDays(clampedStart, clampedEnd, effectiveStatus);

            if (days <= 0) {
              return null;
            }

            const rate = Number(entry.ratePerMTPerDay ?? 10);
            const rent = days * entry.quantityMT * rate;

            if (Number.isNaN(rent) || rent <= 0) {
              return null;
            }

            return {
              id: entry._id?.toString() || '',
              clientName: entry.client?.name || 'Unknown',
              clientId: entry.clientId?.toString() || '',
              warehouseName: entry.warehouse?.name || 'Unknown',
              warehouseId: entry.warehouseId?.toString() || '',
              commodityName: entry.commodity?.name || 'Unknown',
              commodityId: entry.commodityId?.toString() || '',
              periodStart: clampedStart.toISOString().split('T')[0],
              periodEnd: clampedEnd.toISOString().split('T')[0],
              daysOccupied: days,
              quantityMT: entry.quantityMT,
              bagsCount: entry.bagsCount ?? entry.bags,
              gatePass: entry.gatePass || entry.gatepass || '',
              ratePerMTPerDay: rate,
              rentTotal: Math.round(rent * 100) / 100,
              status: entry.status || 'COMPLETED',
              month: `${monthYear}-${monthNum}`,
            };
          } else {
            // No month filter, return full period
            const periodEnd = entry.periodEndDate ? parseDateOnly(entry.periodEndDate) : new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
            const statusType = entry.status === 'ACTIVE' ? 'ACTIVE' : 'COMPLETED';
            const days = calculateStorageDays(entryStart, periodEnd, statusType);

            if (days <= 0) {
              return null;
            }

            const rate = Number(entry.ratePerMTPerDay ?? 10);
            const rent = days * entry.quantityMT * rate;

            if (Number.isNaN(rent) || rent <= 0) {
              return null;
            }

            return {
              id: entry._id?.toString() || '',
              clientName: entry.client?.name || 'Unknown',
              clientId: entry.clientId?.toString() || '',
              warehouseName: entry.warehouse?.name || 'Unknown',
              warehouseId: entry.warehouseId?.toString() || '',
              commodityName: entry.commodity?.name || 'Unknown',
              commodityId: entry.commodityId?.toString() || '',
              periodStart: entryStart.toISOString().split('T')[0],
              periodEnd: periodEnd.toISOString().split('T')[0],
              daysOccupied: days,
              quantityMT: entry.quantityMT,
              bagsCount: entry.bagsCount ?? entry.bags,
              gatePass: entry.gatePass || entry.gatepass || '',
              ratePerMTPerDay: rate,
              rentTotal: Math.round(rent * 100) / 100,
              status: entry.status || 'COMPLETED',
              month: `${entryStart.getUTCFullYear()}-${String(entryStart.getUTCMonth() + 1).padStart(2, '0')}`,
            };
          }
        } catch (error) {
          console.error('Error processing ledger entry:', error, entry);
          return null;
        }
      })
      .filter((p: any): p is any => p !== null);

    return NextResponse.json({
      success: true,
      count: periods.length,
      periods,
    });
  } catch (error) {
    console.error('Error fetching ledger periods:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch ledger periods', error: String(error) },
      { status: 500 }
    );
  }
}
