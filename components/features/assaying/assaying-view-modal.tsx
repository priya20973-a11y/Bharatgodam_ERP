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
} from 'lucide-react';

interface AssayingViewModalProps {
  inward: any | null;
  isOpen: boolean;
  onClose: () => void;
  onApprove?: (inward: any) => void;
  onReject?: (inward: any) => void;
  isAuthorized?: boolean;
}

export default function AssayingViewModal({
  inward,
  isOpen,
  onClose,
  onApprove,
  onReject,
  isAuthorized = true,
}: AssayingViewModalProps) {
  if (!inward) return null;

  const windowInfo = getApprovalWindowDetails(inward.assayingDate);
  const status = inward.gradingStatus || 'PENDING';

  const handleOpenReceipt = () => {
    window.open(`/api/receipt/html?id=${inward._id}`, '_blank');
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0 rounded-2xl bg-slate-50 border border-slate-200 shadow-2xl">
        {/* Modal Header */}
        <div className="bg-white p-6 border-b border-slate-200 sticky top-0 z-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
                    Inward Transaction Details
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
                    Receipt / WHR: <span className="font-semibold text-slate-800">{inward.receiptNumber || 'N/A'}</span>
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
                className="bg-white border-slate-300 hover:bg-slate-50 text-slate-700 shadow-sm"
              >
                <Printer className="w-4 h-4 mr-1.5 text-indigo-600" />
                Storage Receipt
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
                ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                : windowInfo.status === 'BEFORE'
                ? 'bg-amber-50/70 border-amber-200 text-amber-900'
                : 'bg-slate-100 border-slate-300 text-slate-800'
            }`}
          >
            {windowInfo.isOpen ? (
              <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
            ) : windowInfo.status === 'BEFORE' ? (
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            ) : (
              <Clock className="h-5 w-5 text-slate-500 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 text-xs">
              <div className="font-semibold text-sm mb-0.5">
                7-Calendar-Day Approval Window:{' '}
                <span className="font-bold">
                  {windowInfo.windowStartText} — {windowInfo.windowEndText}
                </span>
              </div>
              <p className="opacity-90">{windowInfo.reason}</p>
            </div>
          </div>

          {/* Grid Section 1: Inward & Depositor Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Depositor & Commodity Box */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-indigo-600" /> Depositor & Commodity
              </h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-xs text-slate-500 block">Client Name</span>
                  <span className="font-bold text-slate-900">{inward.client?.name || '—'}</span>
                  {inward.client?.identifier && (
                    <span className="text-xs text-slate-500 block">ID: {inward.client.identifier}</span>
                  )}
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Commodity</span>
                  <span className="font-bold text-indigo-600">{inward.commodity?.name || '—'}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Quantity (MT)</span>
                  <span className="font-bold text-slate-900">{Number(inward.quantityMT).toFixed(4)} MT</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Bags Count</span>
                  <span className="font-bold text-slate-900">{inward.bagsCount || 0} Bags</span>
                </div>
              </div>
            </div>

            {/* Warehouse & Storage Box */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 text-indigo-600" /> Warehouse & Storage
              </h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-xs text-slate-500 block">Warehouse</span>
                  <span className="font-bold text-slate-900">{inward.warehouse?.name || '—'}</span>
                  {inward.warehouse?.location && (
                    <span className="text-xs text-slate-500 block">{inward.warehouse.location}</span>
                  )}
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Inward Date</span>
                  <span className="font-semibold text-slate-800">{formatAssayingDate(inward.date)}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Stack No.</span>
                  <span className="font-semibold text-slate-800">{inward.stackNo || '—'}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Gate Pass</span>
                  <span className="font-semibold text-slate-800">{inward.gatePass || '—'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Assayer & Quality Report Box */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" /> Assayer & Valuation Particulars
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm bg-slate-50 p-4 rounded-lg border border-slate-200">
              <div>
                <span className="text-xs text-slate-500 block">Assayer Name</span>
                <span className="font-bold text-slate-900">{inward.assayer?.name || '—'}</span>
                {inward.assayer?.licenceNumber && (
                  <span className="text-xs text-slate-500 block">Lic: {inward.assayer.licenceNumber}</span>
                )}
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Assaying Date</span>
                <span className="font-bold text-slate-900">{formatAssayingDate(inward.assayingDate)}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Grade Valid Till</span>
                <span className="font-bold text-slate-900">{formatAssayingDate(inward.assayingExpiryDate)}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Total Market Value</span>
                <span className="font-bold text-emerald-700">
                  ₹{Number(inward.totalMarketValue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
                {inward.marketValuePerMT && (
                  <span className="text-xs text-slate-500 block">@ ₹{inward.marketValuePerMT}/MT</span>
                )}
              </div>
            </div>

            {/* Grading Parameters Table */}
            <div>
              <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Grading Parameters & Observed Values
              </h5>
              {inward.gradingResults && inward.gradingResults.length > 0 ? (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-2.5">Parameter Name</th>
                        <th className="px-4 py-2.5">Standard Range / Remarks</th>
                        <th className="px-4 py-2.5">Observed Value</th>
                        <th className="px-4 py-2.5 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {inward.gradingResults.map((param: any, idx: number) => {
                        // Match with commodity grading parameter if available
                        const commodityParam = inward.commodity?.gradingParameters?.find(
                          (cp: any) => cp.name?.toLowerCase() === param.parameterName?.toLowerCase()
                        );

                        return (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="px-4 py-2.5 font-bold text-slate-800">{param.parameterName}</td>
                            <td className="px-4 py-2.5 text-slate-600">
                              {commodityParam?.remarks && <span className="mr-2">Std: {commodityParam.remarks}</span>}
                              {commodityParam?.lowRange !== undefined && commodityParam?.highRange !== undefined && (
                                <span className="text-slate-500">
                                  [{commodityParam.lowRange} — {commodityParam.highRange}]
                                </span>
                              )}
                              {!commodityParam && '—'}
                            </td>
                            <td className="px-4 py-2.5 font-bold text-slate-900">{param.observedValue}</td>
                            <td className="px-4 py-2.5 text-center">
                              {param.status ? (
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    param.status === 'OK'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-red-100 text-red-800'
                                  }`}
                                >
                                  {param.status}
                                </span>
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
              ) : (
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-500 text-center">
                  No grading parameters or observed values recorded for this transaction.
                </div>
              )}
            </div>
          </div>

          {/* Logistics & Driver Details */}
          {(inward.vehicleNumber || inward.transportationName || inward.driverName || inward.notes || inward.note) && (
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5 text-indigo-600" /> Logistics & Transport
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-xs text-slate-500 block">Vehicle Number</span>
                  <span className="font-semibold text-slate-800">{inward.vehicleNumber || '—'}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Transportation Agency</span>
                  <span className="font-semibold text-slate-800">{inward.transportationName || '—'}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Driver Details</span>
                  <span className="font-semibold text-slate-800">{inward.driverName || '—'}</span>
                </div>
              </div>
              {(inward.notes || inward.note) && (
                <div className="pt-2 border-t border-slate-100">
                  <span className="text-xs text-slate-500 block">Notes</span>
                  <p className="text-xs text-slate-700 italic mt-0.5">{inward.notes || inward.note}</p>
                </div>
              )}
            </div>
          )}

          {/* Decision Audit Trail Box (if decided) */}
          {status !== 'PENDING' && (
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" /> Decision Record
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div>
                  <span className="text-xs text-slate-500 block">Decision</span>
                  <span
                    className={`font-bold ${
                      status === 'APPROVED' ? 'text-emerald-700' : 'text-red-700'
                    }`}
                  >
                    {status === 'APPROVED' ? 'Approved' : 'Rejected'}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Decided Date</span>
                  <span className="font-semibold text-slate-800">
                    {formatAssayingDateTime(inward.gradingDecisionDate)}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Authorized User</span>
                  <span className="font-semibold text-slate-800">
                    {inward.gradingDecisionByName || 'Authorized Signatory'}
                  </span>
                  {inward.gradingDecisionByEmail && (
                    <span className="text-xs text-slate-500 block">{inward.gradingDecisionByEmail}</span>
                  )}
                </div>
              </div>
              {inward.gradingDecisionRemarks && (
                <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <span className="font-semibold text-slate-700">Remarks:</span> {inward.gradingDecisionRemarks}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-white px-6 py-4 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-3 sticky bottom-0">
          <div className="text-xs text-slate-500">
            {windowInfo.isOpen ? (
              <span className="text-emerald-700 font-semibold">● Approval window is open</span>
            ) : (
              <span className="text-amber-700 font-semibold">● Approval window is disabled</span>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button variant="outline" onClick={onClose} className="border-slate-300">
              Close
            </Button>

            {isAuthorized && (
              <>
                <Button
                  onClick={() => onReject?.(inward)}
                  disabled={!windowInfo.isOpen}
                  variant="outline"
                  className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
                  title={!windowInfo.isOpen ? windowInfo.reason : 'Reject grading record'}
                >
                  <XCircle className="w-4 h-4 mr-1.5" />
                  Reject
                </Button>

                <Button
                  onClick={() => onApprove?.(inward)}
                  disabled={!windowInfo.isOpen}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                  title={!windowInfo.isOpen ? windowInfo.reason : 'Approve grading record'}
                >
                  <CheckCircle2 className="w-4 h-4 mr-1.5" />
                  Approve
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
