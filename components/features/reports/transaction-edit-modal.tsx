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
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'react-hot-toast';
import { Loader2, Edit3, Calendar, Scale, Package, Truck, FileText, AlertCircle, TrendingDown, RefreshCcw } from 'lucide-react';
import type { TransactionRecord } from './transactions-report';

interface TransactionEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: TransactionRecord | null;
  onSaveSuccess: (updatedTransaction: TransactionRecord) => void;
}

export default function TransactionEditModal({
  isOpen,
  onClose,
  transaction,
  onSaveSuccess,
}: TransactionEditModalProps) {
  const [formData, setFormData] = useState({
    date: '',
    quantityMT: '',
    actualWeight: '',
    netWeightLoss: '',
    bagsCount: '',
    gatePass: '',
    stackNo: '',
    lotNo: '',
    vehicleNumber: '',
    transportationName: '',
    driverName: '',
    notes: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [checkingStock, setCheckingStock] = useState(false);
  const [currentStock, setCurrentStock] = useState<number | null>(null);
  const [warehouseStock, setWarehouseStock] = useState<number | null>(null);

  // Prefill data whenever transaction changes
  useEffect(() => {
    if (transaction && isOpen) {
      setServerError(null);
      setErrors({});
      setCurrentStock(null);
      setWarehouseStock(null);

      const isOutwardTx = (transaction.direction || '').toUpperCase() === 'OUTWARD';
      if (isOutwardTx) {
        setCheckingStock(true);
      }

      let formattedDate = '';
      if (transaction.date) {
        const parsed = new Date(transaction.date);
        if (!Number.isNaN(parsed.getTime())) {
          formattedDate = parsed.toISOString().split('T')[0];
        } else {
          formattedDate = String(transaction.date).split('T')[0] || '';
        }
      }

      const rawBags = transaction.bagsCount !== undefined && transaction.bagsCount !== null
        ? String(transaction.bagsCount)
        : (transaction.bags !== undefined && transaction.bags !== null ? String(transaction.bags) : '');

      setFormData({
        date: formattedDate,
        quantityMT: transaction.quantityMT !== undefined ? String(transaction.quantityMT) : '',
        actualWeight: transaction.actualWeight !== undefined && transaction.actualWeight !== null ? String(transaction.actualWeight) : '',
        netWeightLoss: transaction.netWeightLoss !== undefined && transaction.netWeightLoss !== null ? String(transaction.netWeightLoss) : '',
        bagsCount: rawBags,
        gatePass: transaction.gatePass || '',
        stackNo: transaction.stackNo || '',
        lotNo: transaction.lotNo || '',
        vehicleNumber: transaction.vehicleNumber || '',
        transportationName: transaction.transportationName || '',
        driverName: transaction.driverName || '',
        notes: transaction.notes || transaction.note || '',
      });

      // Fetch fresh details from backend to ensure complete metadata
      if (transaction._id) {
        fetch(`/api/transactions?transactionId=${transaction._id}&sourceType=${transaction.sourceType || ''}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data?.success && data.transaction) {
              const fresh = data.transaction;
              if (fresh.availableStock !== undefined && fresh.availableStock !== null) {
                setCurrentStock(Number(fresh.availableStock));
              }
              if (fresh.warehouseStock !== undefined && fresh.warehouseStock !== null) {
                setWarehouseStock(Number(fresh.warehouseStock));
              }
              setFormData((prev) => ({
                ...prev,
                date: fresh.date || prev.date,
                quantityMT: fresh.quantityMT !== undefined ? String(fresh.quantityMT) : prev.quantityMT,
                actualWeight: fresh.actualWeight !== undefined && fresh.actualWeight !== null ? String(fresh.actualWeight) : prev.actualWeight,
                netWeightLoss: fresh.netWeightLoss !== undefined && fresh.netWeightLoss !== null ? String(fresh.netWeightLoss) : prev.netWeightLoss,
                bagsCount: fresh.bagsCount !== undefined && fresh.bagsCount !== null ? String(fresh.bagsCount) : prev.bagsCount,
                gatePass: fresh.gatePass || prev.gatePass,
                stackNo: fresh.stackNo || prev.stackNo,
                lotNo: fresh.lotNo || prev.lotNo,
                vehicleNumber: fresh.vehicleNumber || prev.vehicleNumber,
                transportationName: fresh.transportationName || prev.transportationName,
                driverName: fresh.driverName || prev.driverName,
                notes: fresh.notes || prev.notes,
              }));
            }
          })
          .catch((err) => {
            console.warn('[TransactionEditModal] Could not fetch fresh transaction details:', err);
          })
          .finally(() => {
            setCheckingStock(false);
          });
      } else {
        setCheckingStock(false);
      }
    }
  }, [transaction, isOpen]);

  const handleSyncStock = async () => {
    if (!transaction?._id) return;
    setCheckingStock(true);
    try {
      const res = await fetch(`/api/transactions?transactionId=${transaction._id}&sourceType=${transaction.sourceType || ''}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.success && data.transaction) {
          if (data.transaction.availableStock !== undefined && data.transaction.availableStock !== null) {
            const avail = Number(data.transaction.availableStock);
            setCurrentStock(avail);
            toast.success(`Available stock synced: ${avail.toFixed(2)} MT`);
          }
          if (data.transaction.warehouseStock !== undefined && data.transaction.warehouseStock !== null) {
            setWarehouseStock(Number(data.transaction.warehouseStock));
          }
        }
      }
    } catch (err) {
      console.warn('[TransactionEditModal] Failed to sync stock balance:', err);
      toast.error('Failed to sync stock balance');
    } finally {
      setCheckingStock(false);
    }
  };

  const direction = (transaction?.direction || 'INWARD').toUpperCase();
  const isInward = direction === 'INWARD';

  // Compute live Net Weight Loss / Gain for Outward transactions
  const computedNetLossGain = useMemo(() => {
    if (isInward) return '';
    const qty = Number(formData.quantityMT);
    if (formData.actualWeight !== '' && !Number.isNaN(Number(formData.actualWeight)) && !Number.isNaN(qty) && qty > 0) {
      const act = Number(formData.actualWeight);
      const diff = Number((qty - act).toFixed(4));
      if (diff > 0) {
        return `${diff.toFixed(2)} MT (Weight Loss)`;
      } else if (diff < 0) {
        return `${Math.abs(diff).toFixed(2)} MT (Weight Gain)`;
      } else {
        return `0.00 MT (No Loss / Gain)`;
      }
    }
    if (formData.netWeightLoss !== '') {
      const n = Number(formData.netWeightLoss);
      if (!Number.isNaN(n)) return `${n.toFixed(2)} MT`;
    }
    return '';
  }, [isInward, formData.quantityMT, formData.actualWeight, formData.netWeightLoss]);

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.date || !formData.date.trim()) {
      newErrors.date = 'Transaction date is required';
    } else {
      const parsed = new Date(formData.date);
      if (Number.isNaN(parsed.getTime())) {
        newErrors.date = 'Invalid date format (use YYYY-MM-DD)';
      }
    }

    if (!formData.quantityMT || !formData.quantityMT.trim()) {
      newErrors.quantityMT = 'Quantity in MT is required';
    } else {
      const qty = Number(formData.quantityMT);
      if (Number.isNaN(qty) || qty <= 0) {
        newErrors.quantityMT = 'Quantity must be a positive number (> 0)';
      }
    }

    if (formData.bagsCount && formData.bagsCount.trim() !== '') {
      const bags = Number(formData.bagsCount);
      if (Number.isNaN(bags) || bags < 0 || !Number.isInteger(bags)) {
        newErrors.bagsCount = 'Bags count must be a non-negative whole number';
      }
    }

    if (!isInward && currentStock !== null && formData.quantityMT && formData.quantityMT.trim() !== '') {
      const qty = Number(formData.quantityMT);
      if (!Number.isNaN(qty) && qty > currentStock + 1e-4) {
        newErrors.quantityMT = `Insufficient stock. Max available: ${currentStock.toFixed(2)} MT`;
      }
    }

    if (!isInward && formData.actualWeight && formData.actualWeight.trim() !== '') {
      const act = Number(formData.actualWeight);
      if (Number.isNaN(act) || act < 0) {
        newErrors.actualWeight = 'Actual weight must be a non-negative number (>= 0)';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleFieldChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const copy = { ...prev };
        delete copy[field];
        return copy;
      });
    }
    if (serverError) setServerError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transaction) return;
    if (!validate()) return;

    if (!isInward && currentStock !== null && Number(formData.quantityMT) > currentStock + 1e-4) {
      const msg = `Insufficient stock. Max available: ${currentStock.toFixed(2)} MT`;
      setServerError(msg);
      toast.error(msg);
      return;
    }

    setIsSaving(true);
    setServerError(null);

    const hasActualWeight = !isInward && formData.actualWeight !== '' && !Number.isNaN(Number(formData.actualWeight));
    const actualWeightVal = hasActualWeight
      ? Number(formData.actualWeight)
      : (!isInward && formData.actualWeight === '' ? null : undefined);
    const netLossVal = hasActualWeight
      ? Number((Number(formData.quantityMT) - Number(formData.actualWeight)).toFixed(4))
      : (!isInward && formData.actualWeight === '' ? null : undefined);

    const payload = {
      transactionId: transaction._id,
      sourceType: transaction.sourceType,
      date: formData.date,
      quantityMT: Number(formData.quantityMT),
      actualWeight: actualWeightVal,
      netWeightLoss: netLossVal,
      bagsCount: formData.bagsCount !== '' ? Number(formData.bagsCount) : undefined,
      bags: formData.bagsCount !== '' ? Number(formData.bagsCount) : undefined,
      gatePass: formData.gatePass.trim() || undefined,
      stackNo: formData.stackNo.trim() || undefined,
      lotNo: formData.lotNo.trim() || undefined,
      vehicleNumber: formData.vehicleNumber.trim() || undefined,
      transportationName: formData.transportationName.trim() || undefined,
      driverName: formData.driverName.trim() || undefined,
      notes: formData.notes.trim() || undefined,
      note: formData.notes.trim() || undefined,
    };

    try {
      const response = await fetch('/api/transactions', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        const errorMsg = result.message || 'Failed to update transaction';
        setServerError(errorMsg);
        toast.error(errorMsg);
        return;
      }

      toast.success(result.message || 'Transaction updated successfully');

      const updatedRecord: TransactionRecord = {
        ...transaction,
        date: formData.date,
        quantityMT: Number(formData.quantityMT),
        actualWeight: hasActualWeight
          ? Number(formData.actualWeight)
          : (!isInward && formData.actualWeight === '' ? undefined : transaction.actualWeight),
        netWeightLoss: hasActualWeight
          ? Number((Number(formData.quantityMT) - Number(formData.actualWeight)).toFixed(4))
          : (!isInward && formData.actualWeight === '' ? undefined : transaction.netWeightLoss),
        bagsCount: formData.bagsCount !== '' ? Number(formData.bagsCount) : undefined,
        gatePass: formData.gatePass || undefined,
        stackNo: formData.stackNo || undefined,
        lotNo: formData.lotNo || undefined,
        vehicleNumber: formData.vehicleNumber || undefined,
        transportationName: formData.transportationName || undefined,
        driverName: formData.driverName || undefined,
        notes: formData.notes || undefined,
        note: formData.notes || undefined,
      };

      onSaveSuccess(updatedRecord);
      onClose();
    } catch (err) {
      console.error('[TransactionEditModal] Save failed:', err);
      const msg = `Save failed: ${err instanceof Error ? err.message : String(err)}`;
      setServerError(msg);
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  if (!transaction) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !isSaving) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-6 bg-white sm:rounded-xl shadow-xl">
        <DialogHeader className="border-b pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                <Edit3 className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold text-slate-900">
                  Edit Dry Storage Transaction
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 mt-0.5">
                  Update transaction records while maintaining stock and ledger consistency.
                </DialogDescription>
              </div>
            </div>
            <Badge
              className={`text-xs px-2.5 py-1 font-semibold ${
                isInward
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                  : 'bg-rose-100 text-rose-800 border-rose-300'
              }`}
            >
              {direction}
            </Badge>
          </div>
        </DialogHeader>

        {/* Read-Only Context Information */}
        <div className={`bg-slate-50 border border-slate-200 rounded-lg p-3.5 my-3 grid grid-cols-2 ${!isInward ? 'sm:grid-cols-5' : 'sm:grid-cols-4'} gap-3 text-xs`}>
          <div>
            <span className="text-slate-400 block font-medium">Client</span>
            <span className="font-semibold text-slate-800 truncate block" title={transaction.clientName}>
              {transaction.clientName || '—'}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block font-medium">Warehouse</span>
            <span className="font-semibold text-slate-800 truncate block" title={transaction.warehouseName}>
              {transaction.warehouseName || '—'}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block font-medium">Commodity</span>
            <span className="font-semibold text-slate-800 truncate block" title={transaction.commodityName}>
              {transaction.commodityName || '—'}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block font-medium">Receipt / ID</span>
            <span className="font-semibold text-slate-800 truncate block" title={transaction.receiptNumber || transaction.gatePass || transaction._id}>
              {transaction.receiptNumber || transaction.gatePass || transaction._id.slice(-8)}
            </span>
          </div>
          {!isInward && (
            <div>
              <span className="text-slate-400 block font-medium">Available Stock</span>
              <span className="font-semibold text-emerald-700 block">
                {checkingStock ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400 inline" />
                ) : currentStock !== null ? (
                  `${currentStock.toFixed(2)} MT`
                ) : (
                  '—'
                )}
              </span>
            </div>
          )}
        </div>

        {serverError && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-rose-600" />
            <div className="flex-1 text-xs sm:text-sm font-medium">{serverError}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Row 1: Date & Primary Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="date" className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-indigo-500" /> Date *
              </Label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) => handleFieldChange('date', e.target.value)}
                className={`mt-1 h-9 text-sm ${errors.date ? 'border-rose-500 focus-visible:ring-rose-500' : ''}`}
                disabled={isSaving}
              />
              {errors.date && <p className="text-[11px] text-rose-600 mt-1">{errors.date}</p>}
            </div>

            <div>
              <Label htmlFor="quantityMT" className="text-xs font-semibold text-slate-700 flex justify-between items-center">
                <span className="flex items-center gap-1.5">
                  <Scale className="h-3.5 w-3.5 text-indigo-500" /> Quantity (MT) *
                </span>
                {!isInward && (
                  <div className="flex items-center gap-1.5">
                    {checkingStock && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
                    {currentStock !== null && (
                      <Badge
                        variant={currentStock > 0 ? 'secondary' : 'destructive'}
                        className="text-[10px] py-0 font-semibold"
                        title={`Max available for this outward transaction: ${currentStock.toFixed(2)} MT`}
                      >
                        Max: {currentStock.toFixed(2)} MT
                      </Badge>
                    )}
                    <button
                      type="button"
                      onClick={handleSyncStock}
                      disabled={checkingStock}
                      className="text-slate-400 hover:text-indigo-600 transition-colors p-0.5 rounded cursor-pointer"
                      title="Sync Balance"
                    >
                      <RefreshCcw className={`h-3 w-3 ${checkingStock ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                )}
              </Label>
              <Input
                id="quantityMT"
                type="number"
                step="0.001"
                min="0.001"
                placeholder="e.g. 15.250"
                value={formData.quantityMT}
                onChange={(e) => handleFieldChange('quantityMT', e.target.value)}
                className={`mt-1 h-9 text-sm ${errors.quantityMT ? 'border-rose-500 focus-visible:ring-rose-500' : ''}`}
                disabled={isSaving}
              />
              {errors.quantityMT && <p className="text-[11px] text-rose-600 mt-1">{errors.quantityMT}</p>}
            </div>

            <div>
              <Label htmlFor="bagsCount" className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5 text-indigo-500" /> Bags Count
              </Label>
              <Input
                id="bagsCount"
                type="number"
                step="1"
                min="0"
                placeholder="e.g. 300"
                value={formData.bagsCount}
                onChange={(e) => handleFieldChange('bagsCount', e.target.value)}
                className={`mt-1 h-9 text-sm ${errors.bagsCount ? 'border-rose-500 focus-visible:ring-rose-500' : ''}`}
                disabled={isSaving}
              />
              {errors.bagsCount && <p className="text-[11px] text-rose-600 mt-1">{errors.bagsCount}</p>}
            </div>
          </div>

          {/* Outward Specific: Actual Weight & Net Weight Loss/Gain */}
          {!isInward && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 bg-amber-50/60 border border-amber-200/80 rounded-lg">
              <div>
                <Label htmlFor="actualWeight" className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Scale className="h-3.5 w-3.5 text-amber-600" /> Actual Weight (MT)
                </Label>
                <Input
                  id="actualWeight"
                  type="number"
                  step="0.001"
                  min="0"
                  placeholder="e.g. 15.100"
                  value={formData.actualWeight}
                  onChange={(e) => handleFieldChange('actualWeight', e.target.value)}
                  className={`mt-1 h-9 text-sm bg-white ${errors.actualWeight ? 'border-rose-500 focus-visible:ring-rose-500' : ''}`}
                  disabled={isSaving}
                />
                {errors.actualWeight && <p className="text-[11px] text-rose-600 mt-1">{errors.actualWeight}</p>}
              </div>

              <div>
                <Label htmlFor="netWeightLoss" className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <TrendingDown className="h-3.5 w-3.5 text-amber-600" /> Net Weight Loss/Gain (MT)
                </Label>
                <Input
                  id="netWeightLoss"
                  type="text"
                  readOnly
                  disabled
                  value={computedNetLossGain || ''}
                  placeholder="Auto-calculated (Quantity - Actual Weight)"
                  className="mt-1 h-9 text-sm bg-slate-100/90 text-slate-700 font-medium cursor-not-allowed"
                />
                <p className="text-[10px] text-slate-500 mt-1">Calculated as (Quantity MT - Actual Weight)</p>
              </div>
            </div>
          )}

          {/* Row 2: Warehouse Tracking (Gate Pass, Stack No, Lot No) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="gatePass" className="text-xs font-semibold text-slate-700">
                Gate Pass No
              </Label>
              <Input
                id="gatePass"
                type="text"
                placeholder="e.g. GP-98421"
                value={formData.gatePass}
                onChange={(e) => handleFieldChange('gatePass', e.target.value)}
                className="mt-1 h-9 text-sm"
                disabled={isSaving}
              />
            </div>

            <div>
              <Label htmlFor="stackNo" className="text-xs font-semibold text-slate-700">
                Stack No
              </Label>
              <Input
                id="stackNo"
                type="text"
                placeholder="e.g. ST-04"
                value={formData.stackNo}
                onChange={(e) => handleFieldChange('stackNo', e.target.value)}
                className="mt-1 h-9 text-sm"
                disabled={isSaving}
              />
            </div>

            <div>
              <Label htmlFor="lotNo" className="text-xs font-semibold text-slate-700">
                Lot No
              </Label>
              <Input
                id="lotNo"
                type="text"
                placeholder="e.g. LOT-A2"
                value={formData.lotNo}
                onChange={(e) => handleFieldChange('lotNo', e.target.value)}
                className="mt-1 h-9 text-sm"
                disabled={isSaving}
              />
            </div>
          </div>

          {/* Row 3: Logistics Details */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="vehicleNumber" className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <Truck className="h-3.5 w-3.5 text-indigo-500" /> Vehicle No
              </Label>
              <Input
                id="vehicleNumber"
                type="text"
                placeholder="e.g. MH-12-AB-1234"
                value={formData.vehicleNumber}
                onChange={(e) => handleFieldChange('vehicleNumber', e.target.value)}
                className="mt-1 h-9 text-sm"
                disabled={isSaving}
              />
            </div>

            <div>
              <Label htmlFor="transportationName" className="text-xs font-semibold text-slate-700">
                Transporter Name
              </Label>
              <Input
                id="transportationName"
                type="text"
                placeholder="e.g. Swift Roadlines"
                value={formData.transportationName}
                onChange={(e) => handleFieldChange('transportationName', e.target.value)}
                className="mt-1 h-9 text-sm"
                disabled={isSaving}
              />
            </div>

            <div>
              <Label htmlFor="driverName" className="text-xs font-semibold text-slate-700">
                Driver Name
              </Label>
              <Input
                id="driverName"
                type="text"
                placeholder="e.g. Ramesh Kumar"
                value={formData.driverName}
                onChange={(e) => handleFieldChange('driverName', e.target.value)}
                className="mt-1 h-9 text-sm"
                disabled={isSaving}
              />
            </div>
          </div>

          {/* Row 4: Notes / Remarks */}
          <div>
            <Label htmlFor="notes" className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-indigo-500" /> Notes / Remarks
            </Label>
            <textarea
              id="notes"
              rows={2}
              placeholder="Add any specific context or reasons for edit..."
              value={formData.notes}
              onChange={(e) => handleFieldChange('notes', e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              disabled={isSaving}
            />
          </div>

          <DialogFooter className="pt-3 border-t flex flex-col sm:flex-row items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSaving}
              className="w-full sm:w-auto text-slate-700"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSaving}
              className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 font-semibold flex items-center gap-2 text-white"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

