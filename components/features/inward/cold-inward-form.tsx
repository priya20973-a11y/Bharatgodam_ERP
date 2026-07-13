'use client';

import { useState, useEffect } from 'react';
import { createColdInward, getStackAvailableCapacity } from '@/app/actions/cold-inward-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ColdNumberInput } from '@/components/ui/cold-number-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'react-hot-toast';
import { useColdTranslation } from '@/components/providers/cold-language-provider';

interface ColdInwardFormProps {
  clients: any[];
  commodities: any[];
  warehouses: any[];
  onSuccess: () => void;
  prefillData?: { [key: string]: string | undefined };
}

export default function ColdInwardForm({ clients, commodities, warehouses, onSuccess, prefillData }: ColdInwardFormProps) {
  const { t } = useColdTranslation();
  const [loading, setLoading] = useState(false);

  const [clientId, setClientId] = useState('');
  const [farmerName, setFarmerName] = useState('');
  const [commodityId, setCommodityId] = useState('');
  const [grade, setGrade] = useState('');
  const [warehouseId, setWarehouseId] = useState(prefillData?.warehouseId || '');
  const [chamberNo, setChamberNo] = useState(prefillData?.chamberNo || '');
  const [floorNo, setFloorNo] = useState(prefillData?.floorNo || '');
  const [stackNo, setStackNo] = useState(prefillData?.stackNo || '');

  const [quantityKg, setQuantityKg] = useState<number | null>(null); // Old state, no longer strictly used as input
  const [bagsCount, setBagsCount] = useState<number | null>(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  const [seed, setSeed] = useState('');
  const [tableLabel, setTableLabel] = useState('');
  const [jin, setJin] = useState<number | null>(null);
  const [mixed, setMixed] = useState<number | null>(null);
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
  const [selectedRefPersons, setSelectedRefPersons] = useState<number[]>([]);

  const selectedCommodity = commodities.find(c => c._id === commodityId);
  const autoGradingType = selectedCommodity?.gradingType || '';

  const selectedWarehouse = warehouses.find(w => w._id === warehouseId);
  const selectedChamber = selectedWarehouse?.chambers?.find((c: any) => c.chamberNo === parseInt(chamberNo));
  const selectedFloor = selectedChamber?.floors?.find((f: any) => f.floorNo === parseInt(floorNo));
  const selectedStack = selectedFloor?.stacks?.find((s: any) => s.stackNo === parseInt(stackNo));

  useEffect(() => {
    // Reset dependent fields when parent changes if they don't match prefill
    if (!prefillData?.warehouseId || warehouseId !== prefillData.warehouseId) {
      setChamberNo('');
      setFloorNo('');
      setStackNo('');
      setAvailableCapacity(null);
      setSelectedRefPersons([]);
    }
  }, [warehouseId]);

  useEffect(() => {
    if (!prefillData?.chamberNo || chamberNo !== prefillData.chamberNo) {
      setFloorNo('');
      setStackNo('');
      setAvailableCapacity(null);
    }
  }, [chamberNo]);

  useEffect(() => {
    if (!prefillData?.floorNo || floorNo !== prefillData.floorNo) {
      setStackNo('');
      setAvailableCapacity(null);
    }
  }, [floorNo]);

  useEffect(() => {
    if (warehouseId && chamberNo && floorNo && stackNo) {
      // Fetch available capacity
      getStackAvailableCapacity(warehouseId, parseInt(chamberNo), parseInt(floorNo), parseInt(stackNo))
        .then(res => setAvailableCapacity(res.availableCapacity))
        .catch(err => {
          console.error(err);
          setAvailableCapacity(null);
        });
    } else {
      setAvailableCapacity(null);
    }
  }, [warehouseId, chamberNo, floorNo, stackNo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId || !commodityId || !warehouseId || !chamberNo || !floorNo || !stackNo) {
      toast.error(t('inward.fillRequired'));
      return;
    }

    if (availableCapacity !== null && calcNetWeight > availableCapacity) {
      toast.error(t('inward.quantityExceeds').replace('{capacity}', availableCapacity.toString()));
      return;
    }

    setLoading(true);
    try {
      const res = await createColdInward({
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
        referencePersons: selectedRefPersons.map(i => selectedWarehouse?.referencePersons?.[i]).filter(Boolean),
        date
      });

      if (res.success) {
        toast.success(t('inward.inwardCreated'));
        onSuccess();
      } else {
        toast.error(res.error || t('inward.saveFailed'));
      }
    } catch (err) {
      toast.error(t('inward.somethingWentWrong'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-6 border rounded-lg bg-slate-50">
      <h3 className="font-semibold text-lg border-b pb-2">{t('inward.newTransaction')}</h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('inward.date')}</label>
          <Input
            required
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">{t('inward.clientName')}</label>
          <Select value={clientId} onValueChange={setClientId} required>
            <SelectTrigger><SelectValue placeholder={t('inward.selectClient')} /></SelectTrigger>
            <SelectContent>
              {clients.map(c => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">{t('inward.farmerName')}</label>
          <Input
            value={farmerName}
            onChange={(e) => setFarmerName(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">{t('inward.commodityVariety')}</label>
          <Select value={commodityId} onValueChange={setCommodityId} required>
            <SelectTrigger><SelectValue placeholder={t('inward.selectCommodity')} /></SelectTrigger>
            <SelectContent>
              {commodities.map(c => (
                <SelectItem key={c._id} value={c._id}>{c.name} ({c.type})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {autoGradingType && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-500">{t('inward.gradingType')}</label>
            <div className="px-3 py-2 border rounded-md bg-slate-100 text-slate-700 font-medium">
              {autoGradingType}
            </div>
          </div>
        )}

      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white p-4 rounded border">
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('inward.warehouse')}</label>
          <Select value={warehouseId} onValueChange={setWarehouseId} required>
            <SelectTrigger><SelectValue placeholder={t('inward.selectWarehouse')} /></SelectTrigger>
            <SelectContent>
              {warehouses.map(w => <SelectItem key={w._id} value={w._id}>{w.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">{t('inward.chamberNo')}</label>
          <Select value={chamberNo} onValueChange={setChamberNo} disabled={!warehouseId} required>
            <SelectTrigger><SelectValue placeholder={t('inward.selectChamber')} /></SelectTrigger>
            <SelectContent>
              {selectedWarehouse?.chambers?.map((c: any) => (
                <SelectItem key={c.chamberNo} value={c.chamberNo.toString()}>{t('inward.chamber')} {c.chamberNo}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">{t('inward.floorNo')}</label>
          <Select value={floorNo} onValueChange={setFloorNo} disabled={!chamberNo} required>
            <SelectTrigger><SelectValue placeholder={t('inward.selectFloor')} /></SelectTrigger>
            <SelectContent>
              {selectedChamber?.floors?.map((f: any) => (
                <SelectItem key={f.floorNo} value={f.floorNo.toString()}>{t('inward.floor')} {f.floorNo}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">{t('inward.stackNo')}</label>
          <Select value={stackNo} onValueChange={setStackNo} disabled={!floorNo} required>
            <SelectTrigger><SelectValue placeholder={t('inward.selectStack')} /></SelectTrigger>
            <SelectContent>
              {selectedFloor?.stacks?.map((s: any) => (
                <SelectItem key={s.stackNo} value={s.stackNo.toString()}>{t('inward.stack')} {s.stackNo}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {availableCapacity !== null && (
            <p className="text-xs text-blue-600 font-medium pt-1">
              {t('inward.availableCapacity').replace('{capacity}', availableCapacity.toLocaleString())}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('inward.truckNo')}</label>
          <Input
            value={truckNo}
            onChange={(e) => setTruckNo(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('inward.weighbridgeSlipNo')}</label>
          <Input
            value={weighbridgeSlipNo}
            onChange={(e) => setWeighbridgeSlipNo(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('inward.seed')}</label>
          <Input
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('inward.tableLabel')}</label>
          <Input
            value={tableLabel}
            onChange={(e) => setTableLabel(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-blue-600">{t('inward.quantityKg')}</label>
          <ColdNumberInput
            required
            min="0"
            step="0.01"
            value={grossWeight ?? ''}
            onChange={(val) => setGrossWeight(val ? Number(val) : null)}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-orange-600">{t('inward.emptyWeight')}</label>
          <ColdNumberInput
            min="0"
            step="0.01"
            value={emptyWeight ?? ''}
            onChange={(val) => setEmptyWeight(val ? Number(val) : null)}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-green-700">{t('inward.netWeight')}</label>
          <div className="px-3 py-2 border rounded-md bg-slate-100 text-slate-700 font-bold">
            {calcNetWeight.toFixed(2)}
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('inward.kataBharati')}</label>
          <div className="px-3 py-2 border rounded-md bg-slate-100 text-slate-700 font-bold">
            {calcKataBharati.toFixed(2)}
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('inward.marko')}</label>
          <Input
            value={marko}
            onChange={(e) => setMarko(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-blue-600">{t('inward.bagsCount')}</label>
          <ColdNumberInput
            required
            min="0"
            value={bagsCount ?? ''}
            onChange={(val) => setBagsCount(val ? Number(val) : null)}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-blue-600">{t('inward.jin')}</label>
          <ColdNumberInput
            min="0"
            value={jin ?? ''}
            onChange={(val) => setJin(val ? Number(val) : null)}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-blue-600">{t('inward.mixed')}</label>
          <ColdNumberInput
            min="0"
            value={mixed ?? ''}
            onChange={(val) => setMixed(val ? Number(val) : null)}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-green-700">{t('inward.totalBags')}</label>
          <div className="px-3 py-2 border rounded-md bg-slate-100 text-slate-700 font-bold">
            {calcTotalBags}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">{t('inward.remarks')}</label>
        <Input
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">{t('inward.note')}</label>
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <div className="space-y-2 pt-2 border-t">
        <label className="text-sm font-medium">{t('inward.refPersons')}</label>
        <div className="rounded-xl border border-slate-300 bg-white p-3 min-h-[80px]">
          {!selectedWarehouse ? (
            <p className="text-sm text-slate-500">{t('inward.selectWarehouseFirst')}</p>
          ) : !selectedWarehouse.referencePersons || selectedWarehouse.referencePersons.length === 0 ? (
            <p className="text-sm text-slate-500">{t('inward.noRefPersons')}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {selectedWarehouse.referencePersons.map((rp: any, idx: number) => {
                const selected = selectedRefPersons.includes(idx);
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setSelectedRefPersons(prev =>
                        prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
                      );
                    }}
                    className={`rounded-xl border px-3 py-2 text-sm transition flex flex-col items-start ${selected ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'}`}
                  >
                    <span className="font-medium">{rp.name}</span>
                    <span className={`text-xs ${selected ? 'text-indigo-200' : 'text-slate-500'}`}>{rp.mobile} • {rp.designation}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <p className="text-xs text-slate-500 mt-1">{t('inward.selectRefPersonsIfAny')}</p>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="submit" disabled={loading || availableCapacity === null}>
          {loading ? t('inward.saving') : t('inward.saveInward')}
        </Button>
      </div>
    </form>
  );
}
