import Link from 'next/link';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Box, Layers, Clock3, Building2, Users, Receipt, BookOpen, ArrowRight, TrendingDown } from 'lucide-react';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { getTenantFilterForMongo, isAdmin, isWsp } from '@/lib/ownership';
import ColdWarehouseInventory from '@/components/features/warehouse/cold-warehouse-inventory';
import { en, gu } from '@/lib/i18n/cold/dictionaries';
import { hasPermission } from '@/lib/permissions';

import { toGujaratiDigits } from '@/lib/utils/cold-numbers';

function formatNumber(value: number, language: string) {
  const formatted = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(value);
  return language === 'gu' ? toGujaratiDigits(formatted) : formatted;
}



export default async function ColdDashboardContent({ session }: { session: any }) {
  const langStr = (session.user as any)?.coldLanguage === 'gu' ? 'gu' : 'en';
  const lang = langStr === 'gu' ? gu : en;
  const t = lang.dashboard as any;
  const sidebarT = lang.sidebar as any;

  if (!hasPermission(session, 'dashboard', 'view')) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] bg-white rounded-3xl p-8 border border-slate-100 shadow-sm">
        <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-6">
          <Layers className="h-8 w-8 text-indigo-500" />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 tracking-tight">{t.welcomeBack} {session.user?.fullName}</h2>
        <p className="mt-3 text-slate-500 text-center max-w-md">
          {langStr === 'gu' 
            ? 'ચાલુ રાખવા માટે કૃપા કરીને સાઇડબારમાંથી કોઈ વિકલ્પ પસંદ કરો.'
            : 'Please select an option from the sidebar to continue.'}
        </p>
      </div>
    );
  }

  const db = await getDb();
  const tenantFilter = isAdmin(session) ? {} : getTenantFilterForMongo(session);

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

  // Launch counts and secondary aggregations immediately in parallel with warehouse lookup & analytics
  const secondaryMetricsPromise = Promise.all([
    db.collection('coldinvoices').aggregate([
      { $match: { ...tenantFilter } },
      { $group: { _id: null, totalRevenue: { $sum: '$totalAmount' } } }
    ]).toArray(),
    db.collection('coldwarehouses').countDocuments(warehouseFilter),
    db.collection('clients').countDocuments(clientFilter),
    db.collection('coldinvoices').countDocuments(invoiceFilter),
    db.collection('coldcommodities').countDocuments(tenantFilter)
  ]);

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

  const t0 = Date.now();
  console.log('[Dashboard] Starting analytics aggregation...');

  const analyticsPromise = db.collection('coldinwards').aggregate([
    {
      $match: Object.keys(transactionMatch).length ? transactionMatch : {}
    },
    {
      $project: {
        direction: { $literal: 'INWARD' },
        quantityMT: { $divide: [{ $ifNull: ['$quantityKg', 0] }, 1000] },
        bags: { $ifNull: ['$totalBags', { $ifNull: ['$bagsCount', 0] }] },
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
              plusMinus: { $ifNull: ['$plusMinus', 0] },
              bags: { $ifNull: ['$totalBags', { $ifNull: ['$bagsCount', 0] }] },
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
              },
              totalInwardBags: {
                $sum: {
                  $cond: [
                    { $eq: ['$direction', 'INWARD'] },
                    '$bags',
                    0
                  ]
                }
              },
              totalOutwardBags: {
                $sum: {
                  $cond: [
                    { $eq: ['$direction', 'OUTWARD'] },
                    '$bags',
                    0
                  ]
                }
              }
            }
          },
          {
            $project: {
              netInventory: { $subtract: ['$totalInward', '$totalOutward'] },
              netBags: { $subtract: ['$totalInwardBags', '$totalOutwardBags'] }
            }
          }
        ],
        totalNetWeightLoss: [
          {
            $group: {
              _id: null,
              totalLoss: {
                $sum: {
                  $cond: [
                    { $eq: ['$direction', 'OUTWARD'] },
                    { $ifNull: ['$plusMinus', 0] },
                    0
                  ]
                }
              }
            }
          }
        ]
      }
    }
  ]).toArray();

  const [[transactionAnalytics], [paymentsReceivedResult, activeWarehouseCount, activeClientCount, coldInvoiceCount, activeCommodityCount]] = await Promise.all([
    analyticsPromise,
    secondaryMetricsPromise
  ]);

  const t1 = Date.now();
  console.log(`[Dashboard] Aggregations and counts took ${t1 - t0}ms total`);


  const invoiceCount = coldInvoiceCount ?? 0;
  const commodityCountValue = activeCommodityCount ?? 0;

  const totalTransactions = transactionAnalytics?.totals?.[0]?.totalTransactions ?? 0;
  const activeInventory = transactionAnalytics?.activeInventory?.[0]?.netInventory ?? 0;
  const activeBags = transactionAnalytics?.activeInventory?.[0]?.netBags ?? 0;
  const totalNetWeightLoss = transactionAnalytics?.totalNetWeightLoss?.[0]?.totalLoss ?? 0;


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
    {
      name: 'Total Net Weight Loss (kg)',
      value: formatNumber(totalNetWeightLoss, langStr),
      icon: TrendingDown,
      color: 'text-red-600',
      bg: 'bg-red-50',
    },
    {
      name: 'Total Available Bags',
      value: formatNumber(Math.max(activeBags, 0), langStr),
      icon: Box,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat: any) => {
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
                  {stat.name === 'Total Available Bags' && (
                    <p className="text-xs text-slate-400 mt-2 font-medium">Available Bags</p>
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

      </div>

    </div>
  );
}
