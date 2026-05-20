import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Box, Layers, DollarSign, Clock3 } from 'lucide-react';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { getTenantFilterForMongo, isAdmin, isWsp } from '@/lib/ownership';
import { getClientRevenueAnalytics } from '@/app/actions/transaction-actions';
import TransactionsReportWrapper from '@/components/features/reports/transactions-report-wrapper';
import WarehouseInventory from '@/components/features/warehouse/warehouse-inventory';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(value);
}

function getPreviousMonthKey(date: Date) {
  const prevMonth = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  return `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthEnd(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function parseDateValue(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const normalized = String(value).slice(0, 10);
  const parsed = new Date(`${normalized}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function countInvoicePeriodsFromLedgerEntries(entries: any[], lastMonthEnd: Date) {
  const invoicePeriodKeys = new Set<string>();

  entries.forEach((entry) => {
    const startDate = parseDateValue(entry.periodStartDate);
    if (!startDate) return;

    let endDate = parseDateValue(entry.periodEndDate);
    if (!endDate) {
      endDate = lastMonthEnd;
    }

    if (endDate > lastMonthEnd) {
      endDate = lastMonthEnd;
    }

    if (startDate > lastMonthEnd) return;

    let current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const lastMonthStart = new Date(lastMonthEnd.getFullYear(), lastMonthEnd.getMonth(), 1);

    while (current <= endDate) {
      const monthKey = getMonthKey(current);
      const clientId = entry.clientId?.toString?.() || '';
      const warehouseId = entry.warehouseId?.toString?.() || '';
      invoicePeriodKeys.add(`${clientId}::${warehouseId}::${monthKey}`);
      current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
      if (current > lastMonthEnd) break;
    }
  });

  return invoicePeriodKeys.size;
}

function buildDayLabels(currentMonth: Date) {
  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    return {
      key: `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      label: day.toString(),
    };
  });
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/');
  }

  const db = await getDb();
  const tenantFilter = isAdmin(session) ? {} : getTenantFilterForMongo(session);

  const ownedWarehouseDocs = !isAdmin(session)
    ? await db.collection('warehouses').find({ ...tenantFilter }).project({ _id: 1 }).toArray()
    : [];

  const ownedWarehouseIds = ownedWarehouseDocs.map((warehouse: any) => warehouse._id).filter(Boolean);
  const ownedWarehouseIdStrings = ownedWarehouseIds.map((id: any) => id.toString());
  const ownedWarehouseObjectIds = ownedWarehouseIds.filter((id: any) => id instanceof ObjectId);

  const warehouseMatch: any = {};
  if (!isAdmin(session)) {
    warehouseMatch.warehouseId = {
      $in: [...ownedWarehouseIdStrings, ...ownedWarehouseObjectIds],
    };
  }

  const transactionMatch: Record<string, unknown> = {
    ...tenantFilter,
    ...warehouseMatch,
  };

  const now = new Date();
  const currentYearStart = new Date(now.getFullYear(), 0, 1);
  const currentYearEnd = new Date(now.getFullYear() + 1, 0, 1);
  const previousYearStart = new Date(now.getFullYear() - 1, 0, 1);
  const previousYearEnd = new Date(now.getFullYear(), 0, 1);

  const currentYearStartStr = currentYearStart.toISOString().slice(0, 10);
  const currentYearEndStr = currentYearEnd.toISOString().slice(0, 10);
  const previousYearStartStr = previousYearStart.toISOString().slice(0, 10);
  const previousYearEndStr = previousYearEnd.toISOString().slice(0, 10);

  const [transactionAnalytics] = await db.collection('inwards').aggregate([
    {
      $match: Object.keys(transactionMatch).length ? transactionMatch : {}
    },
    {
      $project: {
        direction: { $literal: 'INWARD' },
        quantityMT: 1,
        commodityName: 1,
        date: 1,
        dateString: {
          $cond: [
            { $eq: [{ $type: '$date' }, 'date'] },
            { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
            { $substrCP: ['$date', 0, 10] }
          ]
        }
      }
    },
    {
      $unionWith: {
        coll: 'outwards',
        pipeline: [
          {
            $match: Object.keys(transactionMatch).length ? transactionMatch : {}
          },
          {
            $project: {
              direction: { $literal: 'OUTWARD' },
              quantityMT: 1,
              commodityName: 1,
              date: 1,
              dateString: {
                $cond: [
                  { $eq: [{ $type: '$date' }, 'date'] },
                  { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
                  { $substrCP: ['$date', 0, 10] }
                ]
              }
            }
          }
        ]
      }
    },
    {
      $facet: {
        totals: [
          { $count: 'totalTransactions' }
        ],
        activeInventory: [
          {
            $group: {
              _id: null,
              totalInward: {
                $sum: {
                  $cond: [
                    { $eq: ['$direction', 'INWARD'] },
                    '$quantityMT',
                    0
                  ]
                }
              },
              totalOutward: {
                $sum: {
                  $cond: [
                    { $eq: ['$direction', 'OUTWARD'] },
                    '$quantityMT',
                    0
                  ]
                }
              }
            }
          },
          {
            $project: {
              netInventory: { $subtract: ['$totalInward', '$totalOutward'] }
            }
          }
        ],
        quarterTrendCurrent: [
          {
            $match: {
              dateString: {
                $gte: currentYearStartStr,
                $lt: currentYearEndStr
              }
            }
          },
          {
            $group: {
              _id: {
                $toString: {
                  $ceil: {
                    $divide: [
                      {
                        $month: {
                          $cond: [
                            { $eq: [{ $type: '$date' }, 'date'] },
                            '$date',
                            { $dateFromString: { dateString: '$date' } }
                          ]
                        }
                      },
                      3
                    ]
                  }
                }
              },
              count: { $sum: 1 }
            }
          },
          {
            $project: {
              _id: { $concat: ['Q', '$_id'] },
              count: 1
            }
          },
          { $sort: { _id: 1 } }
        ],
        quarterTrendPrevious: [
          {
            $match: {
              dateString: {
                $gte: previousYearStartStr,
                $lt: previousYearEndStr
              }
            }
          },
          {
            $group: {
              _id: {
                $toString: {
                  $ceil: {
                    $divide: [
                      {
                        $month: {
                          $cond: [
                            { $eq: [{ $type: '$date' }, 'date'] },
                            '$date',
                            { $dateFromString: { dateString: '$date' } }
                          ]
                        }
                      },
                      3
                    ]
                  }
                }
              },
              count: { $sum: 1 }
            }
          },
          {
            $project: {
              _id: { $concat: ['Q', '$_id'] },
              count: 1
            }
          },
          { $sort: { _id: 1 } }
        ],
        directionBreakdown: [
          {
            $group: {
              _id: '$direction',
              count: { $sum: 1 }
            }
          },
          { $sort: { _id: 1 } }
        ],
        commodityBreakdown: [
          {
            $group: {
              _id: '$commodityName',
              totalMt: {
                $sum: {
                  $cond: [
                    { $eq: ['$direction', 'INWARD'] },
                    '$quantityMT',
                    { $multiply: ['$quantityMT', -1] }
                  ]
                }
              }
            }
          },
          {
            $project: {
              commodityName: '$_id',
              totalMt: { $max: ['$totalMt', 0] },
              _id: 0
            }
          },
          { $match: { totalMt: { $gt: 0 } } },
          { $sort: { totalMt: -1 } }
        ]
      }
    }
  ]).toArray();

  const warehouseFilter = tenantFilter;
  const clientFilter = tenantFilter;
  const ownershipFilters = !isAdmin(session) && Array.isArray((tenantFilter as any).$or)
    ? (tenantFilter as any).$or
    : [];
  const invoiceMasterFilter = isAdmin(session)
    ? {}
    : {
        $or: [
          ...ownershipFilters,
          { clientEmail: session.user.email }
        ]
      };
  const invoiceFilter = isAdmin(session)
    ? {}
    : {
        $or: [
          ...ownershipFilters,
          { clientEmail: session.user.email }
        ]
      };

  const lastInvoiceMonthKey = getPreviousMonthKey(now);
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [paymentsReceivedResult, activeWarehouseCount, activeClientCount, invoiceMasterCount, formalInvoiceCount, ledgerEntries, ledgerEntryCount] = await Promise.all([
    db.collection('payments').aggregate([
      { $match: { ...tenantFilter, status: 'COMPLETED' } },
      { $group: { _id: null, totalRevenue: { $sum: '$amount' } } }
    ]).toArray(),
    db.collection('warehouses').countDocuments(warehouseFilter),
    db.collection('clients').countDocuments(clientFilter),
    db.collection('invoice_master').countDocuments({
      $and: [
        invoiceMasterFilter,
        {
          $or: [
            { invoiceMonth: { $exists: true, $ne: '', $lte: lastInvoiceMonthKey } },
            { generatedAt: { $exists: true, $lt: currentMonthStart } },
            { createdAt: { $exists: true, $lt: currentMonthStart } }
          ]
        }
      ]
    }),
    db.collection('invoices').countDocuments({
      $and: [
        invoiceFilter,
        {
          $or: [
            { cycleName: { $exists: true, $ne: '', $lte: lastInvoiceMonthKey } },
            { generatedAt: { $exists: true, $lt: currentMonthStart } },
            { createdAt: { $exists: true, $lt: currentMonthStart } }
          ]
        }
      ]
    }),
    db.collection('ledger_entries').find({
      ...tenantFilter,
      periodStartDate: { $exists: true, $ne: null },
      quantityMT: { $gt: 0 }
    }).project({ clientId: 1, warehouseId: 1, periodStartDate: 1, periodEndDate: 1 }).toArray(),
    db.collection('ledger_entries').countDocuments({ ...tenantFilter })
  ]);

  const invoiceMasterCountValue = invoiceMasterCount ?? 0;
  const formalInvoiceCountValue = formalInvoiceCount ?? 0;
  const ledgerInvoiceCount = countInvoicePeriodsFromLedgerEntries(ledgerEntries, getMonthEnd(new Date(lastInvoiceMonthKey + '-01')));
  const invoiceCount = ledgerInvoiceCount > 0
    ? ledgerInvoiceCount
    : invoiceMasterCountValue > 0
      ? invoiceMasterCountValue
      : formalInvoiceCountValue;
  const ledgerEntryCountValue = ledgerEntryCount ?? 0;

  const totalTransactions = transactionAnalytics?.totals?.[0]?.totalTransactions ?? 0;
  const activeInventory = transactionAnalytics?.activeInventory?.[0]?.netInventory ?? 0;
  const inwardTransactions = transactionAnalytics?.directionBreakdown?.find((item: any) => item._id === 'INWARD')?.count ?? 0;
  const outwardTransactions = transactionAnalytics?.directionBreakdown?.find((item: any) => item._id === 'OUTWARD')?.count ?? 0;

  const revenueAnalytics = await getClientRevenueAnalytics();
  const totalRevenue = revenueAnalytics?.summary?.totalRevenue ?? paymentsReceivedResult[0]?.totalRevenue ?? 0;

  const masterLinks = [
    { name: 'Active Warehouses', value: activeWarehouseCount, href: '/dashboard/warehouses' },
    { name: 'Active Clients', value: activeClientCount, href: '/dashboard/clients' },
    { name: 'Invoices', value: invoiceCount, href: '/dashboard/client-invoices' },
    { name: 'Ledger Entries', value: ledgerEntryCountValue, href: '/dashboard/ledger' }
  ];

  const stats = [
    {
      name: 'Total Transactions',
      value: formatNumber(totalTransactions),
      icon: Box,
      color: 'text-blue-600',
      bg: 'bg-blue-100',
    },
    {
      name: 'Current Inventory (MT)',
      value: formatNumber(Math.max(activeInventory, 0)),
      icon: Layers,
      color: 'text-sky-600',
      bg: 'bg-sky-100',
    },
    {
      name: 'Total Revenue',
      value: formatCurrency(totalRevenue),
      icon: DollarSign,
      href: '/dashboard/revenue',
      color: 'text-emerald-600',
      bg: 'bg-emerald-100',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Command Center</h1>
        <p className="text-slate-500">
          Welcome back, {session.user?.email} • Role: {(session.user as any)?.role}
        </p>
        {!isWsp(session) && (
          <p className="text-slate-500 mt-2">
            Transactions under this account: {formatNumber(totalTransactions)}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {stats.map((stat) => {
          const Icon = stat.icon;
          const cardContent = (
            <div className="w-full overflow-hidden rounded-3xl bg-white p-6 shadow-sm border border-slate-100 hover:border-slate-300 transition">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-500">{stat.name}</p>
                  <p className="mt-3 text-3xl font-semibold text-slate-900">{stat.value}</p>
                </div>
                <div className={`p-3 rounded-2xl ${stat.bg}`}>
                  <Icon className={`h-6 w-6 ${stat.color}`} aria-hidden="true" />
                </div>
              </div>
            </div>
          );

          return stat.href ? (
            <Link key={stat.name} href={stat.href} className="block w-full">
              {cardContent}
            </Link>
          ) : (
            <div key={stat.name} className="w-full">{cardContent}</div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          {masterLinks.map((item) => (
            <Link key={item.name} href={item.href} className="rounded-3xl bg-white p-5 shadow-sm border border-slate-100 transition hover:border-slate-300">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{item.name}</p>
              <p className="mt-4 text-3xl font-semibold text-slate-900">{formatNumber(item.value)}</p>
            </Link>
          ))}
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-100">
          <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Transaction Report</h3>
              <p className="text-sm text-slate-500">Live transaction report with warehouse and client filters using the standard transaction report table layout.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-3xl bg-slate-50 px-4 py-3 border border-slate-200">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Inward</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{formatNumber(inwardTransactions)}</p>
              </div>
              <div className="rounded-3xl bg-slate-50 px-4 py-3 border border-slate-200">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Outward</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{formatNumber(outwardTransactions)}</p>
              </div>
              <div className="rounded-3xl bg-slate-50 px-4 py-3 border border-slate-200">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Filtered Total</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{formatNumber(totalTransactions)}</p>
              </div>
            </div>
          </div>
          <TransactionsReportWrapper />
        </div>
      </div>

      {/* Warehouse Inventory Section */}
      <div className="rounded-3xl bg-slate-50 p-6 border border-slate-200">
        <WarehouseInventory />
      </div>
    </div>
  );
}
