import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Box, Layers, DollarSign, Clock3, Building2, Users, Receipt, BookOpen, ArrowRight } from 'lucide-react';
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
    { name: 'Active Warehouses', value: activeWarehouseCount, href: '/dashboard/warehouses', icon: Building2, color: 'text-indigo-600', bg: 'bg-indigo-50 border-indigo-100/30' },
    { name: 'Active Clients', value: activeClientCount, href: '/dashboard/clients', icon: Users, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100/30' },
    { name: 'Invoices', value: invoiceCount, href: '/dashboard/client-invoices', icon: Receipt, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-100/30' },
    { name: 'Ledger Entries', value: ledgerEntryCountValue, href: '/dashboard/ledger', icon: BookOpen, color: 'text-purple-600', bg: 'bg-purple-50 border-purple-100/30' }
  ];

  const stats = [
    {
      name: 'Total Transactions',
      value: formatNumber(totalTransactions),
      icon: Box,
      color: 'text-indigo-600',
      bg: 'bg-indigo-50',
    },
    {
      name: 'Current Inventory (MT)',
      value: formatNumber(Math.max(activeInventory, 0)),
      icon: Layers,
      color: 'text-sky-600',
      bg: 'bg-sky-50',
    },
    {
      name: 'Total Revenue',
      value: formatCurrency(totalRevenue),
      icon: DollarSign,
      href: '/dashboard/revenue',
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Premium Hero Header Section */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[var(--brand-bg)] to-[var(--brand-bg-dark)] p-6 md:p-8 text-white shadow-lg shadow-slate-950/15">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="absolute -left-10 -bottom-10 h-40 w-40 rounded-full bg-orange-500/10 blur-3xl" />

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-indigo-200 bg-clip-text text-transparent">
                Command Center
              </h1>
            </div>
            <p className="mt-2 text-slate-300 font-medium">
              Welcome back, <span className="text-white font-bold">{session.user?.fullName}</span>
            </p>
            {!isWsp(session) && (
              <p className="mt-1.5 text-sm text-slate-400 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
                Transactions under this account: <span className="font-semibold text-slate-200">{formatNumber(totalTransactions)}</span>
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-3 items-center">
            {/* Elegant Role Badge */}
            <div className="inline-flex items-center gap-2 rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 px-4 py-2 text-sm">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-slate-300">Role:</span>
              <span className="font-bold text-white uppercase tracking-wider text-xs">{(session.user as any)?.role}</span>
            </div>


          </div>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {stats.map((stat) => {
          const Icon = stat.icon;
          const cardContent = (
            <div className="group relative w-full overflow-hidden rounded-3xl bg-white p-6 shadow-sm border border-slate-100/80 hover:border-indigo-100 hover:shadow-md hover:shadow-indigo-500/5 transition-all duration-300 hover:scale-[1.02] hover:-translate-y-0.5">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="flex items-start justify-between gap-4 relative z-10">
                <div className="space-y-1">
                  <p className="text-sm font-semibold tracking-wide text-slate-500 uppercase">{stat.name}</p>
                  <p className="mt-3 text-3xl font-extrabold text-slate-900 tracking-tight">{stat.value}</p>
                  {stat.name.includes('Transactions') && (
                    <p className="text-xs text-slate-400 mt-2 font-medium">Inward & Outward activities combined</p>
                  )}
                  {stat.name.includes('Inventory') && (
                    <p className="text-xs text-slate-400 mt-2 font-medium">Net volume across active warehouses</p>
                  )}
                  {stat.name.includes('Revenue') && (
                    <p className="text-xs text-slate-400 mt-2 font-medium">Click to view analytical breakdown →</p>
                  )}
                </div>
                <div className={`p-4 rounded-2xl ${stat.bg} transition-transform duration-300 group-hover:scale-110 shadow-inner`}>
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
        {/* Quick Navigation Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {masterLinks.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                href={item.href}
                className="group relative overflow-hidden rounded-2xl bg-white p-4 shadow-sm border border-slate-100 hover:border-slate-250 hover:shadow-md transition-all duration-300 hover:scale-[1.02] hover:-translate-y-0.5"
              >
                <div className="flex justify-between items-center relative z-10">
                  <div>
                    <p className="text-2xs font-extrabold uppercase tracking-widest text-slate-400 group-hover:text-slate-500 transition-colors flex items-center gap-1">
                      {item.name}
                      <ArrowRight className="h-3 w-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
                    </p>
                    <p className="mt-1 text-2xl font-black text-slate-900 tracking-tight">
                      {formatNumber(item.value)}
                    </p>
                  </div>
                  <div className={`p-2.5 rounded-xl ${item.bg} border transition-all duration-300 group-hover:scale-110 shadow-sm`}>
                    <Icon className={`h-4.5 w-4.5 ${item.color}`} />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Live Transaction Report wrapper */}
        <div className="rounded-3xl bg-white p-6 md:p-8 shadow-md shadow-slate-100/50 border border-slate-100/80">
          <div className="mb-8 flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-indigo-500 animate-ping" />
                <h3 className="text-xl font-bold tracking-tight text-slate-900">Live Transaction Stream</h3>
              </div>
              <p className="text-sm text-slate-500 mt-1.5 max-w-xl">
                Real-time tracking of crop arrivals and releases. Use filters below to search by warehouse, client, or specific date range.
              </p>
            </div>

            <div className="grid gap-4 grid-cols-3 xl:w-auto min-w-[320px] sm:min-w-[450px]">
              <div className="rounded-2xl bg-indigo-50/50 p-4 border border-indigo-100/20 text-center transition-all hover:bg-indigo-50">
                <p className="text-2xs font-extrabold uppercase tracking-[0.2em] text-slate-400">Inward</p>
                <p className="mt-2 text-2xl font-extrabold text-indigo-600 tracking-tight">{formatNumber(inwardTransactions)}</p>
              </div>

              <div className="rounded-2xl bg-purple-50/50 p-4 border border-purple-100/20 text-center transition-all hover:bg-purple-50">
                <p className="text-2xs font-extrabold uppercase tracking-[0.2em] text-slate-400">Outward</p>
                <p className="mt-2 text-2xl font-extrabold text-purple-600 tracking-tight">{formatNumber(outwardTransactions)}</p>
              </div>

              <div className="rounded-2xl bg-slate-50 p-4 border border-slate-200/60 text-center transition-all hover:bg-slate-100">
                <p className="text-2xs font-extrabold uppercase tracking-[0.2em] text-slate-400">Total Stream</p>
                <p className="mt-2 text-2xl font-extrabold text-slate-800 tracking-tight">{formatNumber(totalTransactions)}</p>
              </div>
            </div>
          </div>

          <div className="border border-slate-100 rounded-2xl overflow-hidden bg-slate-50/30">
            <TransactionsReportWrapper />
          </div>
        </div>
      </div>

      {/* Warehouse Inventory Section */}
      <div className="rounded-3xl bg-white p-6 md:p-8 shadow-md shadow-slate-100/50 border border-slate-100/80">
        <WarehouseInventory />
      </div>
    </div>
  );
}
