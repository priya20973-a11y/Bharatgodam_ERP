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

    let warehouseMatchIds: Array<string | ObjectId> = [];
    if (warehouseId) {
      warehouseMatchIds = [warehouseId];
      if (ObjectId.isValid(warehouseId)) {
        warehouseMatchIds.push(new ObjectId(warehouseId));
      }

      const warehouseQuery: any = {
        _id: { $in: warehouseMatchIds }
      };
      if (!isAdmin(session)) {
        warehouseQuery.$or = tenantFilter.$or ? tenantFilter.$or : [];
      }

      const selectedWarehouse = await db.collection('warehouses').findOne(warehouseQuery);
      if (!selectedWarehouse) {
        return NextResponse.json({ success: true, periods: [] });
      }

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

      const warehouseIdClause = { warehouseId: { $in: warehouseMatchIds } };
      ledgerQuery.$or = [warehouseIdClause];
      if (matchingInwardIds.length > 0) {
        ledgerQuery.$or.push({ inwardId: { $in: matchingInwardIds } });
      }
    } else if (Object.keys(tenantFilter).length > 0) {
      const ownedWarehouseIds = await db
        .collection('warehouses')
        .find(tenantFilter, { projection: { _id: 1 } })
        .toArray();

      const ownedWarehouseKeys = ownedWarehouseIds.flatMap((warehouse: any) => {
        const ids: any[] = [];
        if (warehouse._id != null) {
          ids.push(warehouse._id);
          ids.push(warehouse._id.toString());
        }
        return ids;
      });

      const ownedInwards = ownedWarehouseKeys.length > 0
        ? await db.collection('inwards')
            .find({ warehouseId: { $in: ownedWarehouseKeys } }, { projection: { _id: 1 } })
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
      if (ownedWarehouseKeys.length > 0) {
        warehouseClauses.push({ warehouseId: { $in: ownedWarehouseKeys } });
      }
      if (ownedInwardIds.length > 0) {
        warehouseClauses.push({ inwardId: { $in: ownedInwardIds } });
      }

      if (warehouseClauses.length > 0) {
        ledgerQuery.$or = warehouseClauses;
      }
    }

    // Exclude stale SPLIT entries to avoid double counting
    ledgerQuery.status = { $ne: 'SPLIT' };

    // Fetch ledger entries
    const ledgerEntries = await db
      .collection('ledger_entries')
      .aggregate([
        { $match: ledgerQuery },
        {
          $lookup: {
            from: 'inwards',
            let: { inwardId: '$inwardId' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $or: [
                      { $eq: ['$_id', '$$inwardId'] },
                      {
                        $eq: [
                          '$_id',
                          {
                            $convert: {
                              input: '$$inwardId',
                              to: 'objectId',
                              onError: null,
                              onNull: null,
                            },
                          }
                        ]
                      }
                    ]
                  }
                }
              }
            ],
            as: 'inward',
          },
        },
        {
          $unwind: { path: '$inward', preserveNullAndEmptyArrays: true },
        },
        {
          $addFields: {
            resolvedWarehouseId: {
              $ifNull: ['$warehouseId', '$inward.warehouseId'],
            },
            resolvedCommodityId: {
              $ifNull: ['$commodityId', '$inward.commodityId'],
            },
          },
        },
        {
          $lookup: {
            from: 'commodities',
            let: { commodityId: '$resolvedCommodityId' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $or: [
                      { $eq: ['$_id', '$$commodityId'] },
                      {
                        $eq: [
                          '$_id',
                          {
                            $convert: {
                              input: '$$commodityId',
                              to: 'objectId',
                              onError: null,
                              onNull: null,
                            },
                          }
                        ]
                      }
                    ]
                  }
                }
              }
            ],
            as: 'commodity',
          },
        },
        {
          $lookup: {
            from: 'clients',
            let: { clientId: '$clientId' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $or: [
                      { $eq: ['$_id', '$$clientId'] },
                      {
                        $eq: [
                          '$_id',
                          {
                            $convert: {
                              input: '$$clientId',
                              to: 'objectId',
                              onError: null,
                              onNull: null,
                            },
                          }
                        ]
                      }
                    ]
                  }
                }
              }
            ],
            as: 'client',
          },
        },
        {
          $lookup: {
            from: 'warehouses',
            let: { warehouseId: '$resolvedWarehouseId' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $or: [
                      { $eq: ['$_id', '$$warehouseId'] },
                      {
                        $eq: [
                          '$_id',
                          {
                            $convert: {
                              input: '$$warehouseId',
                              to: 'objectId',
                              onError: null,
                              onNull: null,
                            },
                          }
                        ]
                      }
                    ]
                  }
                }
              }
            ],
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
           
            const rent = entry.quantityMT * rate * days;

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

            // ALWAYS calculate based on actual storage-period days for Revenue Split (ignoring DB flat rent per user request)
            const rent = entry.quantityMT * rate * days;

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
