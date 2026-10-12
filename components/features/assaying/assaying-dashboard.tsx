'use client';

import React, { useState, useMemo, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  formatAssayingDate,
  getApprovalWindowDetails,
} from '@/lib/assaying-utils';
import { updateGradingDecision, getAssayingInwards } from '@/app/actions/assaying-actions';
import AssayingViewModal from './assaying-view-modal';
import AssayingDecisionModal from './assaying-decision-modal';
import { toast } from 'react-hot-toast';
import { useSession } from 'next-auth/react';
import {
  Search,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  FileCheck2,
  Award,
  AlertCircle,
  Calendar,
  User,
  Package,
  Printer,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';

interface AssayingDashboardProps {
  initialInwards: any[];
}

export default function AssayingDashboard({ initialInwards }: AssayingDashboardProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const [inwards, setInwards] = useState<any[]>(initialInwards);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setInwards(initialInwards);
  }, [initialInwards]);

  // Modal States
  const [viewInward, setViewInward] = useState<any | null>(null);
  const [decisionModal, setDecisionModal] = useState<{
    inward: any | null;
    decision: 'APPROVED' | 'REJECTED' | null;
  }>({
    inward: null,
    decision: null,
  });

  // Authorization check for current client session
  const role = session?.user && (session.user as any).role?.toString().toUpperCase();
  const isClientRole = role === 'FARMER' || role === 'FPO' || role === 'COMPANY';
  const isAuthorized = !isClientRole;

  // Refresh handler
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const refreshed = await getAssayingInwards();
      setInwards(refreshed);
      toast.success('Assaying records refreshed');
    } catch (err: any) {
      toast.error('Failed to refresh: ' + err.message);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Filtered inwards
  const filteredInwards = useMemo(() => {
    return inwards.filter((item) => {
      // 1. Status Filter
      const currentStatus = item.gradingStatus || 'PENDING';
      if (statusFilter !== 'ALL' && currentStatus !== statusFilter) {
        return false;
      }

      // 2. Search Query
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();

      const inwNo = (item.receiptNumber || '').toLowerCase();
      const lotNo = (item.lotNo || '').toLowerCase();
      const clientName = (item.client?.name || '').toLowerCase();
      const commodityName = (item.commodity?.name || '').toLowerCase();
      const assayerName = (item.assayer?.name || '').toLowerCase();
      const licence = (item.assayer?.licenceNumber || '').toLowerCase();

      return (
        inwNo.includes(q) ||
        lotNo.includes(q) ||
        clientName.includes(q) ||
        commodityName.includes(q) ||
        assayerName.includes(q) ||
        licence.includes(q)
      );
    });
  }, [inwards, searchQuery, statusFilter]);

  // Summary Counts
  const counts = useMemo(() => {
    const total = inwards.length;
    let approved = 0;
    let rejected = 0;
    let pending = 0;

    inwards.forEach((item) => {
      const st = item.gradingStatus || 'PENDING';
      if (st === 'APPROVED') approved++;
      else if (st === 'REJECTED') rejected++;
      else pending++;
    });

    return { total, approved, rejected, pending };
  }, [inwards]);

  // Decision Execution
  const handleConfirmDecision = async (
    remarks: string,
    selectedParameters?: { parameterName: string; observedValue: string; status?: string }[]
  ) => {
    if (!decisionModal.inward || !decisionModal.decision) return;

    const targetId = String(decisionModal.inward._id);
    const decision = decisionModal.decision;

    try {
      const res = await updateGradingDecision({
        inwardId: targetId,
        decision,
        remarks,
        parameters: selectedParameters,
        selectedParameters,
      });

      if (res.success) {
        toast.success(res.message);

        // Update local state immediately with string comparison
        setInwards((prev) =>
          prev.map((item) =>
            String(item._id) === targetId
              ? {
                  ...item,
                  gradingStatus: decision,
                  gradingDecisionDate: res.gradingDecisionDate,
                  gradingResults: res.gradingResults || item.gradingResults,
                  approvedGradingResults: res.approvedGradingResults || [],
                  gradingDecisionByName: session?.user?.name || session?.user?.email || 'Authorized Signatory',
                  gradingDecisionRemarks: remarks,
                }
              : item
          )
        );

        // If currently viewing this inward, update view modal state too
        setViewInward((prev: any) => {
          if (!prev || String(prev._id) !== targetId) return prev;
          return {
            ...prev,
            gradingStatus: decision,
            gradingDecisionDate: res.gradingDecisionDate,
            gradingResults: res.gradingResults || prev?.gradingResults,
            approvedGradingResults: res.approvedGradingResults || [],
            gradingDecisionByName: session?.user?.name || session?.user?.email || 'Authorized Signatory',
            gradingDecisionRemarks: remarks,
          };
        });

        // Close decision modal cleanly
        setDecisionModal({ inward: null, decision: null });

        startTransition(() => {
          router.refresh();
        });
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to update decision');
      throw err;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-indigo-100">
            <Award className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">
              Assaying / Grading
            </h1>
            <p className="text-slate-500 text-xs mt-0.5">
              Dry Storage quality inspection & approval workflow. Records are fetched from existing Inward entries with Assaying/Grading enabled.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="border-slate-300 bg-white hover:bg-slate-50 text-slate-700 shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh Data
          </Button>
        </div>
      </div>

      {/* KPI Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div
          onClick={() => setStatusFilter('ALL')}
          className={`p-4 rounded-xl border bg-white shadow-sm cursor-pointer transition-all ${
            statusFilter === 'ALL'
              ? 'border-indigo-500 ring-2 ring-indigo-100'
              : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Assayed</span>
            <FileCheck2 className="h-4 w-4 text-slate-400" />
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">{counts.total}</p>
          <span className="text-[11px] text-slate-400">All Assaying transactions</span>
        </div>

        <div
          onClick={() => setStatusFilter('APPROVED')}
          className={`p-4 rounded-xl border bg-white shadow-sm cursor-pointer transition-all ${
            statusFilter === 'APPROVED'
              ? 'border-emerald-500 ring-2 ring-emerald-100'
              : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Approved</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-black text-emerald-700 mt-2">{counts.approved}</p>
          <span className="text-[11px] text-emerald-600/80">Approved grading results</span>
        </div>

        <div
          onClick={() => setStatusFilter('PENDING')}
          className={`p-4 rounded-xl border bg-white shadow-sm cursor-pointer transition-all ${
            statusFilter === 'PENDING'
              ? 'border-amber-500 ring-2 ring-amber-100'
              : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">Pending Decision</span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <p className="text-2xl font-black text-amber-700 mt-2">{counts.pending}</p>
          <span className="text-[11px] text-amber-600/80">Awaiting approval / rejection</span>
        </div>

        <div
          onClick={() => setStatusFilter('REJECTED')}
          className={`p-4 rounded-xl border bg-white shadow-sm cursor-pointer transition-all ${
            statusFilter === 'REJECTED'
              ? 'border-red-500 ring-2 ring-red-100'
              : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-red-600 uppercase tracking-wider">Rejected</span>
            <XCircle className="h-4 w-4 text-red-500" />
          </div>
          <p className="text-2xl font-black text-red-700 mt-2">{counts.rejected}</p>
          <span className="text-[11px] text-red-600/80">Rejected grading reports</span>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Filter Toolbar */}
        <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 bg-slate-50/50">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search by Inward No, Lot No, Client, Commodity, Assayer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-white border-slate-300 text-xs h-10 shadow-sm"
            />
          </div>

          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((filterKey) => (
              <button
                key={filterKey}
                onClick={() => setStatusFilter(filterKey)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  statusFilter === filterKey
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                {filterKey === 'ALL'
                  ? 'All Records'
                  : filterKey === 'PENDING'
                  ? 'Pending'
                  : filterKey === 'APPROVED'
                  ? 'Approved'
                  : 'Rejected'}
              </button>
            ))}
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-100/80 text-slate-700 font-bold uppercase tracking-wider border-b border-slate-200 text-[11px]">
              <tr>
                <th className="px-5 py-3.5">Inw No / Lot No</th>
                <th className="px-4 py-3.5">Date</th>
                <th className="px-5 py-3.5">Client & Commodity</th>
                <th className="px-5 py-3.5">Assayer Details</th>
                <th className="px-4 py-3.5 text-center">View</th>
                <th className="px-5 py-3.5 text-center">Status / Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-800">
              {filteredInwards.length > 0 ? (
                filteredInwards.map((item) => {
                  const windowInfo = getApprovalWindowDetails(item.assayingDate);
                  const st = item.gradingStatus || 'PENDING';

                  return (
                    <tr key={item._id} className="hover:bg-slate-50/80 transition-colors">
                      {/* 1. Inw No / Lot No */}
                      <td className="px-5 py-4">
                        <div className="space-y-1">
                          <div className="font-black text-slate-900 text-sm">
                            {item.receiptNumber || 'N/A'}
                          </div>
                          {item.lotNo ? (
                            <div className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-semibold border border-slate-200">
                              Lot: {item.lotNo}
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[11px]">—</span>
                          )}
                        </div>
                      </td>

                      {/* 2. Date */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="font-semibold text-slate-800">
                          {formatAssayingDate(item.date)}
                        </div>
                        <span className="text-[10px] text-slate-400 block">Inward Date</span>
                      </td>

                      {/* Client & Commodity */}
                      <td className="px-5 py-4">
                        <div className="space-y-0.5">
                          <div className="font-bold text-slate-900">
                            {item.client?.name || '—'}
                          </div>
                          <div className="text-indigo-600 font-semibold flex items-center gap-1.5">
                            <Package className="w-3 h-3 text-indigo-500" />
                            {item.commodity?.name || '—'}
                            <span className="text-slate-400 font-normal">
                              ({Number(item.quantityMT).toFixed(2)} MT)
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Assayer Details */}
                      <td className="px-5 py-4">
                        <div className="space-y-0.5">
                          <div className="font-semibold text-slate-900">
                            {item.assayer?.name || '—'}
                          </div>
                          <div className="text-slate-500 text-[11px]">
                            {item.assayingDate ? (
                              <span>Assayed: {formatAssayingDate(item.assayingDate)}</span>
                            ) : (
                              <span className="text-amber-600">No assaying date</span>
                            )}
                          </div>
                          {item.assayer?.licenceNumber && (
                            <span className="text-[10px] text-slate-400 block">
                              Lic: {item.assayer.licenceNumber}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 3. View Button */}
                      <td className="px-4 py-4 text-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setViewInward(item)}
                          className="h-8 px-3 text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:text-indigo-800 font-semibold shadow-xs"
                          title="View complete inward & assaying details"
                        >
                          <Eye className="w-3.5 h-3.5 mr-1" />
                          View
                        </Button>
                      </td>

                      {/* 4. Status / Action */}
                      <td className="px-5 py-4">
                        <div className="flex flex-col items-center gap-2">
                          {/* Current Status Badge */}
                          <div className="flex items-center gap-1.5">
                            <Badge
                              className={`text-[10px] px-2 py-0.5 font-bold ${
                                st === 'APPROVED'
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                  : st === 'REJECTED'
                                  ? 'bg-red-100 text-red-800 border-red-300'
                                  : 'bg-amber-100 text-amber-800 border-amber-300'
                              }`}
                            >
                              {st === 'APPROVED' && <CheckCircle2 className="w-3 h-3 mr-1" />}
                              {st === 'REJECTED' && <XCircle className="w-3 h-3 mr-1" />}
                              {st === 'PENDING' && <Clock className="w-3 h-3 mr-1" />}
                              {st === 'APPROVED'
                                ? 'Approved'
                                : st === 'REJECTED'
                                ? 'Rejected'
                                : 'Pending'}
                            </Badge>
                          </div>

                          {/* Approval / Rejection Action Buttons */}
                          <div className="flex items-center gap-1.5">
                            <Button
                              size="sm"
                              disabled={!windowInfo.isOpen || !isAuthorized}
                              onClick={() => setDecisionModal({ inward: item, decision: 'APPROVED' })}
                              className={`h-7 px-2.5 text-[11px] font-bold ${
                                windowInfo.isOpen && isAuthorized
                                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                                  : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                              }`}
                              title={
                                !isAuthorized
                                  ? 'Unauthorized'
                                  : !windowInfo.isOpen
                                  ? windowInfo.reason
                                  : 'Approve Grading Record'
                              }
                            >
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              Approve
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!windowInfo.isOpen || !isAuthorized}
                              onClick={() => setDecisionModal({ inward: item, decision: 'REJECTED' })}
                              className={`h-7 px-2.5 text-[11px] font-bold ${
                                windowInfo.isOpen && isAuthorized
                                  ? 'border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700'
                                  : 'border-slate-200 text-slate-400 bg-slate-50 cursor-not-allowed'
                              }`}
                              title={
                                !isAuthorized
                                  ? 'Unauthorized'
                                  : !windowInfo.isOpen
                                  ? windowInfo.reason
                                  : 'Reject Grading Record'
                              }
                            >
                              <XCircle className="w-3 h-3 mr-1" />
                              Reject
                            </Button>
                          </div>

                          {/* Window Status Hint */}
                          <div className="text-[10px] text-center">
                            {windowInfo.isOpen ? (
                              <span className="text-emerald-700 font-medium">
                                Valid till {windowInfo.windowEndText} ({windowInfo.daysLeft}d left)
                              </span>
                            ) : windowInfo.status === 'BEFORE' ? (
                              <span className="text-amber-700 font-medium">
                                Opens on {windowInfo.windowStartText}
                              </span>
                            ) : (
                              <span className="text-slate-400">Window expired</span>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                        <AlertCircle className="h-6 w-6" />
                      </div>
                      <span className="font-semibold text-sm text-slate-700">
                        No Assaying / Grading records found
                      </span>
                      <p className="text-xs text-slate-400 max-w-sm">
                        {searchQuery
                          ? 'No results match your search query. Try clearing filters.'
                          : 'Inward transactions with "Assaying/Grading = Yes" will automatically appear here.'}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* View Complete Details Modal */}
      <AssayingViewModal
        inward={viewInward}
        isOpen={Boolean(viewInward)}
        onClose={() => setViewInward(null)}
        isAuthorized={isAuthorized}
        onApprove={(item) => {
          setViewInward(null);
          setDecisionModal({ inward: item, decision: 'APPROVED' });
        }}
        onReject={(item) => {
          setViewInward(null);
          setDecisionModal({ inward: item, decision: 'REJECTED' });
        }}
      />

      {/* Approve / Reject Confirmation Modal */}
      <AssayingDecisionModal
        inward={decisionModal.inward}
        decision={decisionModal.decision}
        isOpen={Boolean(decisionModal.inward && decisionModal.decision)}
        onClose={() => setDecisionModal({ inward: null, decision: null })}
        onConfirm={handleConfirmDecision}
      />
    </div>
  );
}
