'use client';

import React from 'react';
import { Transaction } from '@/lib/ledger-engine';
import { ArrowDown, ArrowUp, Package, Calendar } from 'lucide-react';

interface TransactionTimelineProps {
  transactions: Transaction[];
  isLoading?: boolean;
}

interface CommodityTransactionTimelineProps {
  transactions: Transaction[];
  isLoading?: boolean;
}

function formatDecimal(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export const CommodityTransactionTimeline: React.FC<CommodityTransactionTimelineProps> = ({
  transactions,
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-6 animate-pulse">
        <div className="h-8 bg-slate-200 rounded w-48 mb-6"></div>
        <div className="space-y-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-4">
              <div className="h-6 bg-slate-200 rounded w-32"></div>
              <div className="space-y-3">
                {[1, 2].map((j) => (
                  <div key={j} className="h-16 bg-slate-100 rounded"></div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-12 text-center">
        <Package className="h-12 w-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500 font-medium">No transactions recorded</p>
      </div>
    );
  }

  // Group transactions by commodity
  const commodityGroups = transactions.reduce((groups, txn) => {
    const commodity = txn.commodityName || 'Unknown';
    if (!groups[commodity]) {
      groups[commodity] = [];
    }
    groups[commodity].push(txn);
    return groups;
  }, {} as Record<string, Transaction[]>);

  // Sort transactions within each commodity by date
  Object.keys(commodityGroups).forEach(commodity => {
    commodityGroups[commodity].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  });

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
      <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
        <Calendar className="h-5 w-5 text-indigo-600" />
        Commodity-wise Transaction Timeline
      </h3>

      <div className="space-y-8">
        {Object.entries(commodityGroups).map(([commodity, commodityTransactions]) => (
          <div key={commodity} className="border border-slate-100 rounded-lg p-4 bg-slate-50/50">
            <h4 className="text-md font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <Package className="h-4 w-4 text-slate-600" />
              {commodity}
              <span className="text-sm font-normal text-slate-500">
                ({commodityTransactions.length} transaction{commodityTransactions.length !== 1 ? 's' : ''})
              </span>
            </h4>

            <div className="space-y-3 ml-4">
              {commodityTransactions.map((txn, idx) => {
                const isInward = txn.direction === 'INWARD';
                const isLastItem = idx === commodityTransactions.length - 1;

                return (
                  <div key={txn._id} className="flex gap-4 relative">
                    {/* Timeline Line */}
                    {!isLastItem && (
                      <div className="absolute left-6 top-12 w-0.5 h-8 bg-slate-300"></div>
                    )}

                    {/* Icon */}
                    <div className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center font-bold text-white relative z-10 ${
                      isInward
                        ? 'bg-gradient-to-br from-emerald-500 to-green-600'
                        : 'bg-gradient-to-br from-orange-500 to-red-600'
                    }`}>
                      {isInward ? (
                        <ArrowDown className="h-4 w-4" />
                      ) : (
                        <ArrowUp className="h-4 w-4" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 py-1">
                      <div className="flex items-start justify-between mb-1">
                        <div>
                          <p className="text-sm font-bold text-slate-900">
                            {isInward ? '📥 Inward' : '📤 Outward'} - {txn.gatePass}
                          </p>
                          <p className="text-xs text-slate-600 mt-0.5">
                            Client: {txn.clientName}
                          </p>
                        </div>
                        <div className="flex flex-col items-end">
                          <span className={`text-sm font-bold px-2.5 py-1 rounded-full ${
                          isInward
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-orange-100 text-orange-700'
                        }`}>
                          {formatDecimal(txn.mt)} MT
                        </span>
                          {(txn as any).rentAmount !== undefined && (
                            <div className="text-xs text-slate-500 mt-1">Rent: ₹{formatDecimal((txn as any).rentAmount)} · Days: {(txn as any).rentDays ?? '—'}</div>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-slate-500 mt-2">
                        <span className="font-semibold">Date:</span> {txn.date}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const TransactionTimeline: React.FC<TransactionTimelineProps> = ({
  transactions,
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-6 animate-pulse">
        <div className="h-8 bg-slate-200 rounded w-32 mb-6"></div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-slate-100 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-12 text-center">
        <Package className="h-12 w-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500 font-medium">No transactions recorded</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
      <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
        <Package className="h-5 w-5 text-indigo-600" />
        Transaction Timeline
      </h3>

      <div className="space-y-4">
        {transactions.map((txn, idx) => {
          const isInward = txn.direction === 'INWARD';
          const isLastItem = idx === transactions.length - 1;

          return (
            <div key={txn._id} className="flex gap-4 relative">
              {/* Timeline Line */}
              {!isLastItem && (
                <div className="absolute left-6 top-12 w-0.5 h-12 bg-slate-200"></div>
              )}

              {/* Icon */}
              <div className={`flex-shrink-0 h-12 w-12 rounded-full flex items-center justify-center font-bold text-white relative z-10 ${
                isInward
                  ? 'bg-gradient-to-br from-emerald-500 to-green-600'
                  : 'bg-gradient-to-br from-orange-500 to-red-600'
              }`}>
                {isInward ? (
                  <ArrowDown className="h-5 w-5" />
                ) : (
                  <ArrowUp className="h-5 w-5" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 py-2">
                <div className="flex items-start justify-between mb-1">
                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      {isInward ? '📥 Inward' : '📤 Outward'} - {txn.gatePass}
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">{txn.commodityName}</p>
                  </div>
                      <div className="flex flex-col items-end">
                        <span className={`text-sm font-bold px-2.5 py-1 rounded-full ${
                          isInward
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-orange-100 text-orange-700'
                        }`}>
                          {formatDecimal(txn.mt)} MT
                        </span>
                        {(txn as any).rentAmount !== undefined && (
                          <div className="text-xs text-slate-500 mt-1">Rent: ₹{formatDecimal((txn as any).rentAmount)} · Days: {(txn as any).rentDays ?? '—'}</div>
                        )}
                      </div>
                </div>
                <p className="text-xs text-slate-500 mt-3">
                  <span className="font-semibold">Date:</span> {txn.date}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary Stats */}
      <div className="mt-8 pt-6 border-t border-slate-100 grid grid-cols-2 gap-4">
        <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-100">
          <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">
            Total Inward
          </p>
          <p className="text-2xl font-black text-emerald-900">
            {formatDecimal(
              transactions
                .filter((t) => t.direction === 'INWARD')
                .reduce((sum, t) => sum + t.mt, 0)
            )} MT
          </p>
        </div>
        <div className="bg-orange-50 rounded-lg p-4 border border-orange-100">
          <p className="text-xs font-bold text-orange-600 uppercase tracking-wider mb-1">
            Total Outward
          </p>
          <p className="text-2xl font-black text-orange-900">
            {formatDecimal(
              transactions
                .filter((t) => t.direction === 'OUTWARD')
                .reduce((sum, t) => sum + t.mt, 0)
            )} MT
          </p>
        </div>
      </div>
    </div>
  );
};

export default TransactionTimeline;
