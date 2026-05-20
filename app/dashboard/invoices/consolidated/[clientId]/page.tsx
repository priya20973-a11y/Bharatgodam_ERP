import { notFound } from 'next/navigation';
import { getUnifiedFinancials } from '@/app/actions/invoices';
import { InvoiceSummary } from '@/components/features/ledger/invoice-summary';
import { LedgerTable } from '@/components/features/ledger/ledger-table';
import { PaymentHistory } from '@/components/features/ledger/payment-history';
import { ArrowLeft, ClipboardList, Layers, DollarSign } from 'lucide-react';
import Link from 'next/link';

interface ConsolidatedInvoicePageProps {
  params: Promise<{ clientId: string }>;
}

export const metadata = {
  title: 'Consolidated Statement | Warehouse Logistics',
};

export default async function ConsolidatedInvoicePage({ params }: ConsolidatedInvoicePageProps) {
  const { clientId } = await params;
  if (!clientId) {
    notFound();
  }

  const unifiedResult = await getUnifiedFinancials(clientId);
  if (!unifiedResult.success || !unifiedResult.data) {
    notFound();
  }

  const { clientName, bookings, payments, ledgerSummary } = unifiedResult.data;

  const totalBookings = bookings.length;
  const totalPayments = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const totalRent = ledgerSummary.totalRent;
  const totalPaid = ledgerSummary.rentPaid ?? ledgerSummary.totalPaid;
  const totalBalance = ledgerSummary.rentPaid !== undefined
    ? Math.max(ledgerSummary.totalRent - ledgerSummary.rentPaid, 0)
    : ledgerSummary.balance;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <Link
              href="/dashboard/invoices"
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-900"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to invoices
            </Link>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900">
              Consolidated Statement for Client: {clientName}
            </h1>
            <p className="text-sm text-slate-500">
              Aggregated across all bookings and payments under Client ID <code>{clientId}</code>.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Bookings</p>
              <p className="mt-3 text-2xl font-semibold text-slate-900">{totalBookings}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Total Rent</p>
              <p className="mt-3 text-2xl font-semibold text-indigo-900">₹{totalRent.toLocaleString('en-IN')}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Payments</p>
              <p className="mt-3 text-2xl font-semibold text-emerald-900">₹{totalPayments.toLocaleString('en-IN')}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Balance</p>
              <p className="mt-3 text-2xl font-semibold text-orange-900">₹{totalBalance.toLocaleString('en-IN')}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3 text-slate-900 mb-4">
                <ClipboardList className="w-5 h-5 text-slate-600" />
                <h2 className="text-lg font-semibold">Invoice Summary</h2>
              </div>
              <InvoiceSummary
                totalRent={ledgerSummary.totalRent}
                totalPaid={totalPaid}
                totalBalance={totalBalance}
              />
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3 text-slate-900 mb-4">
                <Layers className="w-5 h-5 text-slate-600" />
                <h2 className="text-lg font-semibold">Booking Coverage</h2>
              </div>
              <div className="space-y-3 text-sm text-slate-700">
                {bookings.length === 0 ? (
                  <p>No bookings are linked to this account yet.</p>
                ) : (
                  bookings.map((booking) => (
                    <div key={booking._id?.toString() || String(booking.date || '')} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      <p className="font-semibold text-slate-900">{booking.commodityName || 'Unknown Commodity'}</p>
                      <p className="text-slate-600">Date: {String(booking.date || '')}</p>
                      <p className="text-slate-600">Qty: {booking.mt} MT</p>
                      <p className="text-slate-600">Direction: {booking.direction}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3 text-slate-900 mb-4">
                <DollarSign className="w-5 h-5 text-slate-600" />
                <h2 className="text-lg font-semibold">Payment History</h2>
              </div>
              <PaymentHistory payments={payments} clientName={clientName} />
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Consolidated Ledger</h2>
              <LedgerTable steps={ledgerSummary.ledgerSteps} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
