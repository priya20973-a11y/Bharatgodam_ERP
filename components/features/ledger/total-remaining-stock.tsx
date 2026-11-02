'use client';

import React, { useMemo, useState } from 'react';
import { Package, Scale, ArrowDownRight, ArrowUpRight, CheckCircle2, Warehouse as WarehouseIcon, Filter } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  TotalRemainingStockSummary,
  calculateRemainingStock,
  Transaction,
} from '@/lib/ledger-engine';

interface TotalRemainingStockProps {
  stockSummary?: TotalRemainingStockSummary;
  transactions?: Transaction[];
  isLoading?: boolean;
}

export const TotalRemainingStock: React.FC<TotalRemainingStockProps> = ({
  stockSummary: propStockSummary,
  transactions,
  isLoading = false,
}) => {
  const [selectedWarehouseFilter, setSelectedWarehouseFilter] = useState<string>('ALL');

  // Compute stock summary from transactions if not directly passed or ensure freshness
  const stock = useMemo(() => {
    if (propStockSummary) {
      return propStockSummary;
    }
    if (transactions && transactions.length > 0) {
      return calculateRemainingStock(transactions);
    }
    return {
      inward: { bags: 0, weightMT: 0 },
      outward: { bags: 0, weightMT: 0 },
      remaining: { bags: 0, weightMT: 0 },
      warehouseSummaries: [],
      breakdown: [],
    } as TotalRemainingStockSummary;
  }, [propStockSummary, transactions]);

  const formatNumber = (num: number, decimals: number = 2) => {
    if (num == null || Number.isNaN(num)) return '0.00';
    return Number(num).toLocaleString('en-IN', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const formatBags = (bags: number) => {
    if (bags == null || Number.isNaN(bags)) return '0';
    return Math.round(bags).toLocaleString('en-IN');
  };

  // Available warehouses for filtering
  const availableWarehouses = useMemo(() => {
    const list = stock.warehouseSummaries.map((w) => ({
      id: w.warehouseId,
      name: w.warehouseName,
    }));
    return list;
  }, [stock.warehouseSummaries]);

  // Filtered breakdown based on selection
  const filteredBreakdown = useMemo(() => {
    if (selectedWarehouseFilter === 'ALL') {
      return stock.breakdown;
    }
    return stock.breakdown.filter((item) => item.warehouseId === selectedWarehouseFilter);
  }, [stock.breakdown, selectedWarehouseFilter]);

  // Active view totals (overall or selected warehouse)
  const activeMetrics = useMemo(() => {
    if (selectedWarehouseFilter === 'ALL') {
      return {
        inward: stock.inward,
        outward: stock.outward,
        remaining: stock.remaining,
      };
    }
    const matchedWarehouse = stock.warehouseSummaries.find((w) => w.warehouseId === selectedWarehouseFilter);
    if (matchedWarehouse) {
      return {
        inward: matchedWarehouse.inward,
        outward: matchedWarehouse.outward,
        remaining: matchedWarehouse.remaining,
      };
    }
    return {
      inward: stock.inward,
      outward: stock.outward,
      remaining: stock.remaining,
    };
  }, [stock, selectedWarehouseFilter]);

  const hasAnyStock = stock.inward.weightMT > 0 || stock.inward.bags > 0;
  const isCleared = activeMetrics.remaining.weightMT <= 0 && activeMetrics.remaining.bags <= 0;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
      {/* Header Banner */}
      <div className="border-b border-slate-200 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 px-6 py-5 text-white">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold tracking-tight text-white">Total Remaining Stock</h2>
                <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20 text-[10px] font-semibold">
                  Live Inventory
                </Badge>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Calculated automatically: <span className="font-semibold text-white">Remaining Stock = Total Inward Stock − Total Outward Stock</span>
              </p>
            </div>
          </div>

          {/* Warehouse Filter */}
          {availableWarehouses.length > 1 && (
            <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700">
              <Filter className="h-3.5 w-3.5 text-indigo-400" />
              <span className="text-xs text-slate-300 font-medium">Warehouse:</span>
              <select
                value={selectedWarehouseFilter}
                onChange={(e) => setSelectedWarehouseFilter(e.target.value)}
                className="bg-transparent text-xs text-white font-semibold focus:outline-none cursor-pointer"
              >
                <option value="ALL" className="bg-slate-800 text-white">All Warehouses ({availableWarehouses.length})</option>
                {availableWarehouses.map((w) => (
                  <option key={w.id} value={w.id} className="bg-slate-800 text-white">
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Main Stock Metric Cards */}
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* 1. BAGS METRIC CARD */}
          <Card className="border border-slate-200 bg-slate-50/70 hover:bg-slate-50 transition-colors shadow-none">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-md bg-amber-100 flex items-center justify-center text-amber-700">
                    <Package className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Bags Balance</div>
                    <div className="text-[11px] text-slate-400">Total physical bags</div>
                  </div>
                </div>
                <Badge variant={activeMetrics.remaining.bags > 0 ? 'default' : 'secondary'} className={activeMetrics.remaining.bags > 0 ? 'bg-amber-600 hover:bg-amber-700 text-white' : ''}>
                  {activeMetrics.remaining.bags > 0 ? 'In Stock' : (hasAnyStock ? 'Cleared' : 'No Bags')}
                </Badge>
              </div>

              {/* Highlight Value */}
              <div className="mb-4">
                <div className="text-xs text-slate-500 font-medium">Remaining Bags</div>
                <div className="text-2xl font-black text-slate-900 tracking-tight">
                  {isLoading ? '...' : `${formatBags(activeMetrics.remaining.bags)}`}
                  <span className="text-xs font-normal text-slate-500 ml-1.5">Bags</span>
                </div>
              </div>

              {/* Sub Metrics: Inward vs Outward */}
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-200 text-xs">
                <div>
                  <div className="flex items-center gap-1 text-slate-500 text-[11px] font-medium">
                    <ArrowDownRight className="h-3 w-3 text-emerald-600" />
                    Total Inward
                  </div>
                  <div className="font-bold text-slate-800 mt-0.5">
                    {isLoading ? '...' : `${formatBags(activeMetrics.inward.bags)} Bags`}
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-1 text-slate-500 text-[11px] font-medium">
                    <ArrowUpRight className="h-3 w-3 text-orange-600" />
                    Total Outward
                  </div>
                  <div className="font-bold text-slate-800 mt-0.5">
                    {isLoading ? '...' : `${formatBags(activeMetrics.outward.bags)} Bags`}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 2. WEIGHT (MT) METRIC CARD */}
          <Card className="border border-slate-200 bg-slate-50/70 hover:bg-slate-50 transition-colors shadow-none">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-md bg-emerald-100 flex items-center justify-center text-emerald-700">
                    <Scale className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Weight (MT)</div>
                    <div className="text-[11px] text-slate-400">Metric Tonnes</div>
                  </div>
                </div>
                <Badge variant={activeMetrics.remaining.weightMT > 0 ? 'default' : 'secondary'} className={activeMetrics.remaining.weightMT > 0 ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}>
                  {activeMetrics.remaining.weightMT > 0 ? `${formatNumber(activeMetrics.remaining.weightMT, 2)} MT` : '0.00 MT'}
                </Badge>
              </div>

              {/* Highlight Value */}
              <div className="mb-4">
                <div className="text-xs text-slate-500 font-medium">Remaining Weight (MT)</div>
                <div className="text-2xl font-black text-slate-900 tracking-tight">
                  {isLoading ? '...' : `${formatNumber(activeMetrics.remaining.weightMT, 4)}`}
                  <span className="text-xs font-normal text-slate-500 ml-1.5">MT</span>
                </div>
              </div>

              {/* Sub Metrics: Inward vs Outward */}
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-200 text-xs">
                <div>
                  <div className="flex items-center gap-1 text-slate-500 text-[11px] font-medium">
                    <ArrowDownRight className="h-3 w-3 text-emerald-600" />
                    Total Inward
                  </div>
                  <div className="font-bold text-slate-800 mt-0.5">
                    {isLoading ? '...' : `${formatNumber(activeMetrics.inward.weightMT, 2)} MT`}
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-1 text-slate-500 text-[11px] font-medium">
                    <ArrowUpRight className="h-3 w-3 text-orange-600" />
                    Total Outward
                  </div>
                  <div className="font-bold text-slate-800 mt-0.5">
                    {isLoading ? '...' : `${formatNumber(activeMetrics.outward.weightMT, 2)} MT`}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Breakdown Table: Warehouse & Commodity */}
        <div className="mt-6 border border-slate-200 rounded-lg overflow-hidden">
          <div className="bg-slate-100/80 px-4 py-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2">
              <WarehouseIcon className="h-4 w-4 text-slate-600" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Warehouse & Commodity Inventory Breakdown
              </span>
            </div>
            <div className="text-xs text-slate-500 font-medium">
              {filteredBreakdown.length} item{filteredBreakdown.length === 1 ? '' : 's'} recorded
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="px-4 py-3 text-left font-bold">Warehouse</th>
                  <th className="px-4 py-3 text-left font-bold">Commodity</th>
                  <th className="px-3 py-3 text-right font-bold text-emerald-800 bg-emerald-50/50">Inward Bags</th>
                  <th className="px-3 py-3 text-right font-bold text-emerald-800 bg-emerald-50/50">Inward Weight (MT)</th>
                  <th className="px-3 py-3 text-right font-bold text-orange-800 bg-orange-50/50">Outward Bags</th>
                  <th className="px-3 py-3 text-right font-bold text-orange-800 bg-orange-50/50">Outward Weight (MT)</th>
                  <th className="px-3 py-3 text-right font-black text-indigo-900 bg-indigo-50/60">Remaining Bags</th>
                  <th className="px-3 py-3 text-right font-black text-indigo-900 bg-indigo-50/60">Remaining Weight (MT)</th>
                  <th className="px-4 py-3 text-center font-bold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                      Loading inventory records...
                    </td>
                  </tr>
                ) : filteredBreakdown.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                      No inward or outward transactions recorded for this client.
                    </td>
                  </tr>
                ) : (
                  filteredBreakdown.map((item, idx) => {
                    const isItemCleared = item.remaining.weightMT <= 0 && item.remaining.bags <= 0;
                    return (
                      <tr key={`${item.warehouseId}-${item.commodityName}-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          <div>{item.warehouseName}</div>
                          {item.receiptNumbers && item.receiptNumbers.length > 0 && (
                            <div className="text-[10px] text-slate-400 font-mono mt-0.5 truncate max-w-[160px]" title={item.receiptNumbers.join(', ')}>
                              Ref: {item.receiptNumbers.slice(0, 2).join(', ')}{item.receiptNumbers.length > 2 ? ` +${item.receiptNumbers.length - 2}` : ''}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-800">
                          {item.commodityName}
                        </td>
                        <td className="px-3 py-3 text-right font-semibold text-slate-700 bg-emerald-50/30">
                          {formatBags(item.inward.bags)}
                        </td>
                        <td className="px-3 py-3 text-right font-semibold text-slate-700 bg-emerald-50/30">
                          {formatNumber(item.inward.weightMT, 2)} MT
                        </td>
                        <td className="px-3 py-3 text-right font-semibold text-slate-700 bg-orange-50/30">
                          {formatBags(item.outward.bags)}
                        </td>
                        <td className="px-3 py-3 text-right font-semibold text-slate-700 bg-orange-50/30">
                          {formatNumber(item.outward.weightMT, 2)} MT
                        </td>
                        <td className="px-3 py-3 text-right font-black text-indigo-700 bg-indigo-50/40">
                          {formatBags(item.remaining.bags)}
                        </td>
                        <td className="px-3 py-3 text-right font-black text-indigo-700 bg-indigo-50/40">
                          {formatNumber(item.remaining.weightMT, 2)} MT
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            !isItemCleared
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            {!isItemCleared ? (
                              <>
                                <CheckCircle2 className="h-3 w-3" />
                                In Stock
                              </>
                            ) : (
                              'Discharged'
                            )}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>

              {/* Total Footer */}
              {filteredBreakdown.length > 0 && (
                <tfoot className="bg-slate-100 border-t-2 border-slate-300 font-black text-slate-900">
                  <tr>
                    <td colSpan={2} className="px-4 py-3 text-left font-bold text-slate-800">
                      Total ({selectedWarehouseFilter === 'ALL' ? 'All Warehouses' : 'Selected Warehouse'})
                    </td>
                    <td className="px-3 py-3 text-right bg-emerald-100/50 text-emerald-950 font-bold">
                      {formatBags(activeMetrics.inward.bags)}
                    </td>
                    <td className="px-3 py-3 text-right bg-emerald-100/50 text-emerald-950 font-bold">
                      {formatNumber(activeMetrics.inward.weightMT, 2)} MT
                    </td>
                    <td className="px-3 py-3 text-right bg-orange-100/50 text-orange-950 font-bold">
                      {formatBags(activeMetrics.outward.bags)}
                    </td>
                    <td className="px-3 py-3 text-right bg-orange-100/50 text-orange-950 font-bold">
                      {formatNumber(activeMetrics.outward.weightMT, 2)} MT
                    </td>
                    <td className="px-3 py-3 text-right bg-indigo-100/60 text-indigo-950 font-black">
                      {formatBags(activeMetrics.remaining.bags)}
                    </td>
                    <td className="px-3 py-3 text-right bg-indigo-100/60 text-indigo-950 font-black">
                      {formatNumber(activeMetrics.remaining.weightMT, 2)} MT
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        !isCleared ? 'bg-emerald-600 text-white' : 'bg-slate-300 text-slate-700'
                      }`}>
                        {!isCleared ? 'Active' : 'Cleared'}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TotalRemainingStock;
