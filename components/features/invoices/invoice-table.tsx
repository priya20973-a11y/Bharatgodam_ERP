'use client';

import React, { useState, useEffect, useOptimistic, useTransition } from 'react';
import { updateInvoiceStatus, updateInvoicePayment } from '@/app/actions/invoices';
import { FileDown, Package, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { formatCurrency } from '@/lib/utils/currency';

export default function InvoiceTable({ initialInvoices }: { initialInvoices: any[] }) {
  const [invoices, setInvoices] = useState(initialInvoices);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [updatingPaymentId, setUpdatingPaymentId] = useState<string | null>(null);
  const [paymentErrors, setPaymentErrors] = useState<Record<string, string>>({});
  const [paymentSuccessCount, setPaymentSuccessCount] = useState<Record<string, number>>({});
  const [isClient, setIsClient] = useState(false);

  // useTransition for optimistic updates
  const [isPending, startTransition] = useTransition();

  // useOptimistic for payment updates - initialized with server data
  const [optimisticInvoices, updateOptimisticInvoices] = useOptimistic(
    invoices,
    (state, { id, paidAmount, pendingAmount, status }: any) =>
      state.map((inv: any) =>
        inv.id === id ? { ...inv, paidAmount, pendingAmount, status } : inv
      )
  );

  useEffect(() => {
    setIsClient(true);
    // Sync invoices state with initial server data on mount/refresh
    setInvoices(initialInvoices);
  }, [initialInvoices]);

  // Handle invoice export via HTML print preview
  const handleExportPDF = (invoiceId: string) => {
    const url = `/api/invoice/html?id=${encodeURIComponent(invoiceId)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    toast.success('Invoice preview opened in a new tab');
  };

  // NEW: Optimistic UI Hook / Toggle Logic
  const handleStatusChange = async (id: string, newStatus: string) => {
    // 1. Mandatory Safeguard Confirmation
    if (!window.confirm(`Are you sure you want to change the status to ${newStatus}?`)) return;

    // 2. Optimistic Rendering: Instantly visually update before server finishes
    const previousInvoices = [...invoices];
    setInvoices(invoices.map(inv => inv.id === id ? { ...inv, status: newStatus } : inv));
    setUpdatingId(id);

    // 3. Database Execution
    try {
      const result = await updateInvoiceStatus(id, newStatus);
      if (result.success) {
        toast.success(`Invoice marked as ${newStatus}`);
      } else {
        toast.error('Failed to update. Reverting changes.');
        setInvoices(previousInvoices); // Revert UI if DB fails
      }
    } catch {
      toast.error('Network Error. Reverting changes.');
      setInvoices(previousInvoices);
    } finally {
      setUpdatingId(null);
    }
  };

  // Handle cumulative payment updates with Enter key trigger and useOptimistic
  const handlePaymentUpdate = (id: string, additionalPayment: number) => {
    // Clear any existing error for this invoice
    setPaymentErrors(prev => ({ ...prev, [id]: '' }));

    // Get the invoice to validate against total amount
    const invoice = invoices.find(inv => inv.id === id);
    if (!invoice) return;

    const totalAmount = invoice.totalAmount ?? invoice.amount ?? 0;
    const currentPaidAmount = invoice.paidAmount ?? 0;

    // Client-side validation: Additional payment cannot be negative
    if (additionalPayment < 0) {
      setPaymentErrors(prev => ({ ...prev, [id]: 'Payment amount cannot be negative' }));
      return;
    }

    // Calculate new total paid amount
    const newTotalPaid = currentPaidAmount + additionalPayment;

    // Client-side validation: New total paid cannot exceed total amount
    if (newTotalPaid > totalAmount) {
      const remainingBalance = totalAmount - currentPaidAmount;
      setPaymentErrors(prev => ({
        ...prev,
        [id]: `Payment exceeds remaining balance of ₹${remainingBalance.toFixed(2)}`
      }));
      return;
    }

    // Calculate new pending amount
    const newPendingAmount = Math.max(0, totalAmount - newTotalPaid);

    // Determine new status based on new amounts
    let newStatus = 'UNPAID';
    if (newTotalPaid === 0) {
      newStatus = 'UNPAID';
    } else if (newPendingAmount === 0) {
      newStatus = 'PAID';
    } else {
      newStatus = 'PARTIALLY_PAID';
    }

    // Wrap optimistic update and server action in startTransition
    startTransition(async () => {
      // Optimistic update using useOptimistic
      updateOptimisticInvoices({
        id,
        paidAmount: newTotalPaid,
        pendingAmount: newPendingAmount,
        status: newStatus
      });
      setUpdatingPaymentId(id);

      try {
        const result = await updateInvoicePayment(id, additionalPayment);
        if (result.success) {
          // Update the actual state with server response
          setInvoices(prev => prev.map(inv =>
            inv.id === id
              ? {
                  ...inv,
                  paidAmount: result.newPaidAmount,
                  pendingAmount: result.pendingAmount,
                  status: result.status
                }
              : inv
          ));
          // Increment success count to clear the input field
          setPaymentSuccessCount(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
          toast.success(`Payment of ₹${additionalPayment.toFixed(2)} added successfully`);
        } else {
          // Error handling - useOptimistic will automatically rollback
          setPaymentErrors(prev => ({ ...prev, [id]: result.message || 'Update failed' }));
          toast.error(result.message || 'Failed to update payment');
        }
      } catch (error) {
        // Error handling - useOptimistic will automatically rollback
        setPaymentErrors(prev => ({ ...prev, [id]: 'Network error occurred' }));
        toast.error('Network error occurred');
      } finally {
        setUpdatingPaymentId(null);
      }
    });
  };

  return (
    <div className="bg-white shadow-sm border border-slate-200 rounded-xl overflow-hidden mt-6">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50 text-slate-900 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 font-semibold">Invoice ID</th>
              <th className="px-6 py-4 font-semibold">Customer & Cargo</th>
              <th className="px-6 py-4 font-semibold">Total Amount</th>
              <th className="px-6 py-4 font-semibold">Paid Amount</th>
              <th className="px-6 py-4 font-semibold">Pending Amount</th>
              <th className="px-6 py-4 font-semibold">Payment Status</th>
              <th className="px-6 py-4 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {optimisticInvoices.length === 0 ? (
              <tr><td colSpan={7} className="px-6 py-8 text-center text-slate-500">No invoices found.</td></tr>
            ) : null}
            
            {optimisticInvoices.map((inv) => (
              <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4 font-medium text-slate-900">
                  #{inv.id.substring(0, 8).toUpperCase()}
                </td>
                <td className="px-6 py-4">
                  <div className="font-semibold text-slate-800">{inv.customerName || 'N/A'}</div>
                  <div className="text-xs text-slate-500 flex items-center mt-1">
                    <Package className="w-3 h-3 mr-1" /> {inv.commodity || 'General'}
                  </div>
                </td>
                <td className="px-6 py-4 font-medium text-emerald-700">
                  {formatCurrency(inv.totalAmount ?? inv.amount ?? 0)}
                </td>

                {/* Paid Amount Input Field - Clears after successful payment */}
                <td className="px-6 py-4">
                  <div className="relative">
                    <input
                      key={`payment-input-${inv.id}-${paymentSuccessCount[inv.id] || 0}`}
                      type="number"
                      defaultValue=""
                      placeholder="Enter payment"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const value = parseFloat(e.currentTarget.value) || 0;
                          if (value > 0) {
                            handlePaymentUpdate(inv.id, value);
                          }
                        }
                      }}
                      disabled={updatingPaymentId === inv.id || isPending}
                      className={`w-24 px-3 py-2 text-sm border rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 ${
                        paymentErrors[inv.id] ? 'border-red-300 focus:ring-red-500' : 'border-slate-300'
                      }`}
                      min="0"
                      step="0.01"
                    />
                    {(updatingPaymentId === inv.id || isPending) && (
                      <Loader2 className="w-4 h-4 text-slate-400 animate-spin absolute right-2 top-2.5" />
                    )}
                    {paymentErrors[inv.id] && (
                      <div className="absolute top-full mt-1 left-0 text-xs text-red-600 flex items-center">
                        <AlertCircle className="w-3 h-3 mr-1" />
                        {paymentErrors[inv.id]}
                      </div>
                    )}
                  </div>
                </td>

                {/* NEW: Pending Amount (Auto-calculated, Read-only) */}
                <td className="px-6 py-4 font-medium text-orange-700">
                  {formatCurrency(inv.pendingAmount ?? (inv.totalAmount ?? inv.amount ?? 0) - (inv.paidAmount ?? 0))}
                </td>
                
                {/* UPDATED: Enhanced Payment Status with Paid/Partial/Unpaid logic */}
                <td className="px-6 py-4">
                  <div className="flex items-center space-x-2">
                    <select
                      value={inv.status}
                      onChange={(e) => handleStatusChange(inv.id, e.target.value)}
                      disabled={updatingId === inv.id}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-full outline-none cursor-pointer border shadow-sm transition-all focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 appearance-none text-center
                        ${inv.status === 'PAID' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                          inv.status === 'PARTIALLY_PAID' ? 'bg-blue-50 text-blue-800 border-blue-200' :
                          'bg-orange-50 text-orange-800 border-orange-200'}
                      `}
                    >
                      <option value="UNPAID">🕒 UNPAID</option>
                      <option value="PARTIALLY_PAID">🔄 PARTIALLY_PAID</option>
                      <option value="PAID">✅ PAID</option>
                    </select>
                    
                    {updatingId === inv.id && (
                      <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                    )}
                  </div>
                </td>

                <td className="px-6 py-4 text-right space-x-3">
                  {/* PDF Download Action */}
                  {isClient && (
                    <button
                      onClick={() => handleExportPDF(inv.id)}
                      className="inline-flex items-center justify-center px-4 py-2 border border-slate-300 shadow-sm text-sm font-medium rounded-md text-slate-700 bg-white hover:bg-slate-50 transition-colors"
                    >
                      <FileDown className="w-4 h-4 mr-2 text-indigo-500" />
                      Export PDF
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
