import Link from 'next/link';
import { getServerSession } from 'next-auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Box, Layers, Clock3, Building2, Users, Receipt, BookOpen, ArrowRight } from 'lucide-react';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { getTenantFilterForMongo, isAdmin, isWsp } from '@/lib/ownership';
import ColdTransactionsReportWrapper from '@/components/features/reports/cold-transactions-report-wrapper';
import ColdWarehouseInventory from '@/components/features/warehouse/cold-warehouse-inventory';
import { en, gu } from '@/lib/i18n/cold/dictionaries';

import { toGujaratiDigits } from '@/lib/utils/cold-numbers';

function formatNumber(value: number, language: string) {
  const formatted = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(value);
  return language === 'gu' ? toGujaratiDigits(formatted) : formatted;
}



export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/');
  }

  const langStr = (session.user as any)?.coldLanguage === 'gu' ? 'gu' : 'en';
  const lang = langStr === 'gu' ? gu : en;
  const t = lang.dashboard as any;
  const sidebarT = lang.sidebar as any;

  const db = await getDb();
  const tenantFilter = isAdmin(session) ? {} : getTenantFilterForMongo(session);

  const ownedWarehouseDocs = !isAdmin(session)
    ? await db.collection('coldwarehouses').find({ ...tenantFilter }).project({ _id: 1 }).toArray()
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

  const [transactionAnalytics] = await db.collection('coldinwards').aggregate([
    {
      $match: Object.keys(transactionMatch).length ? transactionMatch : {}
    },
    {
      $project: {
        direction: { $literal: 'INWARD' },
        quantityMT: { $divide: [{ $ifNull: ['$quantityKg', 0] }, 1000] },
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
        coll: 'coldoutwards',
        pipeline: [
          {
            $match: Object.keys(transactionMatch).length ? transactionMatch : {}
          },
          {
            $project: {
              direction: { $literal: 'OUTWARD' },
              quantityMT: { $divide: [{ $ifNull: ['$quantityKg', 0] }, 1000] },
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
  const invoiceFilter = isAdmin(session)
    ? {}
    : {
      $or: [
        ...ownershipFilters,
        { clientEmail: session.user.email }
      ]
    };

  const [paymentsReceivedResult, activeWarehouseCount, activeClientCount, coldInvoiceCount, activeCommodityCount] = await Promise.all([
    db.collection('coldinvoices').aggregate([
      { $match: { ...tenantFilter } },
      { $group: { _id: null, totalRevenue: { $sum: '$totalAmount' } } }
    ]).toArray(),
    db.collection('coldwarehouses').countDocuments(warehouseFilter),
    db.collection('clients').countDocuments(clientFilter),
    db.collection('coldinvoices').countDocuments(invoiceFilter),
    db.collection('coldcommodities').countDocuments(tenantFilter)
  ]);

  const invoiceCount = coldInvoiceCount ?? 0;
  const commodityCountValue = activeCommodityCount ?? 0;

  const totalTransactions = transactionAnalytics?.totals?.[0]?.totalTransactions ?? 0;
  const activeInventory = transactionAnalytics?.activeInventory?.[0]?.netInventory ?? 0;
  const inwardTransactions = transactionAnalytics?.directionBreakdown?.find((item: any) => item._id === 'INWARD')?.count ?? 0;
  const outwardTransactions = transactionAnalytics?.directionBreakdown?.find((item: any) => item._id === 'OUTWARD')?.count ?? 0;


  const masterLinks = [
    { name: t.activeWarehouses, value: activeWarehouseCount, href: '/cold/warehouses', icon: Building2, color: 'text-indigo-600', bg: 'bg-indigo-50 border-indigo-100/30' },
    { name: t.activeClients, value: activeClientCount, href: '/cold/clients', icon: Users, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100/30' },
    { name: t.invoices, value: invoiceCount, href: '/cold/invoices', icon: Receipt, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-100/30' },
    { name: sidebarT.commodities, value: commodityCountValue, href: '/cold/commodities', icon: Box, color: 'text-purple-600', bg: 'bg-purple-50 border-purple-100/30' }
  ];

  const stats = [
    {
      name: t.totalTransactions,
      value: formatNumber(totalTransactions, langStr),
      icon: Box,
      color: 'text-indigo-600',
      bg: 'bg-indigo-50',
    },
    {
      name: t.currentInventory,
      value: formatNumber(Math.max(activeInventory, 0), langStr),
      icon: Layers,
      color: 'text-sky-600',
      bg: 'bg-sky-50',
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
                {t.commandCenter}
              </h1>
            </div>
            <p className="mt-2 text-slate-300 font-medium">
              {t.welcomeBack} <span className="text-white font-bold">{session.user?.fullName}</span>
            </p>
            {!isWsp(session) && (
              <p className="mt-1.5 text-sm text-slate-400 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
                {t.transactionsUnderAccount} <span className="font-semibold text-slate-200">{formatNumber(totalTransactions, (session.user as any)?.coldLanguage)}</span>
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-3 items-center">
            {/* Elegant Role Badge */}
            <div className="inline-flex items-center gap-2 rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 px-4 py-2 text-sm">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-slate-300">{t.role}</span>
              <span className="font-bold text-white uppercase tracking-wider text-xs">{(session.user as any)?.role}</span>
            </div>


          </div>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {stats.map((stat) => {
          const Icon = stat.icon;
          const cardContent = (
            <div className="group relative w-full overflow-hidden rounded-3xl bg-white p-6 shadow-sm border border-slate-100/80 hover:border-indigo-100 hover:shadow-md hover:shadow-indigo-500/5 transition-all duration-300 hover:scale-[1.02] hover:-translate-y-0.5">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="flex items-start justify-between gap-4 relative z-10">
                <div className="space-y-1">
                  <p className="text-sm font-semibold tracking-wide text-slate-500 uppercase">{stat.name}</p>
                  <p className="mt-3 text-3xl font-extrabold text-slate-900 tracking-tight">{stat.value}</p>
                  {stat.name === t.totalTransactions && (
                    <p className="text-xs text-slate-400 mt-2 font-medium">{t.inwardOutwardCombined}</p>
                  )}
                  {stat.name === t.currentInventory && (
                    <p className="text-xs text-slate-400 mt-2 font-medium">{t.netVolumeActive}</p>
                  )}
                  {stat.name === t.totalRevenue && (
                    <p className="text-xs text-slate-400 mt-2 font-medium">{t.clickViewAnalytics}</p>
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
                      {formatNumber(item.value, (session.user as any)?.coldLanguage)}
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

      {/* Warehouse Inventory Section */}
      <div className="rounded-3xl bg-white p-6 md:p-8 shadow-md shadow-slate-100/50 border border-slate-100/80">
        <ColdWarehouseInventory />
      </div>

      {/* Live Transaction Report wrapper */}
      <div className="rounded-3xl bg-white p-6 md:p-8 shadow-md shadow-slate-100/50 border border-slate-100/80">
          <div className="mb-8 flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-indigo-500 animate-ping" />
                <h3 className="text-xl font-bold tracking-tight text-slate-900">{t.liveTransactionStream}</h3>
              </div>
              <p className="text-sm text-slate-500 mt-1.5 max-w-xl">
                {t.realTimeTracking}
              </p>
            </div>

            <div className="grid gap-4 grid-cols-3 xl:w-auto min-w-[320px] sm:min-w-[450px]">
              <div className="rounded-2xl bg-indigo-50/50 p-4 border border-indigo-100/20 text-center transition-all hover:bg-indigo-50">
                <p className="text-2xs font-extrabold uppercase tracking-[0.2em] text-slate-400">{t.inward}</p>
                <p className="mt-2 text-2xl font-extrabold text-indigo-600 tracking-tight">{formatNumber(inwardTransactions, (session.user as any)?.coldLanguage)}</p>
              </div>

              <div className="rounded-2xl bg-purple-50/50 p-4 border border-purple-100/20 text-center transition-all hover:bg-purple-50">
                <p className="text-2xs font-extrabold uppercase tracking-[0.2em] text-slate-400">{t.outward}</p>
                <p className="mt-2 text-2xl font-extrabold text-purple-600 tracking-tight">{formatNumber(outwardTransactions, (session.user as any)?.coldLanguage)}</p>
              </div>

              <div className="rounded-2xl bg-slate-50 p-4 border border-slate-200/60 text-center transition-all hover:bg-slate-100">
                <p className="text-2xs font-extrabold uppercase tracking-[0.2em] text-slate-400">{t.totalStream}</p>
                <p className="mt-2 text-2xl font-extrabold text-slate-800 tracking-tight">{formatNumber(totalTransactions, (session.user as any)?.coldLanguage)}</p>
              </div>
            </div>
          </div>

          <div className="border border-slate-100 rounded-2xl overflow-hidden bg-slate-50/30">
            <ColdTransactionsReportWrapper />
          </div>
        </div>
      </div>

    </div>
  );
}
