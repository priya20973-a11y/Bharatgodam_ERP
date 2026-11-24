'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  formatAssayingDate,
  formatAssayingDateTime,
  getApprovalWindowDetails,
} from '@/lib/assaying-utils';
import {
  FileText,
  Calendar,
  User,
  Package,
  Clock,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Truck,
  Building,
  Printer,
  AlertTriangle,
  Info,
  Grid,
} from 'lucide-react';

interface ColdAssayingViewModalProps {
  inward: any | null;
  isOpen: boolean;
  onClose: () => void;
  onApprove?: (inward: any) => void;
  onReject?: (inward: any) => void;
  onAssignAssayer?: (inward: any) => void;
  isAuthorized?: boolean;
}

export default function ColdAssayingViewModal({
  inward,
  isOpen,
  onClose,
  onApprove,
  onReject,
  onAssignAssayer,
  isAuthorized = true,
}: ColdAssayingViewModalProps) {
  if (!inward) return null;

  const windowInfo = getApprovalWindowDetails(inward.assayingDate);
  const status = inward.gradingStatus || 'PENDING';

  const handleOpenReceipt = () => {
    window.open(`/api/cold/receipt/html?id=${inward._id}`, '_blank');
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0 rounded-2xl bg-slate-50 border border-slate-200 shadow-2xl">
        {/* Modal Header */}
        <div className="bg-white p-6 border-b border-slate-200 sticky top-0 z-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-cyan-50 border border-cyan-100 flex items-center justify-center text-cyan-700">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
                    Cold Storage Inward Grading Details
                    <Badge
                      className={
                        status === 'APPROVED'
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : status === 'REJECTED'
                          ? 'bg-red-100 text-red-800 border-red-300'
                          : 'bg-amber-100 text-amber-800 border-amber-300'
                      }
                    >
                      {status === 'APPROVED' && <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
                      {status === 'REJECTED' && <XCircle className="w-3.5 h-3.5 mr-1" />}
                      {status === 'PENDING' && <Clock className="w-3.5 h-3.5 mr-1" />}
                      {status === 'APPROVED' ? 'Approved' : status === 'REJECTED' ? 'Rejected' : 'Pending Decision'}
                    </Badge>
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-500 mt-0.5">
                    Receipt: <span className="font-semibold text-slate-800">{inward.receiptNumber || 'N/A'}</span>
                    {inward.lotNo && <> • Lot No: <span className="font-semibold text-slate-800">{inward.lotNo}</span></>}
                  </DialogDescription>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenReceipt}
                className="text-xs font-semibold gap-1.5 border-slate-300 hover:bg-slate-100 text-slate-700"
              >
                <Printer className="w-3.5 h-3.5" />
                View Receipt
              </Button>
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6">
          {/* Approval Window Status Alert */}
          <div
            className={`p-4 rounded-xl border flex items-start gap-3 ${
              windowInfo.isOpen
                ? 'bg-cyan-50/60 border-cyan-200 text-cyan-900'
                : 'bg-amber-50/80 border-amber-200 text-amber-900'
            }`}
          >
            {windowInfo.isOpen ? (
              <Info className="w-5 h-5 text-cyan-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            )}
            <div className="text-xs flex-1">
              <div className="font-bold mb-0.5 flex items-center justify-between">
                <span>Decision Window Status: {windowInfo.isOpen ? 'Active' : 'Closed / Locked'}</span>
                <Badge
                  variant={windowInfo.isOpen ? 'default' : 'secondary'}
                  className={windowInfo.isOpen ? 'bg-cyan-600 text-white' : ''}
                >
                  {windowInfo.isOpen ? `${windowInfo.daysLeft} Day(s) Remaining` : windowInfo.status}
                </Badge>
              </div>
              <p className="text-slate-600">
                {windowInfo.isOpen
                  ? `Window is open from ${windowInfo.windowStartText} through ${windowInfo.windowEndText} (7 calendar days). Decisions can be updated by authorized personnel.`
                  : windowInfo.reason}
              </p>
            </div>
          </div>

          {/* Quick Info Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Client Info */}
            <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <User className="w-3.5 h-3.5 text-cyan-600" />
                Client Details
              </div>
              <div>
                <div className="font-bold text-slate-900 text-sm">{inward.client?.name || 'Unknown Client'}</div>
                <div className="text-xs text-slate-500">{inward.client?.phone || 'No phone'}</div>
                <div className="text-xs text-slate-500 truncate mt-1">{inward.client?.address || 'No address'}</div>
              </div>
            </div>

            {/* Commodity Info */}
            <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <Package className="w-3.5 h-3.5 text-cyan-600" />
                Commodity & Quantity
              </div>
              <div>
                <div className="font-bold text-slate-900 text-sm">
                  {inward.commodity?.name || 'Unknown'} {inward.commodity?.type ? `(${inward.commodity.type})` : ''}
                </div>
                <div className="text-xs text-slate-600 font-semibold mt-0.5">
                  Weight: {inward.quantityKg.toLocaleString('en-IN')} {inward.unit || 'Kg'} • Bags: {inward.bagsCount}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Inward Date: {formatAssayingDate(inward.date)}
                </div>
              </div>
            </div>

            {/* Warehouse Info */}
            <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <Building className="w-3.5 h-3.5 text-cyan-600" />
                Storage Location
              </div>
              <div>
                <div className="font-bold text-slate-900 text-sm">{inward.warehouse?.name || 'Cold Warehouse'}</div>
                <div className="text-xs text-slate-500">{inward.warehouse?.location || inward.warehouse?.warehouseId || '—'}</div>
                {inward.stackAllocations && inward.stackAllocations.length > 0 && (
                  <div className="text-xs text-slate-600 mt-1 flex flex-wrap gap-1">
                    {inward.stackAllocations.map((sa: any, sIdx: number) => (
                      <span key={sIdx} className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px] font-medium">
                        Ch: {sa.chamberName || sa.chamberNo} / Fl: {sa.floorNo} / Stk: {sa.stackNo}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Assaying & Accreditation Card */}
          <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b pb-3 border-slate-100">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-cyan-700" />
                <h3 className="font-bold text-sm text-slate-800">Assayer & Accreditation Information</h3>
              </div>
              <div className="flex items-center gap-2">
                {isAuthorized && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onClose();
                      onAssignAssayer?.(inward);
                    }}
                    className="text-xs h-7 px-2.5 border-slate-300 text-cyan-700 hover:bg-cyan-50 font-medium"
                  >
                    {inward.assayer?.name ? 'Change Assayer' : 'Assign Assayer'}
                  </Button>
                )}
                <Badge variant="outline" className="bg-slate-50 text-slate-600 text-xs">
                  Accredited Agency
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-slate-500 block font-medium">Assayer Name:</span>
                <span className="font-bold text-slate-900 text-sm mt-0.5 block">
                  {inward.assayer?.name || '—'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block font-medium">Licence Number:</span>
                <span className="font-semibold text-slate-800 mt-0.5 block">
                  {inward.assayer?.licenceNumber || '—'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block font-medium">Assaying Date:</span>
                <span className="font-semibold text-slate-800 mt-0.5 block">
                  {formatAssayingDate(inward.assayingDate)}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block font-medium">Stock Expiry Date:</span>
                <span className="font-semibold text-emerald-700 mt-0.5 block">
                  {formatAssayingDate(inward.assayingExpiryDate)}
                </span>
              </div>
            </div>
          </div>

          {/* Grading Parameters Results Table */}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-cyan-700" />
                <h3 className="font-bold text-sm text-slate-900">Grading Results & Quality Parameters</h3>
              </div>
              <span className="text-xs text-slate-500">
                {inward.gradingResults?.length || 0} parameter(s) evaluated
              </span>
            </div>

            {(!inward.gradingResults || inward.gradingResults.length === 0) ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                No grading results were recorded for this transaction.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100/60 text-slate-600 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-4">#</th>
                      <th className="py-2.5 px-4">Parameter Name</th>
                      <th className="py-2.5 px-4">Observed Value</th>
                      <th className="py-2.5 px-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {inward.gradingResults.map((param: any, idx: number) => {
                      const isPass =
                        param.status === 'OK' ||
                        param.status === 'Pass' ||
                        param.status === 'PASS';
                      const isLow = param.status === 'LOW' || param.status === 'Low';
                      const isHigh = param.status === 'HIGH' || param.status === 'High';
                      const isFail = param.status === 'Fail' || param.status === 'FAIL';
                      return (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-2.5 px-4 text-slate-400 font-mono">{idx + 1}</td>
                          <td className="py-2.5 px-4 font-semibold text-slate-800">{param.parameterName}</td>
                          <td className="py-2.5 px-4 text-slate-900 font-mono text-sm">{param.observedValue || '—'}</td>
                          <td className="py-2.5 px-4 text-center">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                                isPass
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                  : isLow
                                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                  : isHigh
                                  ? 'bg-orange-100 text-orange-800 border border-orange-300'
                                  : isFail
                                  ? 'bg-red-100 text-red-800 border border-red-300'
                                  : param.status
                                  ? 'bg-cyan-100 text-cyan-800 border border-cyan-300'
                                  : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {param.status || 'Recorded'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Decision Audit Trail */}
          {status !== 'PENDING' && (
            <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm space-y-3">
              <div className="flex items-center gap-2 border-b pb-2 border-slate-100">
                <Clock className="w-4 h-4 text-slate-500" />
                <h3 className="font-bold text-xs uppercase tracking-wider text-slate-600">Decision Audit Trail</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <span className="text-slate-500 font-medium block">Decision Recorded:</span>
                  <span className="font-bold text-slate-900 mt-0.5 block">{status}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-medium block">Decision Date:</span>
                  <span className="font-semibold text-slate-800 mt-0.5 block">
                    {formatAssayingDateTime(inward.gradingDecisionDate)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 font-medium block">Authorized Signatory:</span>
                  <span className="font-semibold text-slate-800 mt-0.5 block">
                    {inward.gradingDecisionByName || inward.gradingDecisionByEmail || 'WSP Administrator'}
                  </span>
                </div>
              </div>
              {inward.gradingDecisionRemarks && (
                <div className="text-xs bg-slate-50 p-3 rounded-lg border border-slate-200 mt-2">
                  <span className="font-semibold text-slate-700 block mb-1">Remarks:</span>
                  <p className="text-slate-600 italic">"{inward.gradingDecisionRemarks}"</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-white border-t border-slate-200 sticky bottom-0 flex justify-between items-center gap-3">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>

          {isAuthorized && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onClose();
                  onReject?.(inward);
                }}
                disabled={!windowInfo.isOpen}
                className="border-red-200 text-red-700 hover:bg-red-50 hover:border-red-300"
              >
                <XCircle className="w-4 h-4 mr-1.5" />
                Reject
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  onClose();
                  onApprove?.(inward);
                }}
                disabled={!windowInfo.isOpen}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <CheckCircle2 className="w-4 h-4 mr-1.5" />
                Approve
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
