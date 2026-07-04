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
  const [paymentInputs, setPaymentInputs] = useState<Record<string, string>>({});
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

  const isTransactionInvoiceId = (id: string) => {
    return /^[a-fA-F0-9]{24}-\d{4}-\d{2}(?:-[a-fA-F0-9]{24})?$/.test(id);
  };

  // Handle invoice export via HTML print preview
  const handleExportPDF = (invoice: any) => {
    const invoiceId = invoice.invoiceId || invoice.id;
    const warehouseQuery =
      invoice.warehouseId && invoiceId && !invoiceId.endsWith(`-${invoice.warehouseId}`)
        ? `&warehouseId=${encodeURIComponent(invoice.warehouseId)}`
        : '';
    const modeQuery = isTransactionInvoiceId(invoiceId) ? '&mode=transactions' : '';
    const url = `/api/invoice/html?id=${encodeURIComponent(invoiceId)}${warehouseQuery}${modeQuery}`;
    window.open(url, '_blank', 'noopener');
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

  // Handle cumulative payment updates with explicit input state and optimistic updates
  const handlePaymentUpdate = (id: string, additionalPayment: number) => {
    setPaymentErrors(prev => ({ ...prev, [id]: '' }));

    const invoice = invoices.find(inv => inv.id === id);
    if (!invoice) return;

    const totalAmount = invoice.totalAmount ?? invoice.amount ?? 0;
    const currentPaidAmount = invoice.paidAmount ?? 0;

    if (additionalPayment <= 0) {
      setPaymentErrors(prev => ({ ...prev, [id]: 'Enter a positive payment amount' }));
      return;
    }

    const newTotalPaid = currentPaidAmount + additionalPayment;
    if (newTotalPaid > totalAmount) {
      const remainingBalance = totalAmount - currentPaidAmount;
      setPaymentErrors(prev => ({
        ...prev,
        [id]: `Payment exceeds remaining balance of ₹${remainingBalance.toFixed(2)}`
      }));
      return;
    }

    const newPendingAmount = Math.max(0, totalAmount - newTotalPaid);
    let newStatus = 'UNPAID';
    if (newTotalPaid === 0) {
      newStatus = 'UNPAID';
    } else if (newPendingAmount === 0) {
      newStatus = 'PAID';
    } else {
      newStatus = 'PARTIALLY_PAID';
    }

    startTransition(async () => {
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
          setPaymentInputs(prev => ({ ...prev, [id]: '' }));
          toast.success(`Payment of ₹${additionalPayment.toFixed(2)} added successfully`);
        } else {
          setPaymentErrors(prev => ({ ...prev, [id]: result.message || 'Update failed' }));
          toast.error(result.message || 'Failed to update payment');
        }
      } catch (error) {
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
              <th className="px-6 py-4 font-semibold">Add Payment</th>
              <th className="px-6 py-4 font-semibold">Pending Amount</th>
              <th className="px-6 py-4 font-semibold">Payment Status</th>
              <th className="px-6 py-4 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {optimisticInvoices.length === 0 ? (
              <tr><td colSpan={8} className="px-6 py-8 text-center text-slate-500">No invoices found.</td></tr>
            ) : null}
            
            {optimisticInvoices.map((inv) => (
              <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4 font-medium text-slate-900">
                  #{(inv.invoiceId || inv.id).toString().substring(0, 8).toUpperCase()}
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
                <td className="px-6 py-4 font-medium text-slate-800">
                  {formatCurrency(inv.paidAmount ?? 0)}
                </td>

                {/* Add Payment Input Field with explicit button */}
                <td className="px-6 py-4">
                  <div className="flex flex-col gap-2">
                    <input
                      value={paymentInputs[inv.id] || ''}
                      onChange={(e) => setPaymentInputs(prev => ({ ...prev, [inv.id]: e.target.value }))}
                      type="number"
                      placeholder="₹0"
                      disabled={updatingPaymentId === inv.id || isPending}
                      className={`w-full px-3 py-2 text-sm border rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 ${
                        paymentErrors[inv.id] ? 'border-red-300 focus:ring-red-500' : 'border-slate-300'
                      }`}
                      min="0"
                      step="1"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const value = parseFloat(paymentInputs[inv.id] || '') || 0;
                        handlePaymentUpdate(inv.id, value);
                      }}
                      disabled={updatingPaymentId === inv.id || isPending}
                      className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      Add Payment
                    </button>
                    {paymentErrors[inv.id] && (
                      <div className="text-xs text-red-600 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {paymentErrors[inv.id]}
                      </div>
                    )}
                  </div>
                </td>

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
                  {/* HTML Preview Action */}
                  {isClient && (
                    <button
                      onClick={() => handleExportPDF(inv)}
                      className="inline-flex items-center justify-center px-4 py-2 border border-slate-300 shadow-sm text-sm font-medium rounded-md text-slate-700 bg-white hover:bg-slate-50 transition-colors"
                    >
                      <FileDown className="w-4 h-4 mr-2 text-indigo-500" />
                      Open Invoice
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
