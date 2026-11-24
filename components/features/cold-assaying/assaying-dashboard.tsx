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
import { updateColdGradingDecision, getColdAssayingInwards } from '@/app/actions/cold-assaying-actions';
import ColdAssayingViewModal from './assaying-view-modal';
import ColdAssayingDecisionModal from './assaying-decision-modal';
import AssignAssayerModal from './assign-assayer-modal';
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
  ShieldCheck,
} from 'lucide-react';

interface ColdAssayingDashboardProps {
  initialInwards: any[];
}

export default function ColdAssayingDashboard({ initialInwards }: ColdAssayingDashboardProps) {
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
  const [assignAssayerInward, setAssignAssayerInward] = useState<any | null>(null);
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
      const refreshed = await getColdAssayingInwards();
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
      const currentStatus = item.gradingStatus || 'PENDING';
      if (statusFilter !== 'ALL' && currentStatus !== statusFilter) {
        return false;
      }

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();

      const inwNo = (item.receiptNumber || '').toLowerCase();
      const lotNo = (item.lotNo || '').toLowerCase();
      const clientName = (item.client?.name || item.farmerName || '').toLowerCase();
      const farmerName = (item.farmerName || '').toLowerCase();
      const commodityName = (item.commodity?.name || '').toLowerCase();
      const assayerName = (item.assayer?.name || '').toLowerCase();
      const licence = (item.assayer?.licenceNumber || '').toLowerCase();
      const truckNo = (item.truckNo || '').toLowerCase();
      const slipNo = (item.weighbridgeSlipNo || '').toLowerCase();

      return (
        inwNo.includes(q) ||
        lotNo.includes(q) ||
        clientName.includes(q) ||
        farmerName.includes(q) ||
        commodityName.includes(q) ||
        assayerName.includes(q) ||
        licence.includes(q) ||
        truckNo.includes(q) ||
        slipNo.includes(q)
      );
    });
  }, [inwards, statusFilter, searchQuery]);

  // Statistics
  const stats = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let rejected = 0;

    inwards.forEach((item) => {
      const st = item.gradingStatus || 'PENDING';
      if (st === 'APPROVED') approved++;
      else if (st === 'REJECTED') rejected++;
      else pending++;
    });

    return { total: inwards.length, pending, approved, rejected };
  }, [inwards]);

  // Handle Decision Confirmation
  const handleDecisionConfirm = async (
    remarks: string,
    parameters?: { parameterName: string; observedValue: string; status?: string }[]
  ) => {
    if (!decisionModal.inward || !decisionModal.decision) return;

    try {
      const res = await updateColdGradingDecision({
        inwardId: decisionModal.inward._id,
        decision: decisionModal.decision,
        remarks,
        parameters,
      });

      if (res.success) {
        toast.success(res.message);
        // Optimistic update local state
        setInwards((prev) =>
          prev.map((item) => {
            if (item._id === decisionModal.inward._id) {
              return {
                ...item,
                gradingStatus: res.gradingStatus,
                gradingDecisionDate: res.gradingDecisionDate,
                gradingDecisionRemarks: remarks,
                gradingResults: res.gradingResults,
                approvedGradingResults: res.approvedGradingResults,
              };
            }
            return item;
          })
        );
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
    <div className="space-y-6">
      {/* Top Banner / Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-cyan-50 border border-cyan-100 text-cyan-700">
              <Award className="w-5 h-5" />
            </span>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Cold Storage Assaying & Grading</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Quality assessment and accredited laboratory grading records for Cold Storage inwards.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="border-slate-300 text-xs font-semibold gap-1.5 hover:bg-slate-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div
          onClick={() => setStatusFilter('ALL')}
          className={`cursor-pointer bg-white p-4 rounded-xl border transition-all ${
            statusFilter === 'ALL'
              ? 'border-cyan-500 ring-2 ring-cyan-100 shadow-md'
              : 'border-slate-200/80 hover:border-slate-300 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>Total Assayed</span>
            <FileCheck2 className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2">{stats.total}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Inwards with assaying required</div>
        </div>

        <div
          onClick={() => setStatusFilter('PENDING')}
          className={`cursor-pointer bg-white p-4 rounded-xl border transition-all ${
            statusFilter === 'PENDING'
              ? 'border-amber-500 ring-2 ring-amber-100 shadow-md'
              : 'border-slate-200/80 hover:border-slate-300 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between text-amber-700 text-xs font-semibold">
            <span>Pending Decisions</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-amber-900 mt-2">{stats.pending}</div>
          <div className="text-[11px] text-amber-600 mt-0.5">Awaiting 7-day review</div>
        </div>

        <div
          onClick={() => setStatusFilter('APPROVED')}
          className={`cursor-pointer bg-white p-4 rounded-xl border transition-all ${
            statusFilter === 'APPROVED'
              ? 'border-emerald-500 ring-2 ring-emerald-100 shadow-md'
              : 'border-slate-200/80 hover:border-slate-300 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between text-emerald-700 text-xs font-semibold">
            <span>Approved Records</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-emerald-900 mt-2">{stats.approved}</div>
          <div className="text-[11px] text-emerald-600 mt-0.5">Quality verified & approved</div>
        </div>

        <div
          onClick={() => setStatusFilter('REJECTED')}
          className={`cursor-pointer bg-white p-4 rounded-xl border transition-all ${
            statusFilter === 'REJECTED'
              ? 'border-red-500 ring-2 ring-red-100 shadow-md'
              : 'border-slate-200/80 hover:border-slate-300 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between text-red-700 text-xs font-semibold">
            <span>Rejected Records</span>
            <XCircle className="w-4 h-4 text-red-500" />
          </div>
          <div className="text-2xl font-black text-red-900 mt-2">{stats.rejected}</div>
          <div className="text-[11px] text-red-600 mt-0.5">Did not meet grading standards</div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {/* Table Filters & Search Bar */}
        <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              type="text"
              placeholder="Search by Receipt No, Lot, Client, Commodity, Assayer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs bg-white border-slate-300 rounded-xl"
            />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((filter) => (
              <Button
                key={filter}
                variant={statusFilter === filter ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setStatusFilter(filter)}
                className={`text-xs h-8 px-3 rounded-lg capitalize ${
                  statusFilter === filter ? 'bg-cyan-700 text-white' : 'text-slate-600'
                }`}
              >
                {filter.toLowerCase()}
              </Button>
            ))}
          </div>
        </div>

        {/* Transactions Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-100/70 text-slate-600 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Receipt / Lot No</th>
                <th className="py-3 px-4">Inward Date</th>
                <th className="py-3 px-4">Client</th>
                <th className="py-3 px-4">Commodity & Weight</th>
                <th className="py-3 px-4">Storage / Stacks</th>
                <th className="py-3 px-4">Assayer & Licence</th>
                <th className="py-3 px-4 text-center">Window Status</th>
                <th className="py-3 px-4 text-center">Grading Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredInwards.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <Award className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="font-semibold text-slate-600">No Cold Storage assaying records found.</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Ensure inward entries have "Assaying Required = Yes".
                    </p>
                  </td>
                </tr>
              ) : (
                filteredInwards.map((item) => {
                  const windowInfo = getApprovalWindowDetails(item.assayingDate);
                  const status = item.gradingStatus || 'PENDING';

                  return (
                    <tr key={item._id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Receipt & Lot */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{item.receiptNumber || 'N/A'}</div>
                        {item.lotNo && (
                          <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                            Lot: <span className="font-semibold text-slate-700">{item.lotNo}</span>
                          </div>
                        )}
                      </td>

                      {/* Inward Date */}
                      <td className="py-3 px-4 text-slate-700">
                        <div>{formatAssayingDate(item.date)}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Assayed: {formatAssayingDate(item.assayingDate)}
                        </div>
                      </td>

                      {/* Client */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-800">{item.client?.name || '—'}</div>
                        {item.client?.phone && (
                          <div className="text-[11px] text-slate-400 mt-0.5">{item.client.phone}</div>
                        )}
                      </td>

                      {/* Commodity & Weight */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{item.commodity?.name || '—'}</div>
                        <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                          {item.quantityKg?.toLocaleString('en-IN')} {item.unit || 'Kg'} ({item.bagsCount} Bags)
                        </div>
                      </td>

                      {/* Storage / Stacks */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-800">{item.warehouse?.name || 'Cold Warehouse'}</div>
                        {item.stackAllocations && item.stackAllocations.length > 0 && (
                          <div className="text-[11px] text-slate-500 mt-0.5 truncate max-w-[150px]" title={item.stackAllocations.map((s: any) => `Ch: ${s.chamberName || s.chamberNo} Fl: ${s.floorNo} Stk: ${s.stackNo}`).join(', ')}>
                            {item.stackAllocations.map((s: any) => `Ch ${s.chamberName || s.chamberNo} F${s.floorNo} S${s.stackNo}`).join(', ')}
                          </div>
                        )}
                      </td>

                      {/* Assayer & Licence */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-800">{item.assayer?.name || '—'}</div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                          Lic: {item.assayer?.licenceNumber || '—'}
                        </div>
                      </td>

                      {/* Window Status */}
                      <td className="py-3 px-4 text-center">
                        <Badge
                          variant={windowInfo.isOpen ? 'default' : 'secondary'}
                          className={`text-[10px] uppercase font-bold tracking-wider ${
                            windowInfo.isOpen ? 'bg-cyan-600 hover:bg-cyan-700 text-white' : 'text-slate-500'
                          }`}
                        >
                          {windowInfo.isOpen ? `${windowInfo.daysLeft}d Left` : windowInfo.status}
                        </Badge>
                      </td>

                      {/* Grading Status */}
                      <td className="py-3 px-4 text-center">
                        <Badge
                          className={`text-[11px] font-semibold border ${
                            status === 'APPROVED'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : status === 'REJECTED'
                              ? 'bg-red-50 text-red-800 border-red-200'
                              : 'bg-amber-50 text-amber-800 border-amber-200'
                          }`}
                        >
                          {status === 'APPROVED' && <CheckCircle2 className="w-3 h-3 mr-1 inline" />}
                          {status === 'REJECTED' && <XCircle className="w-3 h-3 mr-1 inline" />}
                          {status === 'PENDING' && <Clock className="w-3 h-3 mr-1 inline" />}
                          {status === 'APPROVED' ? 'Approved' : status === 'REJECTED' ? 'Rejected' : 'Pending'}
                        </Badge>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setViewInward(item)}
                            className="h-8 px-2 text-cyan-700 hover:bg-cyan-50 hover:text-cyan-800 font-medium text-xs"
                          >
                            <Eye className="w-3.5 h-3.5 mr-1" />
                            View
                          </Button>

                          {isAuthorized && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setAssignAssayerInward(item)}
                                className="h-8 px-2 text-cyan-800 hover:bg-cyan-50 font-medium text-xs"
                                title="Assign or change accredited assayer"
                              >
                                <ShieldCheck className="w-3.5 h-3.5 mr-1 text-cyan-600" />
                                {item.assayer?.name ? 'Change Assayer' : 'Assign Assayer'}
                              </Button>

                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setDecisionModal({
                                    inward: item,
                                    decision: 'APPROVED',
                                  })
                                }
                                disabled={!windowInfo.isOpen}
                                className="h-8 px-2 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                                Approve
                              </Button>

                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setDecisionModal({
                                    inward: item,
                                    decision: 'REJECTED',
                                  })
                                }
                                disabled={!windowInfo.isOpen}
                                className="h-8 px-2 text-xs border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-40"
                              >
                                <XCircle className="w-3.5 h-3.5 mr-1" />
                                Reject
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* View Details Modal */}
      <ColdAssayingViewModal
        inward={viewInward}
        isOpen={Boolean(viewInward)}
        onClose={() => setViewInward(null)}
        isAuthorized={isAuthorized}
        onAssignAssayer={(inw) => setAssignAssayerInward(inw)}
        onApprove={(inw) =>
          setDecisionModal({
            inward: inw,
            decision: 'APPROVED',
          })
        }
        onReject={(inw) =>
          setDecisionModal({
            inward: inw,
            decision: 'REJECTED',
          })
        }
      />

      {/* Decision Action Modal */}
      <ColdAssayingDecisionModal
        inward={decisionModal.inward}
        decision={decisionModal.decision}
        isOpen={Boolean(decisionModal.inward && decisionModal.decision)}
        onClose={() => setDecisionModal({ inward: null, decision: null })}
        onConfirm={handleDecisionConfirm}
      />

      {/* Assign Assayer Modal */}
      <AssignAssayerModal
        inward={assignAssayerInward}
        isOpen={Boolean(assignAssayerInward)}
        onClose={() => setAssignAssayerInward(null)}
        onAssigned={(updated) => {
          setInwards((prev) =>
            prev.map((item) => {
              if (item._id === updated.inwardId) {
                return {
                  ...item,
                  assayer: updated.assayer,
                  assayingDate: updated.assayingDate || item.assayingDate,
                  assayingExpiryDate: updated.assayingExpiryDate || item.assayingExpiryDate,
                };
              }
              return item;
            })
          );
          startTransition(() => {
            router.refresh();
          });
        }}
      />
    </div>
  );
}
