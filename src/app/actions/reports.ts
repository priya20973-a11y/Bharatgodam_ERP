'use server';

import { getDb } from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ObjectId } from 'mongodb';
import { getValidWarehouseIds, createWarehouseLookupMap, validateWarehouseId } from '@/lib/warehouse-service';

function parseFilterId(id: string | ObjectId) {
  if (id instanceof ObjectId) return id;
  try {
    return new ObjectId(id);
  } catch {
    return id;
  }
}
import { IClient } from '@/lib/models/Client';
import { IWarehouse } from '@/lib/models/Warehouse';

interface IInvoiceMaster {
  _id?: ObjectId;
  invoiceId: string;
  clientId: ObjectId;
  warehouseId: ObjectId | string;
  invoiceMonth: string;
  totalAmount: number;
  status: string;
  generatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface IInvoiceLineItem {
  _id?: ObjectId;
  invoiceMasterId: ObjectId;
  inwardId: ObjectId;
  commodityId: ObjectId;
  commodityName: string;
  periodStart: string;
  periodEnd: string;
  daysOccupied: number;
  averageQuantityMT: number;
  ratePerMTPerDay: number;
  totalAmount: number;
  createdAt: Date;
}

export interface ReportFilter {
  startDate?: string;
  endDate?: string;
  warehouse?: string;
  warehouseId?: string;
  commodity?: string;
  location?: string;
  clientName?: string;
  clientId?: string;
  direction?: 'INWARD' | 'OUTWARD' | 'ALL';
  page?: number;     // Added for pagiantion
  limit?: number;    // Added for pagination
}

/**
 * Server Action to fetch and filter logistics bookings from MongoDB.
 * Implements high-performance filtering via $match, $gte, $lte, and $regex operators.
 */
type ReportRecord = {
  _id: unknown;
  clientName: string;
  clientLocation: string;
  commodityName: string;
  warehouseName: string;
  location: string;
  quantityMT: number;
  bags: number;
  storageDays: number;
  date: Date | string;
  createdAt?: Date | string;
};

type ReportRow = ReportRecord & {
  direction: 'INWARD' | 'OUTWARD';
  lotNo: string;
  gatePass: string;
  pass: string;
  suppliers: string;
  cadNo: string;
  doNumber: string;
  cdfNo: string;
  mt: number;
  clientId: string;
  commodityId: string;
  warehouseId: string;
  palaBags: number;
};

export async function getFilteredBookings(filters: ReportFilter = {}) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      throw new Error('Unauthorized');
    }

    const db = await getDb();

    // Get valid warehouse IDs from warehouse master (single source of truth)
    const validWarehouseIds = await getValidWarehouseIds();
    const validWarehouseObjectIds = validWarehouseIds
      .map(id => {
        if (typeof id === 'string' && ObjectId.isValid(id)) {
          return new ObjectId(id);
        }
        return (id && typeof id === 'object' && (id as any) instanceof ObjectId) ? id : null;
      })
      .filter((id): id is ObjectId => id !== null);

    const dateFilter: Record<string, Date> = {};
    if (filters.startDate) dateFilter.$gte = new Date(filters.startDate);
    if (filters.endDate) {
      const endDate = new Date(filters.endDate);
      endDate.setHours(23, 59, 59, 999);
      dateFilter.$lte = endDate;
    }

    const matchBase: Record<string, unknown> = {};
    if (Object.keys(dateFilter).length) {
      matchBase.date = dateFilter;
    }

    if (filters.clientId && filters.clientId !== 'ALL') {
      matchBase.clientId = parseFilterId(filters.clientId);
    }

    if (filters.warehouseId && filters.warehouseId !== 'ALL') {
      matchBase.warehouseId = parseFilterId(filters.warehouseId);
    } else {
      matchBase.warehouseId = { $in: validWarehouseObjectIds };
    }

    const lookupStages = [
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
                            onNull: null
                          }
                        }
                      ]
                    }
                  ]
                }
              }
            }
          ],
          as: 'client'
        }
      },
      {
        $lookup: {
          from: 'client_accounts',
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
                            onNull: null
                          }
                        }
                      ]
                    }
                  ]
                }
              }
            }
          ],
          as: 'clientAccount'
        }
      },
      {
        $lookup: {
          from: 'warehouses',
          let: { warehouseId: '$warehouseId' },
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
                            onNull: null
                          }
                        }
                      ]
                    }
                  ]
                }
              }
            }
          ],
          as: 'warehouse'
        }
      },
      {
        $lookup: {
          from: 'commodities',
          let: { commodityId: '$commodityId' },
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
                            onNull: null
                          }
                        }
                      ]
                    }
                  ]
                }
              }
            }
          ],
          as: 'commodity'
        }
      }
    ];

    const applyFilters = (record: ReportRecord) => {
      if (filters.commodity && filters.commodity !== 'ALL') {
        if ((record.commodityName || '').toUpperCase() !== filters.commodity.toUpperCase()) {
          return false;
        }
      }
      if (filters.warehouse && filters.warehouse !== 'ALL') {
        if ((record.warehouseName || '') !== filters.warehouse) {
          return false;
        }
      }
      if (filters.clientName && filters.clientName !== 'ALL') {
        if ((record.clientName || '').toUpperCase() !== filters.clientName.toUpperCase()) {
          return false;
        }
      }
      if (filters.location && filters.location !== 'ALL') {
        if (!record.location?.toLowerCase().includes(filters.location.toLowerCase())) {
          return false;
        }
      }
      return true;
    };

    const directionFilter = filters.direction || 'ALL';
    const shouldFetchInwards = directionFilter === 'ALL' || directionFilter === 'INWARD';
    const shouldFetchOutwards = directionFilter === 'ALL' || directionFilter === 'OUTWARD';

    const inwards = shouldFetchInwards
      ? await db.collection('inwards').aggregate<Record<string, unknown>>([
          { $match: matchBase },
          ...lookupStages,
          {
            $addFields: {
              client: {
                $ifNull: [
                  { $arrayElemAt: ['$client', 0] },
                  { $arrayElemAt: ['$clientAccount', 0] }
                ]
              }
            }
          },
          {
            $project: {
              _id: 1,
              clientId: '$clientId',
              commodityId: '$commodityId',
              warehouseId: '$warehouseId',
              sNo: { $literal: 0 },
              direction: { $literal: 'INWARD' },
              clientName: {
                $ifNull: [
                  '$client.name',
                  '$client.clientName',
                  ''
                ]
              },
              clientLocation: {
                $ifNull: [
                  '$client.address',
                  '$client.clientLocation',
                  ''
                ]
              },
              suppliers: { $ifNull: ['$suppliers', ''] },
              commodityName: {
                $ifNull: [
                  { $arrayElemAt: ['$commodity.name', 0] },
                  '$commodityName'
                ]
              },
              warehouseName: {
                $ifNull: [
                  { $arrayElemAt: ['$warehouse.name', 0] },
                  '$warehouseName'
                ]
              },
              location: {
                $ifNull: [
                  { $arrayElemAt: ['$warehouse.location', 0] },
                  { $arrayElemAt: ['$warehouse.address', 0] },
                  ''
                ]
              },
              cadNo: { $ifNull: ['$cadNo', ''] },
              stackNo: { $ifNull: ['$stackNo', ''] },
              lotNo: { $ifNull: ['$lotNo', ''] },
              doNumber: { $ifNull: ['$doNumber', ''] },
              cdfNo: { $ifNull: ['$cdfNo', ''] },
              gatePass: { $ifNull: ['$gatePass', ''] },
              pass: { $ifNull: ['$pass', ''] },
              quantityMT: '$quantityMT',
              bags: '$bagsCount',
              palaBags: { $ifNull: ['$palaBags', 0] },
              mt: '$quantityMT',
              storageDays: {
                $dateDiff: {
                  startDate: '$date',
                  endDate: '$outwardDate',
                  unit: 'day'
                }
              },
              date: '$date',
              createdAt: '$createdAt'
            }
          }
        ]).toArray() as ReportRecord[]
      : [];

    const outwards = shouldFetchOutwards
      ? await db.collection('outwards').aggregate<Record<string, unknown>>([
          { $match: matchBase },
          ...lookupStages,
          {
            $addFields: {
              client: {
                $ifNull: [
                  { $arrayElemAt: ['$client', 0] },
                  { $arrayElemAt: ['$clientAccount', 0] }
                ]
              }
            }
          },
          {
            $project: {
              _id: 1,
              clientId: '$clientId',
              commodityId: '$commodityId',
              warehouseId: '$warehouseId',
              sNo: { $literal: 0 },
              direction: { $literal: 'OUTWARD' },
              clientName: {
                $ifNull: [
                  '$client.name',
                  '$client.clientName',
                  ''
                ]
              },
              clientLocation: {
                $ifNull: [
                  '$client.address',
                  '$client.clientLocation',
                  ''
                ]
              },
              suppliers: { $ifNull: ['$suppliers', ''] },
              commodityName: {
                $ifNull: [
                  { $arrayElemAt: ['$commodity.name', 0] },
                  '$commodityName'
                ]
              },
              warehouseName: {
                $ifNull: [
                  { $arrayElemAt: ['$warehouse.name', 0] },
                  '$warehouseName'
                ]
              },
              location: {
                $ifNull: [
                  { $arrayElemAt: ['$warehouse.location', 0] },
                  { $arrayElemAt: ['$warehouse.address', 0] },
                  ''
                ]
              },
              cadNo: { $ifNull: ['$cadNo', ''] },
              stackNo: { $ifNull: ['$stackNo', ''] },
              lotNo: { $ifNull: ['$lotNo', ''] },
              doNumber: { $ifNull: ['$doNumber', ''] },
              cdfNo: { $ifNull: ['$cdfNo', ''] },
              gatePass: { $ifNull: ['$gatePass', ''] },
              pass: { $ifNull: ['$pass', ''] },
              quantityMT: '$quantityMT',
              bags: '$bagsCount',
              storageDays: { $literal: 0 },
              mt: '$quantityMT',
              date: '$date',
              createdAt: '$createdAt'
            }
          }
        ]).toArray() as ReportRecord[]
      : [];

    const combinedRecords: ReportRow[] = [
      ...inwards.map((record: ReportRecord) => ({
        _id: record._id,
        direction: 'INWARD' as const,
        date: record.date,
        clientName: record.clientName,
        clientLocation: record.clientLocation,
        commodityName: record.commodityName,
        warehouseName: record.warehouseName,
        location: record.location,
        quantityMT: record.quantityMT,
        bags: record.bags,
        storageDays: record.storageDays,
        createdAt: record.createdAt,
        lotNo: '',
        gatePass: '',
        pass: '',
        suppliers: '',
        cadNo: '',
        doNumber: '',
        cdfNo: '',
        mt: record.quantityMT,
        clientId: (record as any).clientId || '',
        commodityId: (record as any).commodityId || '',
        warehouseId: (record as any).warehouseId || '',
        palaBags: 0
      })),
      ...outwards.map((record: ReportRecord) => ({
        _id: record._id,
        direction: 'OUTWARD' as const,
        date: record.date,
        clientName: record.clientName,
        clientLocation: record.clientLocation,
        commodityName: record.commodityName,
        warehouseName: record.warehouseName,
        location: record.location,
        quantityMT: record.quantityMT,
        bags: record.bags,
        storageDays: record.storageDays,
        createdAt: record.createdAt,
        lotNo: '',
        gatePass: '',
        pass: '',
        suppliers: '',
        cadNo: '',
        doNumber: '',
        cdfNo: '',
        mt: record.quantityMT,
        clientId: (record as any).clientId || '',
        commodityId: (record as any).commodityId || '',
        warehouseId: (record as any).warehouseId || '',
        palaBags: (record as any).palaBags || 0
      }))
    ];

    const filteredRecords = combinedRecords
      .filter(applyFilters)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const totalCount = filteredRecords.length;
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;
    const pagedRecords = filteredRecords.slice(skip, skip + limit);

    const serializedBookings = pagedRecords.map((booking: ReportRow, index) => ({
      ...booking,
      _id: String(booking._id),
      sNo: skip + index + 1,
      date: booking.date instanceof Date ? booking.date.toISOString().split('T')[0] : booking.date,
      createdAt: booking.createdAt instanceof Date ? booking.createdAt.toISOString() : String(booking.createdAt || new Date().toISOString()),
    })) as any[];

    const totalPages = Math.ceil(totalCount / limit);

    return {
      success: true,
      data: serializedBookings,
      count: serializedBookings.length,
      totalCount,
      totalPages,
      currentPage: page
    };

  } catch (error: unknown) {
    console.error('[getFilteredBookings] ERROR:', error);
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, message: message || 'Database fetch failed' };
  }
}

export async function getClientOptions() {
  try {
    const db = await getDb();
    const clients = await db.collection('clients').find().sort({ name: 1 }).toArray() as IClient[];

    const filteredClients = clients.filter((client) => {
      const name = client.name?.trim().toLowerCase() || '';
      return (
        name !== 'abc traders' &&
        name !== 'xyz enterprise' &&
        name !== 'xyz enterprises'
      );
    });

    return [
      { label: 'All Clients', value: 'ALL' },
      ...filteredClients.map(c => ({ label: c.name, value: c._id?.toString() || '' }))
    ];
  } catch (error) {
    console.error('[getClientOptions] Error:', error);
    return [{ label: 'All Clients', value: 'ALL' }];
  }
}

export async function getClientInvoicesByClientId(clientId: string, month?: string, warehouseId?: string) {
  try {
    const db = await getDb();
    const clientObjectId = new ObjectId(clientId);
    const client = await db.collection('clients').findOne({ _id: clientObjectId }) as IClient | null;
    if (!client) {
      return { success: false, message: 'Client not found' };
    }

    // Build query for invoice masters
    const query: any = { clientId: clientObjectId };
    if (month) {
      query.invoiceMonth = month;
    }
    if (warehouseId && warehouseId !== '' && warehouseId !== 'ALL') {
      // Validate warehouse exists in master
      await validateWarehouseId(warehouseId);
      // Warehouse ID comes as string from dropdown, handle both ObjectId and string types
      try {
        const warehouseObjectId = new ObjectId(warehouseId);
        // Try to match either as ObjectId or as string
        query.warehouseId = { $in: [warehouseObjectId, warehouseId] };
      } catch {
        // If not valid ObjectId, just match as string
        query.warehouseId = warehouseId;
      }
    }

    const invoiceMasters = await db.collection('invoice_master')
      .find(query)
      .sort({ invoiceMonth: -1 })
      .toArray() as IInvoiceMaster[];

    if (invoiceMasters.length === 0) {
      return { success: true, data: [] };
    }

    const masterIds = invoiceMasters.map(master => master._id!).filter(Boolean);
    const lineItems = await db.collection('invoice_line_items')
      .find({ invoiceMasterId: { $in: masterIds } })
      .toArray() as IInvoiceLineItem[];

    const warehouseIdStrings = [
      ...new Set(invoiceMasters.map(master => master.warehouseId.toString()))
    ];

    // Build query to find warehouses by their IDs (handle both ObjectId and string types)
    const warehouseQuery: any = {
      $or: warehouseIdStrings.map(id => {
        try {
          const objectId = new ObjectId(id);
          return { $or: [{ _id: objectId }, { _id: id }] }; // Match either format
        } catch {
          return { _id: id }; // Just match as string if not valid ObjectId
        }
      })
    };

    const warehouses = await db.collection('warehouses')
      .find(warehouseQuery)
      .toArray() as IWarehouse[];

    // Use centralized warehouse lookup
    const warehouseMap = await createWarehouseLookupMap();

    // Get client balance information
    const balanceResult = await getClientBalance(clientId);
    const clientBalance = balanceResult.success ? balanceResult.data : { totalPayments: 0, totalOutstanding: 0, currentBalance: 0 };

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const invoices = invoiceMasters.map((master) => {
      const invoiceMonthParts = master.invoiceMonth.split('-');
      const year = parseInt(invoiceMonthParts[0], 10);
      const month = monthNames[parseInt(invoiceMonthParts[1], 10) - 1] || master.invoiceMonth;
      const periods = lineItems
        .filter(item => item.invoiceMasterId?.toString() === master._id?.toString())
        .map(item => ({
          startDate: item.periodStart,
          endDate: item.periodEnd,
          quantityMT: item.averageQuantityMT,
          daysTotal: item.daysOccupied,
          rentTotal: item.totalAmount,
          status: master.status || 'DRAFT',
          commodityName: item.commodityName || item.commodityId?.toString() || ''
        }));

      const previousInvoicesTotal = invoiceMasters
        .filter(inv => {
          const invDate = new Date(inv.invoiceMonth + '-01');
          const currentDate = new Date(master.invoiceMonth + '-01');
          return invDate < currentDate;
        })
        .reduce((sum, inv) => sum + inv.totalAmount, 0);

      const previousBalance = previousInvoicesTotal - (clientBalance?.totalPayments || 0);
      const monthlyRent = master.totalAmount;
      const paymentsReceived = clientBalance?.totalPayments || 0;
      const outstandingBalance = monthlyRent + Math.max(0, previousBalance) - paymentsReceived;

      return {
        bookingId: clientId,
        clientName: client.name,
        month,
        year,
        periods,
        warehouseName: warehouseMap.get(master.warehouseId.toString())?.name || 'General',
        totalRent: monthlyRent,
        previousBalance: Math.max(0, previousBalance),
        paymentsReceived: paymentsReceived,
        outstandingBalance: Math.max(0, outstandingBalance),
        invoiceDate: master.generatedAt?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0],
        invoiceId: master._id?.toString()
      };
    });

    return { success: true, data: invoices };
  } catch (error: any) {
    console.error('[getClientInvoicesByClientId] Error:', error);
    return { success: false, message: error.message || 'Failed to fetch client invoices' };
  }
}

export async function getWarehouseOptions() {
  try {
    // Use centralized warehouse service
    const { getWarehouseOptions: getOptions } = await import('@/lib/warehouse-service');
    return await getOptions();
  } catch (error) {
    console.error('[getWarehouseOptions] Error:', error);
    return [];
  }
}

export async function getCommodityOptions() {
  try {
    const db = await getDb();
    const items = await db.collection('commodities').find().sort({ name: 1 }).toArray();

    return [
      { label: "All Commodities", value: "ALL" },
      ...items.map(c => ({
        label: c.name,
        value: c.name
      }))
    ];
  } catch (error) {
    console.error('[getCommodityOptions] Error:', error);
    return [{ label: "All Commodities", value: "ALL" }];
  }
}

export async function recordPayment(clientId: string, amount: number, paymentDate: string, invoiceId?: string, notes?: string) {
  try {
    const db = await getDb();
    const clientObjectId = new ObjectId(clientId);

    let invoiceIdValue: string | ObjectId | null = null;
    if (invoiceId) {
      try {
        invoiceIdValue = new ObjectId(invoiceId);
      } catch {
        invoiceIdValue = invoiceId;
      }
    }

    const payment = {
      clientId: clientObjectId,
      amount: amount,
      paymentDate: new Date(paymentDate),
      invoiceId: invoiceIdValue,
      notes: notes || '',
      createdAt: new Date(),
      status: 'COMPLETED'
    };

    const result = await db.collection('payments').insertOne(payment);
    return { success: true, paymentId: result.insertedId };
  } catch (error: any) {
    console.error('[recordPayment] Error:', error);
    return { success: false, message: error.message || 'Failed to record payment' };
  }
}

export async function getClientPayments(clientId: string, startDate?: string, endDate?: string) {
  try {
    const db = await getDb();
    const clientObjectId = new ObjectId(clientId);

    const query: any = { clientId: clientObjectId };
    if (startDate) query.paymentDate = { ...query.paymentDate, $gte: new Date(startDate) };
    if (endDate) query.paymentDate = { ...query.paymentDate, $lte: new Date(endDate) };

    const payments = await db.collection('payments')
      .find(query)
      .sort({ paymentDate: -1 })
      .toArray();

    return { success: true, data: payments };
  } catch (error: any) {
    console.error('[getClientPayments] Error:', error);
    return { success: false, message: error.message || 'Failed to fetch payments' };
  }
}

export async function getClientBalance(clientId: string) {
  try {
    const db = await getDb();
    const clientObjectId = new ObjectId(clientId);

    // Get total payments
    const paymentsResult = await db.collection('payments').aggregate([
      { $match: { clientId: clientObjectId, status: 'COMPLETED' } },
      { $group: { _id: null, totalPayments: { $sum: '$amount' } } }
    ]).toArray();

    const totalPayments = paymentsResult.length > 0 ? paymentsResult[0].totalPayments : 0;

    // Get total outstanding invoices
    const invoicesResult = await db.collection('invoice_master').aggregate([
      { $match: { clientId: clientObjectId } },
      { $group: { _id: null, totalOutstanding: { $sum: '$totalAmount' } } }
    ]).toArray();

    const totalOutstanding = invoicesResult.length > 0 ? invoicesResult[0].totalOutstanding : 0;

    const currentBalance = totalOutstanding - totalPayments;

    return {
      success: true,
      data: {
        totalPayments,
        totalOutstanding,
        currentBalance
      }
    };
  } catch (error: any) {
    console.error('[getClientBalance] Error:', error);
    return { success: false, message: error.message || 'Failed to calculate balance' };
  }
}
