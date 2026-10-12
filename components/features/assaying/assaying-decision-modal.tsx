'use client';

import React, { useState, useEffect, useMemo } from 'react';
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

interface AssayingDecisionModalProps {
  inward: any | null;
  decision: 'APPROVED' | 'REJECTED' | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (
    remarks: string,
    parameters?: { parameterName: string; observedValue: string; status?: string }[]
  ) => Promise<void>;
}

export default function AssayingDecisionModal({
  inward,
  decision,
  isOpen,
  onClose,
  onConfirm,
}: AssayingDecisionModalProps) {
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

  const handleValueChange = (parameterName: string, newValue: string) => {
    setEditableParams((prev) =>
      prev.map((param) => {
        if (param.parameterName === parameterName) {
          const status = getGradingStatus(newValue, param.lowRange, param.highRange);
          return {
            ...param,
            observedValue: newValue,
            status,
          };
        }
        return param;
      })
    );
  };

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      const payloadParams = isApprove
        ? editableParams.map((p) => ({
            parameterName: p.parameterName,
            observedValue: p.observedValue,
            status: p.status || getGradingStatus(p.observedValue, p.lowRange, p.highRange),
          }))
        : undefined;

      await onConfirm(remarks, payloadParams);
      onClose();
    } catch {
      // Handled in parent with toast
    } finally {
      setIsSubmitting(false);
    }
  };

  const isConfirmDisabled = isSubmitting || !windowInfo.isOpen;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isSubmitting && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white border border-slate-200 shadow-2xl p-6">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-3">
            <div
              className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${
                isApprove ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'
              }`}
            >
              {isApprove ? <CheckCircle2 className="h-6 w-6" /> : <XCircle className="h-6 w-6" />}
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-slate-900">
                {isApprove ? 'Approve Assaying / Grading' : 'Reject Assaying / Grading'}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Receipt / Lot:{' '}
                <span className="font-semibold text-slate-800">
                  {inward.receiptNumber || inward.lotNo || 'N/A'}
                </span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 my-2 text-sm">
          {/* Summary Box */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Client:</span>
              <span className="font-bold text-slate-800">{inward.client?.name || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Commodity:</span>
              <span className="font-bold text-indigo-600">{inward.commodity?.name || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Quantity:</span>
              <span className="font-semibold text-slate-800">
                {Number(inward.quantityMT).toFixed(4)} MT ({inward.bagsCount || 0} Bags)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Assaying Date:</span>
              <span className="font-semibold text-slate-800">{formatAssayingDate(inward.assayingDate)}</span>
            </div>
            <div className="flex justify-between pt-1 border-t border-slate-200">
              <span className="text-slate-500">7-Day Window:</span>
              <span className="font-semibold text-slate-700">
                {windowInfo.windowStartText} — {windowInfo.windowEndText}
              </span>
            </div>
          </div>

          {!windowInfo.isOpen && (
            <div className="p-3 bg-red-50 text-red-800 border border-red-200 rounded-lg text-xs flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
              <span>{windowInfo.reason}</span>
            </div>
          )}

          {/* APPROVAL ONLY: Editable Grading Parameters Section */}
          {isApprove && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-600" />
                  Modify Grading Parameter Values
                </label>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  You can modify observed values before confirming approval. The saved values will be stored and printed on the storage receipt.
                </p>
              </div>

              {editableParams.length > 0 ? (
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
                  <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                    {editableParams.map((param, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/90 transition-colors"
                      >
                        <div className="flex-1 min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-slate-900 block truncate">
                              {param.parameterName}
                            </span>
                            {param.observedValue && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                                Current: <strong className="ml-1 text-slate-900">{param.observedValue}</strong>
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-500 block truncate">
                            {param.remarks ? `Std: ${param.remarks}` : ''}
                            {param.lowRange !== undefined && param.highRange !== undefined
                              ? ` [Range: ${param.lowRange} — ${param.highRange}]`
                              : ''}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 sm:w-60 shrink-0">
                          <div className="relative flex-1">
                            <Input
                              type="text"
                              placeholder="Observed Value"
                              value={param.observedValue}
                              onChange={(e) => handleValueChange(param.parameterName, e.target.value)}
                              className="h-9 text-xs !text-slate-900 text-slate-900 bg-white border-slate-300 font-bold focus:ring-indigo-500 focus:border-indigo-500 placeholder:text-slate-400 shadow-xs"
                              disabled={isSubmitting || !windowInfo.isOpen}
                            />
                          </div>

                          {param.status ? (
                            <span
                              className={`px-2.5 py-1.5 rounded-md text-[10px] font-bold shrink-0 w-14 text-center ${
                                param.status === 'OK'
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                  : 'bg-red-100 text-red-800 border border-red-300'
                              }`}
                            >
                              {param.status}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs w-14 text-center font-medium">—</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-slate-50 text-slate-600 border border-slate-200 rounded-lg text-xs text-center">
                  No grading parameters defined for this commodity or transaction.
                </div>
              )}
            </div>
          )}

          {/* REJECT ONLY: Storage Receipt Note */}
          {!isApprove && (
            <div className="p-3 bg-red-50/80 border border-red-200 rounded-xl text-xs text-red-900 flex items-start gap-2">
              <Info className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Storage Receipt Notice:</span> On the receipt, the grading section will display <strong className="underline">Not Approved</strong>.
              </div>
            </div>
          )}

          {/* Remarks input */}
          <div className="space-y-1.5">
            <label htmlFor="decisionRemarks" className="text-xs font-semibold text-slate-700 block">
              Decision Remarks / Notes (Optional)
            </label>
            <textarea
              id="decisionRemarks"
              rows={2}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder={
                isApprove
                  ? 'Add any comments on grading approval (e.g., standard quality confirmed)...'
                  : 'Specify reason for rejection (e.g., moisture exceeds standard threshold)...'
              }
              className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white !text-slate-900 text-slate-900 placeholder:text-slate-400 shadow-xs font-medium"
              disabled={isSubmitting || !windowInfo.isOpen}
            />
          </div>
        </div>

        <DialogFooter className="flex flex-row justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
            className="border-slate-300 text-xs"
          >
            Cancel
          </Button>

          <Button
            type="button"
            onClick={handleConfirm}
            disabled={isConfirmDisabled}
            className={`text-xs font-bold ${
              isApprove
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-red-600 hover:bg-red-700 text-white'
            }`}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Processing...
              </>
            ) : isApprove ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                Confirm Approval
              </>
            ) : (
              <>
                <XCircle className="w-3.5 h-3.5 mr-1.5" />
                Confirm Rejection
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
