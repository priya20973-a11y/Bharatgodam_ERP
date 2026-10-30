'use client';

import React from 'react';
import { TrendingUp, AlertCircle, CheckCircle2 } from 'lucide-react';

const roundCurrency = (value: number) => Math.round(value * 100) / 100;

interface InvoiceSummaryProps {
  totalRent: number;
  totalPaid: number;
  totalBalance: number;
  additionalCharges?: number;
  showInvoiceAdjustments?: boolean;
  isLoading?: boolean;
}

export const InvoiceSummary: React.FC<InvoiceSummaryProps> = ({
  totalRent,
  totalPaid,
  totalBalance,
  additionalCharges = 0,
  showInvoiceAdjustments = false,
  isLoading = false,
}) => {
  const balanceStatus =
    totalBalance > 0 ? 'outstanding' : totalBalance < 0 ? 'overpaid' : 'settled';

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-lg border border-slate-200 p-6 h-32"></div>
        ))}
      </div>
    );
  }

  const displayTotal = showInvoiceAdjustments ? roundCurrency(totalRent + additionalCharges) : totalRent;
  const totalLabel = showInvoiceAdjustments ? 'Total Monthly Charges' : 'Total Rent';

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Total Rent Card */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-indigo-200 p-6 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-600 mb-1">
              {totalLabel}
            </p>
            <p className="text-3xl font-black text-indigo-900">
              ₹{displayTotal.toLocaleString('en-IN')}
            </p>
          </div>
          <div className="h-10 w-10 rounded-lg bg-indigo-200 flex items-center justify-center">
            <TrendingUp className="h-5 w-5 text-indigo-600" />
          </div>
        </div>
        <p className="text-xs text-indigo-700">
          {showInvoiceAdjustments ? 'Rent plus invoice adjustments for the period' : 'Storage rent for the period'}
        </p>
      </div>

      {/* Total Paid Card */}
      <div className="bg-gradient-to-br from-emerald-50 to-green-50 rounded-lg border border-emerald-200 p-6 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-600 mb-1">
              Total Paid
            </p>
            <p className="text-3xl font-black text-emerald-900">
              ₹{totalPaid.toLocaleString('en-IN')}
            </p>
          </div>
          <div className="h-10 w-10 rounded-lg bg-emerald-200 flex items-center justify-center">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          </div>
        </div>
        <p className="text-xs text-emerald-700">Amount received/recorded</p>
      </div>

      {/* Balance Card */}
      <div
        className={`rounded-lg border p-6 shadow-sm hover:shadow-md transition-shadow ${
          balanceStatus === 'outstanding'
            ? 'bg-gradient-to-br from-orange-50 to-red-50 border-orange-200'
            : balanceStatus === 'overpaid'
            ? 'bg-gradient-to-br from-purple-50 to-violet-50 border-purple-200'
            : 'bg-gradient-to-br from-teal-50 to-cyan-50 border-teal-200'
        }`}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className={`text-xs font-bold uppercase tracking-widest mb-1 ${
              balanceStatus === 'outstanding'
                ? 'text-orange-600'
                : balanceStatus === 'overpaid'
                ? 'text-purple-600'
                : 'text-teal-600'
            }`}>
              {balanceStatus === 'outstanding'
                ? 'Outstanding Balance'
                : balanceStatus === 'overpaid'
                ? 'Overpaid Amount'
                : 'Settled'}
            </p>
            <p className={`text-3xl font-black ${
              balanceStatus === 'outstanding'
                ? 'text-orange-900'
                : balanceStatus === 'overpaid'
                ? 'text-purple-900'
                : 'text-teal-900'
            }`}>
              ₹{Math.abs(totalBalance).toLocaleString('en-IN')}
            </p>
          </div>
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
            balanceStatus === 'outstanding'
              ? 'bg-orange-200'
              : balanceStatus === 'overpaid'
              ? 'bg-purple-200'
              : 'bg-teal-200'
          }`}>
            <AlertCircle className={`h-5 w-5 ${
              balanceStatus === 'outstanding'
                ? 'text-orange-600'
                : balanceStatus === 'overpaid'
                ? 'text-purple-600'
                : 'text-teal-600'
            }`} />
          </div>
        </div>
        <p className={`text-xs ${
          balanceStatus === 'outstanding'
            ? 'text-orange-700'
            : balanceStatus === 'overpaid'
            ? 'text-purple-700'
            : 'text-teal-700'
        }`}>
          {balanceStatus === 'outstanding'
            ? 'Amount due from client'
            : balanceStatus === 'overpaid'
            ? 'Credit to be adjusted'
            : 'All payments settled'}
        </p>
      </div>
    </div>
  );
};

export default InvoiceSummary;
