'use client';

import React from 'react';
import { TimeStateLedgerSummary, TimeStatePeriod } from '@/lib/ledger-time-state-engine';
import { Calendar, TrendingDown, TrendingUp, AlertCircle } from 'lucide-react';

interface TimeStateLedgerTableProps {
  timeStateLedger?: TimeStateLedgerSummary;
  isLoading?: boolean;
}

const formatDecimal = (value: number) =>
  value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/**
 * TIME-STATE SYSTEM Ledger Display Component
 * Shows continuous time-state tracking with automatic period splitting
 * Displays: Period, Quantity, Status, Days, Rent, and Transaction notes
 */
export function TimeStateLedgerTable({ timeStateLedger, isLoading }: TimeStateLedgerTableProps) {

  if (isLoading) {
    return (
      <div className="w-full bg-white rounded-lg shadow p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-8 bg-gray-100 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!timeStateLedger || timeStateLedger.timeStatePeriods.length === 0) {
    return (
      <div className="w-full bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center h-32 text-gray-500">
          <p>No stock movements recorded yet</p>
        </div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'PARTIAL_REMOVAL':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'REMOVED':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'CLOSED':
        return 'bg-gray-100 text-gray-800 border-gray-300';
      default:
        return 'bg-blue-100 text-blue-800 border-blue-300';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <TrendingUp className="w-4 h-4" />;
      case 'REMOVED':
        return <TrendingDown className="w-4 h-4" />;
      case 'PARTIAL_REMOVAL':
        return <AlertCircle className="w-4 h-4" />;
      default:
        return <Calendar className="w-4 h-4" />;
    }
  };

  return (
    <div className="w-full bg-white rounded-lg shadow overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          TIME-STATE SYSTEM Ledger
        </h3>
        <p className="text-blue-100 text-sm mt-1">
          Continuous tracking showing {timeStateLedger.totalPeriods} periods with automatic splitting
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4 px-6 py-4 bg-gray-50 border-b">
        <div className="text-center">
          <p className="text-sm text-gray-600 font-medium">Total Periods</p>
          <p className="text-2xl font-bold text-gray-900">{timeStateLedger.totalPeriods}</p>
        </div>
        <div className="text-center">
          <p className="text-sm text-gray-600 font-medium">Total MT·Days</p>
          <p className="text-2xl font-bold text-gray-900">{formatDecimal(timeStateLedger.totalQuantityDays)}</p>
        </div>
        <div className="text-center">
          <p className="text-sm text-gray-600 font-medium">Total Rent (₹)</p>
          <p className="text-2xl font-bold text-green-600">₹{formatDecimal(timeStateLedger.totalRent)}</p>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 border-b">
            <tr>
              <th className="px-6 py-3 text-left font-semibold text-gray-700">#</th>
              <th className="px-6 py-3 text-left font-semibold text-gray-700">Period</th>
              <th className="px-6 py-3 text-center font-semibold text-gray-700">Quantity (MT)</th>
              <th className="px-6 py-3 text-center font-semibold text-gray-700">Days</th>
              <th className="px-6 py-3 text-center font-semibold text-gray-700">Rate</th>
              <th className="px-6 py-3 text-center font-semibold text-gray-700">Rent (₹)</th>
              <th className="px-6 py-3 text-left font-semibold text-gray-700">Status</th>
              <th className="px-6 py-3 text-left font-semibold text-gray-700">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {timeStateLedger.timeStatePeriods.map((period, index) => (
              <tr
                key={period.periodNo}
                className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
              >
                {/* Period Number */}
                <td className="px-6 py-4 text-gray-600 font-medium">{period.periodNo}</td>

                {/* Period Range */}
                <td className="px-6 py-4 font-medium text-gray-900">
                  {period.periodStartDate} → {period.periodEndDate}
                </td>

                {/* Quantity */}
                <td className="px-6 py-4 text-center font-semibold text-gray-900">
                  {formatDecimal(period.quantityMT)} MT
                </td>

                {/* Days */}
                <td className="px-6 py-4 text-center text-gray-700">
                  {period.daysInPeriod}
                </td>

                {/* Rate */}
                <td className="px-6 py-4 text-center text-gray-600">
                  ₹{formatDecimal(period.ratePerDayPerMT)}/day/MT
                </td>

                {/* Rent */}
                <td className="px-6 py-4 text-center font-semibold text-green-600">
                  ₹{formatDecimal(period.rentCalculated)}
                </td>

                {/* Status */}
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border font-medium ${getStatusColor(
                      period.status
                    )}`}
                  >
                    {getStatusIcon(period.status)}
                    {period.status}
                  </span>
                </td>

                {/* Notes/Reason for Change */}
                <td className="px-6 py-4 text-gray-600 text-xs">
                  {period.transaction ? (
                    <div className="space-y-1">
                      <p className="font-medium text-gray-900">
                        {period.transaction.direction}: {period.transaction.quantity} MT
                      </p>
                      <p className="text-gray-500">{period.transaction.date}</p>
                      <p className="text-gray-500">GP: {period.transaction.id.substring(0, 8)}</p>
                    </div>
                  ) : (
                    <span className="text-gray-400">Continuous Storage</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer Summary */}
      <div className="bg-gray-50 border-t px-6 py-4">
        <div className="flex items-center justify-between text-sm">
          <p className="text-gray-600">
            <strong>Calculation Method:</strong> TIME-STATE SYSTEM - Continuous period tracking with automatic splitting
          </p>
          <p className="text-gray-500">
            Calculated on: {timeStateLedger.calculationDate}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Simplified view for dashboard - shows only grouped continuous periods
 */
export function TimeStateLedgerSummaryView({ timeStateLedger }: { timeStateLedger?: TimeStateLedgerSummary }) {
  if (!timeStateLedger || timeStateLedger.timeStatePeriods.length === 0) {
    return null;
  }

  // Group consecutive periods with same quantity
  const grouped: Array<{
    startDate: string;
    endDate: string;
    quantityMT: number;
    status: string;
    dayCount: number;
    transactions: TimeStatePeriod['transaction'][];
  }> = [];

  let current: any = null;

  for (const period of timeStateLedger.timeStatePeriods) {
    if (
      current &&
      current.quantityMT === period.quantityMT &&
      current.status === period.status &&
      !period.transaction
    ) {
      // Extend current group
      current.endDate = period.periodEndDate;
      current.dayCount += period.daysInPeriod;
    } else {
      // Start new group
      if (current) {
        grouped.push(current);
      }
      current = {
        startDate: period.periodStartDate,
        endDate: period.periodEndDate,
        quantityMT: period.quantityMT,
        status: period.status,
        dayCount: period.daysInPeriod,
        transactions: period.transaction ? [period.transaction] : [],
      };
    }
  }
  if (current) {
    grouped.push(current);
  }

  return (
    <div className="space-y-3">
      {grouped.map((group, idx) => (
        <div
          key={idx}
          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
        >
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900">
              {group.startDate} → {group.endDate}
            </p>
            <p className="text-xs text-gray-600 mt-0.5">
              {formatDecimal(group.quantityMT)} MT for {group.dayCount} days
            </p>
          </div>
          <span className="text-xs font-semibold text-green-700">
            ₹{formatDecimal(group.quantityMT * 10 * group.dayCount)}
          </span>
        </div>
      ))}
    </div>
  );
}
