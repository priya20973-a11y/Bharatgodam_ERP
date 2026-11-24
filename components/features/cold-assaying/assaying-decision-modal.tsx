'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { formatAssayingDate, getApprovalWindowDetails, getGradingStatus } from '@/lib/assaying-utils';
import { CheckCircle2, XCircle, AlertTriangle, Loader2, Info, SlidersHorizontal } from 'lucide-react';

interface EditableParam {
  parameterName: string;
  observedValue: string;
  status?: string;
  remarks?: string;
  lowRange?: number;
  highRange?: number;
}

interface ColdAssayingDecisionModalProps {
  inward: any | null;
  decision: 'APPROVED' | 'REJECTED' | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (
    remarks: string,
    parameters?: { parameterName: string; observedValue: string; status?: string }[]
  ) => Promise<void>;
}

export default function ColdAssayingDecisionModal({
  inward,
  decision,
  isOpen,
  onClose,
  onConfirm,
}: ColdAssayingDecisionModalProps) {
  const [remarks, setRemarks] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editableParams, setEditableParams] = useState<EditableParam[]>([]);

  const isApprove = decision === 'APPROVED';
  const windowInfo = getApprovalWindowDetails(inward?.assayingDate);

  // Initialize editable parameters when modal opens
  useEffect(() => {
    if (isOpen && inward) {
      setRemarks('');

      const paramsMap = new Map<string, EditableParam>();

      // 1. Load parameters from inward's approvedGradingResults or gradingResults
      const existingResults = (Array.isArray(inward.approvedGradingResults) && inward.approvedGradingResults.length > 0)
        ? inward.approvedGradingResults
        : (Array.isArray(inward.gradingResults) && inward.gradingResults.length > 0 ? inward.gradingResults : []);

      if (existingResults.length > 0) {
        existingResults.forEach((gr: any) => {
          const paramName = gr.parameterName || gr.name || '';
          if (!paramName) return;

          const commodityParam = inward.commodity?.gradingParameters?.find(
            (cp: any) => cp.name?.toLowerCase() === paramName.toLowerCase()
          );

          const rawVal = gr.observedValue !== undefined && gr.observedValue !== null
            ? gr.observedValue
            : (gr.value !== undefined && gr.value !== null ? gr.value : '');
          const observedValue = String(rawVal);

          const lowRange = commodityParam?.lowRange;
          const highRange = commodityParam?.highRange;
          const status = gr.status || getGradingStatus(observedValue, lowRange, highRange);

          paramsMap.set(paramName.toLowerCase(), {
            parameterName: paramName,
            observedValue,
            status,
            remarks: commodityParam?.remarks,
            lowRange,
            highRange,
          });
        });
      }

      // 2. Also ensure all commodity gradingParameters are represented
      if (Array.isArray(inward.commodity?.gradingParameters) && inward.commodity.gradingParameters.length > 0) {
        inward.commodity.gradingParameters.forEach((cp: any) => {
          const key = (cp.name || '').toLowerCase();
          if (!paramsMap.has(key) && cp.name) {
            paramsMap.set(key, {
              parameterName: cp.name,
              observedValue: '',
              status: '',
              remarks: cp.remarks,
              lowRange: cp.lowRange,
              highRange: cp.highRange,
            });
          }
        });
      }

      setEditableParams(Array.from(paramsMap.values()));
    }
  }, [isOpen, inward]);

  if (!inward || !decision) return null;

  const handleParamChange = (index: number, val: string) => {
    setEditableParams((prev) => {
      const copy = [...prev];
      const target = { ...copy[index] };
      target.observedValue = val;
      target.status = getGradingStatus(val, target.lowRange, target.highRange);
      copy[index] = target;
      return copy;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!windowInfo.isOpen) return;

    setIsSubmitting(true);
    try {
      const formattedParams = editableParams.map((p) => ({
        parameterName: p.parameterName,
        observedValue: p.observedValue,
        status: p.status,
      }));
      await onConfirm(remarks, formattedParams);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isSubmitting && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 rounded-2xl bg-white border border-slate-200 shadow-2xl">
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div
            className={`p-6 border-b ${
              isApprove ? 'bg-emerald-50/60 border-emerald-100' : 'bg-red-50/60 border-red-100'
            }`}
          >
            <div className="flex items-start gap-4">
              <div
                className={`p-3 rounded-xl border ${
                  isApprove
                    ? 'bg-emerald-100/80 border-emerald-200 text-emerald-700'
                    : 'bg-red-100/80 border-red-200 text-red-700'
                }`}
              >
                {isApprove ? <CheckCircle2 className="w-6 h-6" /> : <XCircle className="w-6 h-6" />}
              </div>
              <div className="flex-1">
                <DialogTitle className="text-xl font-bold text-slate-900">
                  {isApprove ? 'Approve Assaying & Grading' : 'Reject Assaying & Grading'}
                </DialogTitle>
                <DialogDescription className="text-sm text-slate-600 mt-1">
                  You are recording a formal {isApprove ? 'approval' : 'rejection'} for Cold Storage Inward Receipt{' '}
                  <span className="font-semibold text-slate-800">{inward.receiptNumber || 'N/A'}</span>
                  {inward.lotNo && <> (Lot: <span className="font-semibold text-slate-800">{inward.lotNo}</span>)</>}.
                </DialogDescription>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Window Notification */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-between text-xs">
              <div>
                <span className="font-semibold text-slate-700">7-Day Decision Window:</span>{' '}
                <span className="text-slate-600">
                  {windowInfo.windowStartText} &mdash; {windowInfo.windowEndText}
                </span>
              </div>
              <Badge variant={windowInfo.isOpen ? 'default' : 'destructive'} className="text-[11px]">
                {windowInfo.isOpen ? `${windowInfo.daysLeft} Day(s) Left` : windowInfo.status}
              </Badge>
            </div>

            {/* Editable Grading Parameters (when approving) */}
            {isApprove && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4 text-cyan-600" />
                    <label className="text-sm font-bold text-slate-800">
                      Grading Parameters Observed Values
                    </label>
                  </div>
                  <span className="text-xs text-slate-500">Edit or confirm values below</span>
                </div>

                {editableParams.length === 0 ? (
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500">
                    No grading parameters configured for this commodity.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                    <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-slate-100 text-[11px] font-bold text-slate-600 uppercase">
                      <div className="col-span-5">Parameter</div>
                      <div className="col-span-4">Observed Value</div>
                      <div className="col-span-3 text-right">Result</div>
                    </div>
                    {editableParams.map((p, idx) => (
                      <div key={idx} className="grid grid-cols-12 gap-2 px-3 py-2.5 items-center hover:bg-slate-50">
                        <div className="col-span-5">
                          <div className="font-medium text-xs text-slate-900">{p.parameterName}</div>
                          <div className="text-[10px] text-slate-500">
                            {p.lowRange !== undefined && p.highRange !== undefined
                              ? `Acceptable: ${p.lowRange} – ${p.highRange}`
                              : p.remarks || 'Standard parameter'}
                          </div>
                        </div>
                        <div className="col-span-4">
                          <Input
                            value={p.observedValue}
                            onChange={(e) => handleParamChange(idx, e.target.value)}
                            placeholder="e.g. 12.5"
                            className="h-8 text-xs bg-white"
                          />
                        </div>
                        <div className="col-span-3 text-right">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                              p.status === 'OK' || p.status === 'Pass' || p.status === 'PASS'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : p.status === 'LOW'
                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                : p.status === 'HIGH'
                                ? 'bg-orange-100 text-orange-800 border border-orange-300'
                                : p.status === 'FAIL' || p.status === 'Fail'
                                ? 'bg-red-100 text-red-800 border border-red-300'
                                : p.observedValue
                                ? 'bg-cyan-100 text-cyan-800 border border-cyan-300'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {p.status || (p.observedValue ? 'Recorded' : 'Pending')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Remarks / Comments */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">
                Decision Remarks {isApprove ? '(Optional)' : <span className="text-red-500">*</span>}
              </label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder={
                  isApprove
                    ? 'Enter approval remarks, quality verification notes, or moisture findings...'
                    : 'Provide the specific reason for rejecting the assaying/grading of this stock...'
                }
                rows={3}
                required={!isApprove}
                className="w-full rounded-xl border border-slate-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 bg-white"
              />
            </div>
          </div>

          {/* Footer */}
          <DialogFooter className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !windowInfo.isOpen}
              className={
                isApprove
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-red-600 hover:bg-red-700 text-white'
              }
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Recording...
                </>
              ) : isApprove ? (
                'Confirm Approval'
              ) : (
                'Confirm Rejection'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
