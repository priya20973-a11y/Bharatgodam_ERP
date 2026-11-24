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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getColdAssayers } from '@/app/actions/cold-assayer-actions';
import { updateColdAssayerAssignment } from '@/app/actions/cold-assaying-actions';
import { toast } from 'react-hot-toast';
import { ShieldCheck, Calendar, User, Loader2, AlertCircle } from 'lucide-react';
import { formatAssayingDate } from '@/lib/assaying-utils';

interface ColdAssayerItem {
  _id: string;
  name: string;
  licenceNumber: string;
  status: 'Active' | 'Expired';
}

interface AssignAssayerModalProps {
  inward: any | null;
  isOpen: boolean;
  onClose: () => void;
  onAssigned: (data: {
    inwardId: string;
    assayer: {
      _id: string;
      name: string;
      licenceNumber: string;
      status: string;
    } | null;
    assayingDate: string | null;
    assayingExpiryDate: string | null;
  }) => void;
}

export default function AssignAssayerModal({
  inward,
  isOpen,
  onClose,
  onAssigned,
}: AssignAssayerModalProps) {
  const [assayers, setAssayers] = useState<ColdAssayerItem[]>([]);
  const [selectedAssayerId, setSelectedAssayerId] = useState<string>('none');
  const [assayingDate, setAssayingDate] = useState<string>('');
  const [assayingExpiryDate, setAssayingExpiryDate] = useState<string>('');
  const [isLoadingAssayers, setIsLoadingAssayers] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dateError, setDateError] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setIsLoadingAssayers(true);
      getColdAssayers()
        .then((data) => {
          setAssayers(data || []);
        })
        .catch((err) => {
          toast.error('Failed to load Cold Assayers: ' + err.message);
        })
        .finally(() => {
          setIsLoadingAssayers(false);
        });

      if (inward) {
        setSelectedAssayerId(inward.assayer?._id || inward.assayerId || 'none');
        
        // Format dates as YYYY-MM-DD for date inputs
        if (inward.assayingDate) {
          setAssayingDate(new Date(inward.assayingDate).toISOString().split('T')[0]);
        } else if (inward.date) {
          setAssayingDate(new Date(inward.date).toISOString().split('T')[0]);
        } else {
          setAssayingDate(new Date().toISOString().split('T')[0]);
        }

        if (inward.assayingExpiryDate) {
          setAssayingExpiryDate(new Date(inward.assayingExpiryDate).toISOString().split('T')[0]);
        } else {
          setAssayingExpiryDate('');
        }
      }
      setDateError('');
    }
  }, [isOpen, inward]);

  if (!inward) return null;

  const inwardDateStr = inward.date ? new Date(inward.date).toISOString().split('T')[0] : '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDateError('');

    if (assayingDate && inwardDateStr && assayingDate < inwardDateStr) {
      const err = `Assaying date cannot be earlier than inward date (${formatAssayingDate(inward.date)}).`;
      setDateError(err);
      toast.error(err);
      return;
    }

    if (assayingExpiryDate && assayingDate && assayingExpiryDate < assayingDate) {
      const err = 'Assaying expiry date cannot be earlier than assaying date.';
      setDateError(err);
      toast.error(err);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await updateColdAssayerAssignment({
        inwardId: inward._id,
        assayerId: selectedAssayerId === 'none' ? undefined : selectedAssayerId,
        assayingDate: assayingDate || undefined,
        assayingExpiryDate: assayingExpiryDate || undefined,
      });

      if (res.success) {
        toast.success(res.message || 'Assayer assignment updated successfully');
        onAssigned({
          inwardId: inward._id,
          assayer: res.assayer || null,
          assayingDate: res.assayingDate,
          assayingExpiryDate: res.assayingExpiryDate,
        });
        onClose();
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to update assayer assignment');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isSubmitting && onClose()}>
      <DialogContent className="max-w-md p-0 rounded-2xl bg-white border border-slate-200 shadow-2xl">
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="p-6 border-b border-slate-100 bg-slate-50/70">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-cyan-50 border border-cyan-100 text-cyan-700">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-slate-900">
                  Assign Assayer & Date
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 mt-0.5">
                  Receipt: <span className="font-semibold text-slate-700">{inward.receiptNumber || 'N/A'}</span>
                  {inward.lotNo && <> • Lot: <span className="font-semibold text-slate-700">{inward.lotNo}</span></>}
                </DialogDescription>
              </div>
            </div>
          </div>

          {/* Form Content */}
          <div className="p-6 space-y-4">
            {/* Context Info */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Client:</span>
                <span className="font-semibold text-slate-800">{inward.client?.name || inward.farmerName || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Commodity:</span>
                <span className="font-semibold text-slate-800">{inward.commodity?.name || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Inward Date:</span>
                <span className="font-semibold text-slate-800">{formatAssayingDate(inward.date)}</span>
              </div>
            </div>

            {/* Assayer Selection */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">
                Select Assayer (Cold Assayer Master)
              </Label>
              {isLoadingAssayers ? (
                <div className="text-xs text-slate-400 py-2 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-600" />
                  Loading Assayers...
                </div>
              ) : (
                <Select value={selectedAssayerId} onValueChange={setSelectedAssayerId}>
                  <SelectTrigger className="h-9 text-xs bg-white border-slate-300">
                    <SelectValue placeholder="Select Assayer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">-- Unassigned / None --</SelectItem>
                    {assayers.map((a) => (
                      <SelectItem
                        key={a._id}
                        value={a._id}
                        disabled={a.status === 'Expired'}
                        className="text-xs"
                      >
                        {a.name} ({a.licenceNumber || 'No Licence'})
                        {a.status === 'Expired' ? ' [EXPIRED]' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <p className="text-[11px] text-slate-400">
                Only active accredited assayers from Cold Assayer Master can be assigned.
              </p>
            </div>

            {/* Assaying Date */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">
                Assaying Date <span className="text-red-500">*</span>
              </Label>
              <Input
                type="date"
                value={assayingDate}
                min={inwardDateStr}
                onChange={(e) => {
                  setAssayingDate(e.target.value);
                  setDateError('');
                }}
                required
                className="h-9 text-xs bg-white border-slate-300"
              />
              <p className="text-[11px] text-slate-400">
                Must be on or after Inward Date ({formatAssayingDate(inward.date)}). Initiates 7-day decision window.
              </p>
            </div>

            {/* Stock Assaying Expiry Date */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">
                Stock Assaying Expiry Date (Optional)
              </Label>
              <Input
                type="date"
                value={assayingExpiryDate}
                min={assayingDate || inwardDateStr}
                onChange={(e) => setAssayingExpiryDate(e.target.value)}
                className="h-9 text-xs bg-white border-slate-300"
              />
            </div>

            {dateError && (
              <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{dateError}</span>
              </div>
            )}
          </div>

          {/* Footer */}
          <DialogFooter className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting || isLoadingAssayers}
              className="bg-cyan-700 hover:bg-cyan-800 text-white font-semibold"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Assignment'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
