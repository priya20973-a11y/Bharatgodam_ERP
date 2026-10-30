'use client';

import React from 'react';
import { format, parse } from 'date-fns';
import { LedgerStep } from '@/lib/ledger-engine';
import { Calendar, Package, TrendingUp } from 'lucide-react';

interface LedgerTableProps {
  steps: LedgerStep[];
  isLoading?: boolean;
}

function formatDecimal(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Format date string to DD/MM/YYYY
 * Handles both ISO date strings and potential date objects
 */
function formatDate(dateInput: string | Date | undefined): string {
  if (!dateInput) return '—';
  
  try {
    // If it's a string, assume ISO format (YYYY-MM-DD)
    if (typeof dateInput === 'string') {
      const date = parse(dateInput, 'yyyy-MM-dd', new Date());
      return format(date, 'dd/MM/yyyy');
    }
    
    // If it's already a Date object
    if (dateInput instanceof Date) {
      return format(dateInput, 'dd/MM/yyyy');
    }
    
    return '—';
  } catch (error) {
    console.warn('Date formatting error:', error, dateInput);
    return String(dateInput);
  }
}

export const LedgerTable: React.FC<LedgerTableProps> = ({ steps, isLoading = false }) => {
  if (isLoading) {
    return (
      <div className="w-full bg-white rounded-lg border border-slate-200 p-6 animate-pulse">
        <div className="h-10 bg-slate-200 rounded w-full mb-4"></div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-slate-100 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  if (steps.length === 0) {
    return (
      <div className="w-full bg-white rounded-lg border border-slate-200 p-12 text-center">
        <Package className="h-12 w-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500 font-medium">No ledger data available</p>
        <p className="text-slate-400 text-sm">Create or import transactions to generate ledger steps.</p>
      </div>
    );
  }

  return (
    <div className="w-full bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 text-left font-semibold text-slate-700 w-12">#</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Start Date</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">End Date</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-700">Days</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-700">Qty (MT)</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-700">Rate</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-700">Rent (₹)</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Transaction</th>
            </tr>
          </thead>
          <tbody>
            {steps.map((step, idx) => {
              // Explicitly destructure to avoid confusion
              const { 
                stepNo, 
                startDate, 
                endDate, 
                daysDifference, 
                quantityMT, 
                ratePerDayPerMT, 
                rentAmount, 
                transaction 
              } = step;

              return (
                <tr
                  key={idx}
                  className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${
                    idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'
                  }`}
                >
                  {/* Column 1: Step Number */}
                  <td className="px-4 py-3 font-semibold text-slate-900 text-center">
                    {stepNo}
                  </td>

                  {/* Column 2: Start Date */}
                  <td className="px-4 py-3 text-slate-700">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-slate-400 flex-shrink-0" />
                      <span className="font-mono text-sm">
                        {formatDate(startDate)}
                      </span>
                    </div>
                  </td>

                  {/* Column 3: End Date */}
                  <td className="px-4 py-3 text-slate-700">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-slate-400 flex-shrink-0" />
                      <span className="font-mono text-sm">
                        {formatDate(endDate)}
                      </span>
                    </div>
                  </td>

                  {/* Column 4: Days Difference */}
                  <td className="px-4 py-3 text-right font-mono text-slate-900">
                    {daysDifference}
                  </td>

                  {/* Column 5: Quantity in MT */}
                  <td className="px-4 py-3 text-right font-mono text-slate-900">
{typeof quantityMT === 'number' ? formatDecimal(quantityMT) : quantityMT}
                </td>

                {/* Column 6: Rate per Day per MT */}
                <td className="px-4 py-3 text-right font-mono text-slate-700">
                  ₹{typeof ratePerDayPerMT === 'number' ? formatDecimal(ratePerDayPerMT) : ratePerDayPerMT}/day/MT
                </td>

                {/* Column 7: Total Rent Amount */}
                <td className="px-4 py-3 text-right font-bold text-emerald-700">
                  ₹{typeof rentAmount === 'number' ? formatDecimal(rentAmount) : rentAmount}
                  </td>

                  {/* Column 8: Transaction Type */}
                  <td className="px-4 py-3 text-xs">
                    {transaction ? (
                      <div className="flex flex-col gap-1 items-start">
                        <span
                          className={`inline-block px-2 py-1 rounded font-semibold ${
                            transaction.direction === 'INWARD'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-orange-100 text-orange-700'
                          }`}
                        >
                          {transaction.direction}
                        </span>
                        {transaction.partyName && (
                          <span className="text-[10px] text-slate-500 font-medium">
                            Party: {transaction.partyName}
                          </span>
                        )}
                        {transaction.actualWeight !== undefined && (
                          <span className="text-[10px] text-slate-500 font-medium">
                            Actual: {formatDecimal(transaction.actualWeight)} MT
                          </span>
                        )}
                        {transaction.netWeightLoss !== undefined && (
                          <span className="text-[10px] text-slate-500 font-medium">
                            Loss: {formatDecimal(transaction.netWeightLoss)} MT
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Summary Row */}
      <div className="bg-slate-50 border-t border-slate-200 px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-emerald-600" />
          <span className="font-semibold text-slate-700">Total Days Stored:</span>
        </div>
        <span className="font-mono text-lg font-bold text-slate-900">
          {steps.reduce((sum, step) => sum + step.daysDifference, 0)} days
        </span>
      </div>
    </div>
  );
};

export default LedgerTable;
