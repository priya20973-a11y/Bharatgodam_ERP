'use client';

import React, { useState, useMemo } from 'react';
import { Payment } from '@/lib/ledger-engine';
import { Plus, Calendar, DollarSign, Package, Trash } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface LineItem {
  id: string;
  description: string;
  amount: number;
  date: string;
  type: 'booking' | 'invoice';
}

interface PaymentHistoryProps {
  payments: Payment[];
  clientName: string;
  isLoading?: boolean;
  onPaymentAdded?: () => void;
  lineItems?: LineItem[];
}

export const PaymentHistory: React.FC<PaymentHistoryProps> = ({
  payments,
  clientName,
  isLoading = false,
  onPaymentAdded,
  lineItems = [],
}) => {
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null);
  const [selectedLineItem, setSelectedLineItem] = useState<string>('');
  const [formData, setFormData] = useState({
    amount: '',
    date: new Date().toISOString().split('T')[0],
  });

  // Auto-fill amount when line item is selected
  const handleLineItemSelect = (itemId: string) => {
    setSelectedLineItem(itemId);
    const item = lineItems.find(li => li.id === itemId);
    if (item) {
      setFormData(prev => ({
        ...prev,
        amount: item.amount.toString(),
        date: item.date || new Date().toISOString().split('T')[0],
      }));
    }
  };

  const handleAddPayment = async () => {
    if (!formData.amount || !formData.date) {
      toast.error('Please fill in all fields');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/reports/ledger', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clientName,
          amount: Number(formData.amount),
          date: formData.date,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to record payment');
      }

      toast.success('Payment recorded successfully');
      setFormData({ amount: '', date: new Date().toISOString().split('T')[0] });
      setShowAddPayment(false);
      onPaymentAdded?.();
    } catch (error) {
      console.error('Error recording payment:', error);
      toast.error('Failed to record payment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeletePayment = async (paymentId: string) => {
    if (!window.confirm('Do you want to remove this payment record?')) {
      return;
    }

    setDeletingPaymentId(paymentId);
    try {
      const response = await fetch(`/api/reports/ledger?paymentId=${encodeURIComponent(paymentId)}`, {
        method: 'DELETE',
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to remove payment');
      }

      toast.success('Payment record removed successfully');
      onPaymentAdded?.();
    } catch (error) {
      console.error('Error removing payment:', error);
      toast.error('Failed to remove payment');
    } finally {
      setDeletingPaymentId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-6 animate-pulse">
        <div className="h-8 bg-slate-200 rounded w-40 mb-6"></div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-slate-100 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-indigo-600" />
          Payment History
        </h3>
        <button
          type="button"
          onClick={() => setShowAddPayment(!showAddPayment)}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Payment
        </button>
      </div>

      {/* Add Payment Form */}
      {showAddPayment && (
        <div className="mb-6 p-4 bg-indigo-50 rounded-lg border border-indigo-200">
          {/* Line Item Selector */}
          {lineItems.length > 0 && (
            <div className="mb-4">
              <label className="block text-xs font-bold text-indigo-700 uppercase tracking-wider mb-2">
                Select Line Item (Optional)
              </label>
              <Select value={selectedLineItem} onValueChange={handleLineItemSelect}>
                <SelectTrigger className="w-full bg-white border-indigo-300 text-sm">
                  <SelectValue placeholder="Choose from existing invoices..." />
                </SelectTrigger>
                <SelectContent>
                  {lineItems.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      <div className="flex items-center gap-2">
                        <Package className="h-3 w-3" />
                        <span>{item.description}</span>
                        <span className="text-slate-500 text-xs">
                          - ₹{item.amount.toLocaleString('en-IN')}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedLineItem && (
                <div className="mt-2 p-2 bg-white rounded border border-indigo-200">
                  {(() => {
                    const item = lineItems.find(li => li.id === selectedLineItem);
                    return item ? (
                      <p className="text-xs text-indigo-700">
                        <strong>Selected:</strong> {item.description} ({item.type}) - <strong>₹{item.amount.toLocaleString('en-IN')}</strong> on {item.date}
                      </p>
                    ) : null;
                  })()}
                </div>
              )}
            </div>
          )}

          {/* Manual Entry Section */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-xs font-bold text-indigo-700 uppercase tracking-wider mb-2">
                Date
              </label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({...formData, date: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-indigo-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-indigo-700 uppercase tracking-wider mb-2">
                Amount (₹)
              </label>
              <input
                type="number"
                value={formData.amount}
                onChange={(e) => setFormData({...formData, amount: e.target.value})}
                placeholder="0.00"
                className="w-full px-3 py-2 rounded-lg border border-indigo-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={handleAddPayment}
                disabled={isSubmitting}
                className="flex-1 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {isSubmitting ? 'Recording...' : 'Record'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddPayment(false);
                  setSelectedLineItem('');
                  setFormData({ amount: '', date: new Date().toISOString().split('T')[0] });
                }}
                className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-semibold hover:border-slate-400 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payments List */}
      {payments.length === 0 ? (
        <div className="text-center py-8">
          <DollarSign className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No payments recorded yet</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Date</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-700">Amount</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Status</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-700">Action</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment, idx) => (
                <tr
                  key={idx}
                  className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${
                    idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'
                  }`}
                >
                  <td className="px-4 py-3 text-slate-700 flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-slate-400" />
                    {String(payment.date || '')}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">
                    ₹{payment.amount.toLocaleString('en-IN')}
                  </td>
                  <td className="px-4 py-3 text-left">
                    <span className="inline-block px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold">
                      Recorded
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => handleDeletePayment(payment._id)}
                      disabled={deletingPaymentId === payment._id}
                      className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      <Trash className="h-3.5 w-3.5 mr-1" />
                      {deletingPaymentId === payment._id ? 'Removing' : 'Remove'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 pt-4 border-t border-slate-200 text-right">
            <p className="text-slate-600 text-sm mb-2">
              Total Payments:
            </p>
            <p className="text-2xl font-black text-emerald-700">
              ₹{payments.reduce((sum, p) => sum + p.amount, 0).toLocaleString('en-IN')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentHistory;
