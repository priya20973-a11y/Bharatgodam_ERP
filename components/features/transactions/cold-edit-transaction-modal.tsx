'use client';

import { useState, useEffect } from 'react';
import { getColdTransactionById, updateColdTransaction } from '@/app/actions/cold-transaction-report-actions';
import { getClients } from '@/app/actions/client-actions';
import { fetchColdCommodities } from '@/app/actions/cold-commodities';
import { getColdWarehouses } from '@/app/actions/cold-warehouse-actions';
import { getStackAvailableCapacity } from '@/app/actions/cold-inward-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ColdNumberInput } from '@/components/ui/cold-number-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'react-hot-toast';
import { useColdTranslation } from '@/components/providers/cold-language-provider';

interface ColdEditTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactionId: string;
  transactionType: 'INWARD' | 'OUTWARD';
  onSuccess: () => void;
}

export default function ColdEditTransactionModal({ 
  isOpen, 
  onClose, 
  transactionId, 
  transactionType, 
  onSuccess 
}: ColdEditTransactionModalProps) {
  const { t } = useColdTranslation();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  
  const [clients, setClients] = useState<any[]>([]);
  const [commodities, setCommodities] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  
  const [txnData, setTxnData] = useState<any>(null);
  
  const [clientId, setClientId] = useState('');
  const [farmerName, setFarmerName] = useState('');
  const [commodityId, setCommodityId] = useState('');
  const [grade, setGrade] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [chamberNo, setChamberNo] = useState('');
  const [floorNo, setFloorNo] = useState('');
  const [stackNo, setStackNo] = useState('');
  
  const [bagsCount, setBagsCount] = useState<number | null>(null);
  const [date, setDate] = useState('');
  
  const [seed, setSeed] = useState('');
  const [tableLabel, setTableLabel] = useState('');
  const [jin, setJin] = useState<number | null>(null);
  const [mixed, setMixed] = useState<number | null>(null);
  const [plusMinus, setPlusMinus] = useState<string | number | null>('-');
  const [truckNo, setTruckNo] = useState('');
  const [weighbridgeSlipNo, setWeighbridgeSlipNo] = useState('');
  const [grossWeight, setGrossWeight] = useState<number | null>(null);
  const [emptyWeight, setEmptyWeight] = useState<number | null>(null);
  const [marko, setMarko] = useState('');
  const [remarks, setRemarks] = useState('');
  const [note, setNote] = useState('');

  const calcTotalBags = Number(bagsCount || 0) + Number(jin || 0) + Number(mixed || 0);
  const calcNetWeight = Number(grossWeight || 0) - Number(emptyWeight || 0);
  const calcKataBharati = calcTotalBags > 0 ? (calcNetWeight / calcTotalBags) : 0;
  
  const [availableCapacity, setAvailableCapacity] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen && transactionId) {
      loadInitialData();
    }
  }, [isOpen, transactionId]);

  const loadInitialData = async () => {
    setFetching(true);
    try {
      const [cRes, comRes, wRes, txn] = await Promise.all([
        getClients(),
        fetchColdCommodities(),
        getColdWarehouses(),
        getColdTransactionById(transactionId, transactionType)
      ]);
      setClients(cRes);
      setCommodities(comRes);
      setWarehouses(wRes);
      
      setTxnData(txn);
      
      setDate(txn.date ? new Date(txn.date).toISOString().split('T')[0] : '');
      setClientId(txn.clientId || txn.client?._id || '');
      setFarmerName(txn.farmerName || '');
      setCommodityId(txn.commodityId || txn.commodity?._id || '');
      setGrade(txn.grade || '');
      setWarehouseId(txn.warehouseId || txn.warehouse?._id || '');
      setChamberNo(txn.chamberNo?.toString() || '');
      setFloorNo(txn.floorNo?.toString() || '');
      setStackNo(txn.stackNo?.toString() || '');
      setBagsCount(txn.bagsCount);
      setSeed(txn.seed || '');
      setTableLabel(txn.tableLabel || '');
      setJin(txn.jin);
      setMixed(txn.mixed);
      if (transactionType === 'OUTWARD') {
        setPlusMinus(txn.plusMinus !== undefined && txn.plusMinus !== null ? txn.plusMinus : '-');
      }
      setTruckNo(txn.truckNo || '');
      setWeighbridgeSlipNo(txn.weighbridgeSlipNo || '');
      setGrossWeight(txn.grossWeight);
      setEmptyWeight(txn.emptyWeight);
      setMarko(txn.marko || '');
      setRemarks(txn.remarks || '');
      setNote(txn.note || '');
      
    } catch (err: any) {
      toast.error(err.message || 'Failed to load transaction for edit');
      onClose();
    } finally {
      setFetching(false);
    }
  };

  const selectedCommodity = commodities.find(c => c._id === commodityId);
  const autoGradingType = selectedCommodity?.gradingType || '';

  const selectedWarehouse = warehouses.find(w => w._id === warehouseId);
  const selectedChamber = selectedWarehouse?.chambers?.find((c: any) => c.chamberNo === parseInt(chamberNo));
  const selectedFloor = selectedChamber?.floors?.find((f: any) => f.floorNo === parseInt(floorNo));
  const selectedStack = selectedFloor?.stacks?.find((s: any) => s.stackNo === parseInt(stackNo));

  useEffect(() => {
    if (!fetching && warehouseId && chamberNo && floorNo && stackNo) {
      if (transactionType === 'INWARD') {
        getStackAvailableCapacity(warehouseId, parseInt(chamberNo), parseInt(floorNo), parseInt(stackNo))
          .then(res => setAvailableCapacity(res.availableCapacity))
          .catch(() => setAvailableCapacity(null));
      }
    } else {
      setAvailableCapacity(null);
    }
  }, [warehouseId, chamberNo, floorNo, stackNo, fetching, transactionType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId || !commodityId || !warehouseId || !chamberNo || !floorNo || !stackNo) {
      toast.error(t('common.error') || 'Please fill required fields');
      return;
    }
    
    setLoading(true);
    try {
      const payload = {
        date,
        clientId,
        commodityId,
        warehouseId,
        chamberNo: parseInt(chamberNo),
        floorNo: parseInt(floorNo),
        stackNo: parseInt(stackNo),
        quantityKg: calcNetWeight,
        bagsCount: Number(bagsCount) || 0,
        grade: autoGradingType === 'Grading' ? grade : undefined,
        gradingType: autoGradingType || undefined,
        seed,
        tableLabel,
        jin: Number(jin) || 0,
        mixed: Number(mixed) || 0,
        ...(transactionType === 'OUTWARD' && { plusMinus: Number(plusMinus) || 0 }),
        totalBags: calcTotalBags,
        truckNo,
        farmerName,
        weighbridgeSlipNo,
        grossWeight: Number(grossWeight) || 0,
        emptyWeight: Number(emptyWeight) || 0,
        kataBharati: calcKataBharati,
        marko,
        remarks,
        note,
      };

      const res = await updateColdTransaction(transactionId, transactionType, payload);

      if (res.success) {
        toast.success(t('common.success') || 'Transaction updated successfully');
        onSuccess();
        onClose();
      } else {
        toast.error(res.error || 'Failed to update transaction');
      }
    } catch (err) {
      toast.error(t('common.error') || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-white text-slate-900">
        <DialogHeader>
          <DialogTitle>Edit {transactionType} Transaction</DialogTitle>
        </DialogHeader>

        {fetching ? (
          <div className="py-10 text-center text-slate-500">Loading data...</div>
        ) : txnData?.hasOutward && transactionType === 'INWARD' ? (
          <div className="p-4 bg-rose-50 text-rose-700 rounded border border-rose-200">
            Cannot edit this Inward transaction because an Outward transaction has already been recorded against it.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('inward.date') || 'Date'}</label>
                <Input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Client</label>
                <Select value={clientId} onValueChange={setClientId} required disabled>
                  <SelectTrigger><SelectValue placeholder="Select Client" /></SelectTrigger>
                  <SelectContent>
                    {clients.map(c => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('inward.farmerName') || 'Farmer Name'}</label>
                <Input value={farmerName} onChange={(e) => setFarmerName(e.target.value)} />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Commodity</label>
                <Select value={commodityId} onValueChange={setCommodityId} required disabled>
                  <SelectTrigger><SelectValue placeholder="Select Commodity" /></SelectTrigger>
                  <SelectContent>
                    {commodities.map(c => (
                      <SelectItem key={c._id} value={c._id}>{c.name} ({c.type})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded border">
              <div className="space-y-2">
                <label className="text-sm font-medium">Warehouse</label>
                <Select value={warehouseId} onValueChange={setWarehouseId} required disabled>
                  <SelectTrigger><SelectValue placeholder="Select Warehouse" /></SelectTrigger>
                  <SelectContent>
                    {warehouses.map(w => <SelectItem key={w._id} value={w._id}>{w.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Chamber No.</label>
                <Select value={chamberNo} onValueChange={setChamberNo} disabled required>
                  <SelectTrigger><SelectValue placeholder="Chamber" /></SelectTrigger>
                  <SelectContent>
                    {selectedWarehouse?.chambers?.map((c: any) => (
                      <SelectItem key={c.chamberNo} value={c.chamberNo.toString()}>{c.chamberNo}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Floor No.</label>
                <Select value={floorNo} onValueChange={setFloorNo} disabled required>
                  <SelectTrigger><SelectValue placeholder="Floor" /></SelectTrigger>
                  <SelectContent>
                    {selectedChamber?.floors?.map((f: any) => (
                      <SelectItem key={f.floorNo} value={f.floorNo.toString()}>{f.floorNo}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Stack No.</label>
                <Select value={stackNo} onValueChange={setStackNo} disabled required>
                  <SelectTrigger><SelectValue placeholder="Stack" /></SelectTrigger>
                  <SelectContent>
                    {selectedFloor?.stacks?.map((s: any) => (
                      <SelectItem key={s.stackNo} value={s.stackNo.toString()}>{s.stackNo}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Truck No.</label>
                <Input value={truckNo} onChange={(e) => setTruckNo(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Slip No.</label>
                <Input value={weighbridgeSlipNo} onChange={(e) => setWeighbridgeSlipNo(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Seed</label>
                <Input value={seed} onChange={(e) => setSeed(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Table/Label</label>
                <Input value={tableLabel} onChange={(e) => setTableLabel(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {transactionType === 'OUTWARD' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-blue-600">Net Weight Loss(Kg)</label>
                  <ColdNumberInput value={plusMinus ?? ''} onChange={(val) => setPlusMinus(val)} />
                </div>
              )}
              <div className="space-y-2">
                <label className="text-sm font-medium text-blue-600">Gross Weight (Kg)</label>
                <ColdNumberInput required min="0" step="0.01" value={grossWeight ?? ''} onChange={(val) => setGrossWeight(val ? Number(val) : null)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-orange-600">Empty Weight</label>
                <ColdNumberInput min="0" step="0.01" value={emptyWeight ?? ''} onChange={(val) => setEmptyWeight(val ? Number(val) : null)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-green-700">Net Weight</label>
                <div className="px-3 py-2 border rounded-md bg-slate-100 text-slate-700 font-bold">{calcNetWeight.toFixed(2)}</div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Kata Bharati</label>
                <div className="px-3 py-2 border rounded-md bg-slate-100 text-slate-700 font-bold">{calcKataBharati.toFixed(2)}</div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Marko</label>
                <Input value={marko} onChange={(e) => setMarko(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-blue-600">Bags Count (Large)</label>
                <ColdNumberInput required min="0" value={bagsCount ?? ''} onChange={(val) => setBagsCount(val ? Number(val) : null)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-blue-600">Jin (Small)</label>
                <ColdNumberInput min="0" value={jin ?? ''} onChange={(val) => setJin(val ? Number(val) : null)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-blue-600">{t('inward.mixed') || 'Mixed'}</label>
                <ColdNumberInput min="0" value={mixed ?? ''} onChange={(val) => setMixed(val ? Number(val) : null)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-green-700">Total Bags</label>
                <div className="px-3 py-2 border rounded-md bg-slate-100 text-slate-700 font-bold">{calcTotalBags}</div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{t('inward.remarks') || 'Remarks'}</label>
              <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{t('inward.note') || 'Note'}</label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}