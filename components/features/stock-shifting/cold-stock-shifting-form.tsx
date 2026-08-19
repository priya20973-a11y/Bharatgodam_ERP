'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createColdStockShifting, getAvailableInwardsForShifting, getFloorStackCapacities, ISourceAllocInput, IDestAllocInput } from '@/app/actions/cold-stock-shifting-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ColdNumberInput } from '@/components/ui/cold-number-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'react-hot-toast';
import { useColdTranslation } from '@/components/providers/cold-language-provider';
import { ArrowRightLeft, Loader2, Plus, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react';

interface ColdStockShiftingFormProps {
  clients: any[];
  warehouses: any[];
  onSuccess?: () => void;
}

interface SelectedSourceState extends ISourceAllocInput {
  key: string;
  floorName?: string;
  maxWeight: number;
  maxBags: number;
  selected: boolean;
}

interface DestRowState {
  id: string;
  warehouseId: string;
  chamberName: string;
  chamberNo?: number;
  floorNo: number | '';
  floorName?: string;
  stackNo: number | '';
  allocatedWeight: number | null;
  bagsCount: number | null;
}

const resolveFloorName = (warehouse: any, chamberNameOrNo: any, floorNo: any): string => {
  if (!warehouse || !warehouse.chambers) return floorNo ? String(floorNo) : '';
  const cClean = String(chamberNameOrNo || '').toLowerCase().replace(/^chamber\s*/i, '').trim();
  const chamber = warehouse.chambers.find((c: any) => {
    const nameClean = String(c.name || c.chamberNo || '').toLowerCase().replace(/^chamber\s*/i, '').trim();
    return nameClean === cClean || c.name === chamberNameOrNo || c.chamberNo === Number(chamberNameOrNo);
  });
  if (!chamber || !chamber.floors) return floorNo ? String(floorNo) : '';
  const floor = chamber.floors.find((f: any) => f.floorNo === Number(floorNo) || String(f.name) === String(floorNo));
  return floor?.name || (floorNo ? String(floorNo) : '');
};

const getFloorLabel = (warehouse: any, chamberNameOrNo: any, floorNo: any, floorName?: string): string => {
  const name = floorName || resolveFloorName(warehouse, chamberNameOrNo, floorNo);
  if (!name) return floorNo ? `Floor ${floorNo}` : 'Floor';
  return isNaN(Number(name)) ? name : `Floor ${name}`;
};

export default function ColdStockShiftingForm({ clients, warehouses, onSuccess }: ColdStockShiftingFormProps) {
  const { t } = useColdTranslation();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // Selection states
  const [clientId, setClientId] = useState('');
  const [availableInwards, setAvailableInwards] = useState<any[]>([]);
  const [loadingInwards, setLoadingInwards] = useState(false);

  const [selectedInwardId, setSelectedInwardId] = useState('');
  const [selectedInward, setSelectedInward] = useState<any | null>(null);

  // Multi-Source Stack States
  const [sourceRows, setSourceRows] = useState<SelectedSourceState[]>([]);

  // Multi-Destination Stack States
  const [destRows, setDestRows] = useState<DestRowState[]>([
    {
      id: 'dest_1',
      warehouseId: '',
      chamberName: '',
      chamberNo: undefined,
      floorNo: '',
      stackNo: '',
      allocatedWeight: null,
      bagsCount: null,
    },
  ]);

  // Store capacities for selected destination floors
  const [floorCapacitiesMap, setFloorCapacitiesMap] = useState<Record<string, Record<number, { capacity: number; usedCapacity: number; availableCapacity: number }>>>({});

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [remarks, setRemarks] = useState('');
  const [note, setNote] = useState('');

  // Fetch capacities when destination warehouse/chamber/floor changes
  useEffect(() => {
    destRows.forEach((row) => {
      if (row.warehouseId && row.chamberName && row.floorNo) {
        const key = `${row.warehouseId}_${row.chamberName}_${row.floorNo}`;
        if (!floorCapacitiesMap[key]) {
          getFloorStackCapacities(row.warehouseId, row.chamberName, Number(row.floorNo)).then((caps) => {
            if (caps) {
              setFloorCapacitiesMap((prev) => ({ ...prev, [key]: caps }));
            }
          });
        }
      }
    });
  }, [destRows]);

  // Fetch inwards when client changes
  useEffect(() => {
    if (clientId) {
      setLoadingInwards(true);
      getAvailableInwardsForShifting(clientId)
        .then((res) => {
          setAvailableInwards(res || []);
          setSelectedInwardId('');
          setSelectedInward(null);
          setSourceRows([]);
        })
        .finally(() => setLoadingInwards(false));
    } else {
      setAvailableInwards([]);
      setSelectedInwardId('');
      setSelectedInward(null);
      setSourceRows([]);
    }
  }, [clientId]);

  // When inward changes, initialize source stacks
  useEffect(() => {
    if (selectedInwardId) {
      const inw = availableInwards.find((i) => i._id === selectedInwardId);
      setSelectedInward(inw || null);

      if (inw && inw.stackAllocations) {
        const defaultWId = inw.warehouseId?._id || inw.warehouseId || '';

        // Default first destination warehouse to inward's warehouse
        setDestRows([
          {
            id: 'dest_1',
            warehouseId: defaultWId,
            chamberName: '',
            chamberNo: undefined,
            floorNo: '',
            stackNo: '',
            allocatedWeight: null,
            bagsCount: null,
          },
        ]);

        const whObj = warehouses.find((w: any) => w._id === defaultWId);

        const sources: SelectedSourceState[] = inw.stackAllocations
          .filter((alloc: any) => (alloc.allocatedWeight || 0) > 0)
          .map((alloc: any, idx: number) => {
            const key = `${alloc.chamberName}_${alloc.floorNo}_${alloc.stackNo}_${idx}`;
            const flName = alloc.floorName || resolveFloorName(whObj, alloc.chamberName || alloc.chamberNo, alloc.floorNo);
            return {
              key,
              warehouseId: defaultWId,
              chamberName: alloc.chamberName,
              chamberNo: alloc.chamberNo,
              floorNo: alloc.floorNo,
              floorName: flName,
              stackNo: alloc.stackNo,
              shiftWeight: alloc.allocatedWeight || 0,
              shiftBags: alloc.bagsCount || 0,
              maxWeight: alloc.allocatedWeight || 0,
              maxBags: alloc.bagsCount || 0,
              selected: true, // Default all stacks selected
            };
          });

        setSourceRows(sources);
      } else {
        setSourceRows([]);
      }
    } else {
      setSelectedInward(null);
      setSourceRows([]);
    }
  }, [selectedInwardId, availableInwards]);

  // Source selection handlers
  const handleToggleSourceSelect = (key: string, checked: boolean) => {
    setSourceRows((prev) =>
      prev.map((row) => {
        if (row.key === key) {
          return {
            ...row,
            selected: checked,
            shiftWeight: checked ? row.maxWeight : 0,
            shiftBags: checked ? row.maxBags : 0,
          };
        }
        return row;
      })
    );
  };

  const handleSourceFieldChange = (key: string, field: 'shiftWeight' | 'shiftBags', val: number) => {
    setSourceRows((prev) =>
      prev.map((row) => {
        if (row.key === key) {
          const clamped = field === 'shiftWeight' ? Math.min(val, row.maxWeight) : Math.min(val, row.maxBags);
          return { ...row, [field]: clamped };
        }
        return row;
      })
    );
  };

  // Destination row handlers
  const handleAddDestRow = () => {
    const defaultWId = selectedInward?.warehouseId?._id || selectedInward?.warehouseId || (warehouses[0]?._id || '');
    setDestRows((prev) => [
      ...prev,
      {
        id: `dest_${Date.now()}_${Math.random()}`,
        warehouseId: defaultWId,
        chamberName: '',
        chamberNo: undefined,
        floorNo: '',
        stackNo: '',
        allocatedWeight: null,
        bagsCount: null,
      },
    ]);
  };

  const handleRemoveDestRow = (id: string) => {
    if (destRows.length <= 1) return;
    setDestRows((prev) => prev.filter((r) => r.id !== id));
  };

  const handleDestFieldChange = (id: string, field: string, value: any) => {
    setDestRows((prev) =>
      prev.map((row) => {
        if (row.id === id) {
          if (field === 'chamberName') {
            const wh = warehouses.find((w) => w._id === row.warehouseId);
            const chObj = wh?.chambers?.find((c: any) => c.name === value || c.chamberNo === parseInt(value));
            return {
              ...row,
              chamberName: value,
              chamberNo: chObj?.chamberNo,
              floorNo: '',
              stackNo: '',
            };
          }
          if (field === 'floorNo') {
            return { ...row, floorNo: value ? Number(value) : '', stackNo: '' };
          }
          if (field === 'warehouseId') {
            return { ...row, warehouseId: value, chamberName: '', chamberNo: undefined, floorNo: '', stackNo: '' };
          }
          return { ...row, [field]: value };
        }
        return row;
      })
    );
  };

  // Calculate Totals & Capacities
  const getEffectiveAvailCap = (targetRowId: string, warehouseId: string, chamberName: string, floorNo: any, stackNo: any) => {
    if (!warehouseId || !chamberName || !floorNo || !stackNo) return 1000;
    const key = `${warehouseId}_${chamberName}_${floorNo}`;
    const baseCap = floorCapacitiesMap[key]?.[Number(stackNo)]?.availableCapacity ?? 1000;
    
    const otherAllocations = destRows
      .filter((r) => r.id !== targetRowId && r.warehouseId === warehouseId && r.chamberName === chamberName && String(r.floorNo) === String(floorNo) && String(r.stackNo) === String(stackNo))
      .reduce((sum, r) => sum + Number(r.allocatedWeight || 0), 0);

    return Math.max(0, baseCap - otherAllocations);
  };

  const hasCapExceeded = destRows.some((r) => {
    if (!r.warehouseId || !r.chamberName || !r.floorNo || !r.stackNo || !r.allocatedWeight) return false;
    const effCap = getEffectiveAvailCap(r.id, r.warehouseId, r.chamberName, r.floorNo, r.stackNo);
    return Number(r.allocatedWeight) > effCap;
  });

  const selectedSources = sourceRows.filter((r) => r.selected);
  const totalSourceWeight = selectedSources.reduce((acc, r) => acc + Number(r.shiftWeight || 0), 0);
  const totalSourceBags = selectedSources.reduce((acc, r) => acc + Number(r.shiftBags || 0), 0);

  const totalDestWeight = destRows.reduce((acc, r) => acc + Number(r.allocatedWeight || 0), 0);
  const totalDestBags = destRows.reduce((acc, r) => acc + Number(r.bagsCount || 0), 0);

  const isWeightMatch = Math.abs(totalSourceWeight - totalDestWeight) < 0.01 && totalSourceWeight > 0;
  const isBagsMatch = totalSourceBags === totalDestBags;
  const isBalanced = isWeightMatch && isBagsMatch && !hasCapExceeded;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!clientId || !selectedInwardId) {
      toast.error('Please select Client and Inward Receipt.');
      return;
    }

    if (selectedSources.length === 0) {
      toast.error('Please select at least one source stack.');
      return;
    }

    if (!isBalanced) {
      toast.error('Source totals and Destination totals must match exactly.');
      return;
    }

    // Validate dest rows complete
    for (let idx = 0; idx < destRows.length; idx++) {
      const d = destRows[idx];
      if (!d.warehouseId || !d.chamberName || !d.floorNo || !d.stackNo || !d.allocatedWeight || d.allocatedWeight <= 0) {
        toast.error(`Destination Row ${idx + 1} is incomplete. Please select location and valid weight.`);
        return;
      }
    }

    const payloadSources: ISourceAllocInput[] = selectedSources.map((s) => {
      const wh = warehouses.find((w) => w._id === s.warehouseId);
      const flName = s.floorName || resolveFloorName(wh, s.chamberName || s.chamberNo, s.floorNo);
      return {
        warehouseId: s.warehouseId,
        chamberName: s.chamberName,
        chamberNo: s.chamberNo,
        floorNo: s.floorNo,
        floorName: flName,
        stackNo: s.stackNo,
        shiftWeight: Number(s.shiftWeight),
        shiftBags: Number(s.shiftBags),
      };
    });

    const payloadDests: IDestAllocInput[] = destRows.map((d) => {
      const wh = warehouses.find((w) => w._id === d.warehouseId);
      const flName = d.floorName || resolveFloorName(wh, d.chamberName || d.chamberNo, d.floorNo);
      return {
        warehouseId: d.warehouseId,
        chamberName: d.chamberName,
        chamberNo: d.chamberNo,
        floorNo: Number(d.floorNo),
        floorName: flName,
        stackNo: Number(d.stackNo),
        allocatedWeight: Number(d.allocatedWeight),
        bagsCount: Number(d.bagsCount || 0),
      };
    });

    setLoading(true);
    try {
      const res = await createColdStockShifting({
        date,
        clientId,
        inwardId: selectedInwardId,
        sourceAllocations: payloadSources,
        destAllocations: payloadDests,
        remarks,
        note,
      });

      if (res.success) {
        toast.success(res.message || 'Internal stock shifted successfully.');
        if (onSuccess) {
          onSuccess();
        } else {
          router.push('/cold/stock-shifting');
        }
      } else {
        toast.error(res.error || 'Failed to shift stock.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-indigo-600" />
            Internal Stock Shifting
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Relocate stock across multiple source and destination stacks in a single receipt without changing client ownership.
          </p>
        </div>
      </div>

      {/* Client & Inward Selection */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700">{t('outward.clientName')} *</label>
          <Select value={clientId} onValueChange={setClientId} required>
            <SelectTrigger className="bg-white"><SelectValue placeholder="Select Client" /></SelectTrigger>
            <SelectContent>
              {clients.map((c) => (
                <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700">Select Active Inward Receipt *</label>
          <Select value={selectedInwardId} onValueChange={setSelectedInwardId} disabled={!clientId || loadingInwards} required>
            <SelectTrigger className="bg-white">
              <SelectValue placeholder={loadingInwards ? "Loading stock..." : (availableInwards.length === 0 ? "No active stock available" : "Select Receipt")} />
            </SelectTrigger>
            <SelectContent>
              {availableInwards.map((inw) => (
                <SelectItem key={inw._id} value={inw._id}>
                  {new Date(inw.date).toLocaleDateString('en-GB')} - {inw.commodityId?.name} ({inw.weighbridgeSlipNo || `INW-${inw._id.slice(-6).toUpperCase()}`}) - {inw.quantityKg} {inw.unit || 'KG'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedInward && (
        <>
          {/* Multi-Source Stacks Section */}
          <div className="p-4 rounded-lg border border-rose-200 bg-rose-50/30 space-y-4">
            <div className="flex items-center justify-between border-b border-rose-200 pb-2">
              <div>
                <span className="font-bold text-sm text-rose-900 uppercase tracking-wider">
                  Source Stacks (From)
                </span>
                <span className="text-xs text-rose-600 ml-2 font-normal">
                  (Select source stacks and specify quantities to shift)
                </span>
              </div>
              <div className="text-xs font-bold text-rose-800 bg-rose-100 px-3 py-1 rounded-full border border-rose-300">
                Total Source: {totalSourceWeight.toFixed(2)} KG ({totalSourceBags} Bags)
              </div>
            </div>

            <div className="space-y-3">
              {sourceRows.map((src) => {
                const displayChamber = src.chamberName || (src.chamberNo ? `Chamber ${src.chamberNo}` : 'Chamber');
                const wh = warehouses.find((w) => w._id === src.warehouseId);
                const displayFloor = getFloorLabel(wh, src.chamberName || src.chamberNo, src.floorNo, src.floorName);
                return (
                  <div
                    key={src.key}
                    className={`p-3 rounded-md border transition-all ${
                      src.selected ? 'bg-white border-rose-300 shadow-sm' : 'bg-slate-50/60 border-slate-200 opacity-60'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center space-x-3">
                        <input
                          type="checkbox"
                          id={`src-${src.key}`}
                          checked={src.selected}
                          onChange={(e) => handleToggleSourceSelect(src.key, e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                        />
                        <label htmlFor={`src-${src.key}`} className="cursor-pointer select-none">
                          <span className="font-bold text-slate-900 text-sm">
                            {displayChamber} / {displayFloor} / Stack {src.stackNo}
                          </span>
                          <span className="text-xs text-slate-500 ml-2">
                            (Available: <strong className="text-rose-700">{src.maxWeight} KG</strong>, <strong className="text-rose-700">{src.maxBags} Bags</strong>)
                          </span>
                        </label>
                      </div>

                      {src.selected && (
                        <div className="flex items-center gap-3 pl-7 sm:pl-0">
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="font-semibold text-slate-600">Shift KG:</span>
                            <ColdNumberInput
                              min="0"
                              max={src.maxWeight}
                              step="0.01"
                              className="w-28 h-8 text-xs bg-white border-rose-300"
                              value={src.shiftWeight ?? ''}
                              onChange={(val) => handleSourceFieldChange(src.key, 'shiftWeight', Number(val || 0))}
                            />
                          </div>

                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="font-semibold text-slate-600">Bags:</span>
                            <ColdNumberInput
                              min="0"
                              max={src.maxBags}
                              className="w-20 h-8 text-xs bg-white border-rose-300"
                              value={src.shiftBags ?? ''}
                              onChange={(val) => handleSourceFieldChange(src.key, 'shiftBags', Number(val || 0))}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Multi-Destination Stacks Section */}
          <div className="p-4 rounded-lg border border-emerald-200 bg-emerald-50/30 space-y-4">
            <div className="flex items-center justify-between border-b border-emerald-200 pb-2">
              <div>
                <span className="font-bold text-sm text-emerald-900 uppercase tracking-wider">
                  Destination Stacks (To)
                </span>
                <span className="text-xs text-emerald-600 ml-2 font-normal">
                  (Distribute shifted stock into destination stacks)
                </span>
              </div>
              <div className="text-xs font-bold text-emerald-800 bg-emerald-100 px-3 py-1 rounded-full border border-emerald-300">
                Total Destination: {totalDestWeight.toFixed(2)} KG ({totalDestBags} Bags)
              </div>
            </div>

            <div className="space-y-3">
              {destRows.map((row, idx) => {
                const wh = warehouses.find((w) => w._id === row.warehouseId);
                const chambers = wh?.chambers || [];
                const chObj = chambers.find((c: any) => c.name === row.chamberName || c.chamberNo === parseInt(row.chamberName));
                const floors = chObj?.floors || [];
                const flObj = floors.find((f: any) => f.floorNo === Number(row.floorNo));
                const stacks = flObj?.stacks || [];

                return (
                  <div key={row.id} className="p-3 bg-white rounded-md border border-emerald-200 shadow-sm space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <span className="text-xs font-bold text-emerald-800">
                        Destination Stack #{idx + 1}
                      </span>
                      {destRows.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveDestRow(row.id)}
                          className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                      <div className="space-y-1 md:col-span-2">
                        <label className="text-xs font-semibold text-slate-600">Warehouse *</label>
                        <Select
                          value={row.warehouseId}
                          onValueChange={(val) => handleDestFieldChange(row.id, 'warehouseId', val)}
                        >
                          <SelectTrigger className="h-9 text-xs bg-white"><SelectValue placeholder="Warehouse" /></SelectTrigger>
                          <SelectContent>
                            {warehouses.map((w: any) => (
                              <SelectItem key={w._id} value={w._id}>{w.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-600">Chamber *</label>
                        <Select
                          value={row.chamberName}
                          onValueChange={(val) => handleDestFieldChange(row.id, 'chamberName', val)}
                          disabled={!row.warehouseId}
                        >
                          <SelectTrigger className="h-9 text-xs bg-white"><SelectValue placeholder="Chamber" /></SelectTrigger>
                          <SelectContent>
                            {chambers.map((c: any) => (
                              <SelectItem key={c.name} value={c.name}>{c.name || `Chamber ${c.chamberNo}`}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-600">Floor *</label>
                        <Select
                          value={row.floorNo.toString()}
                          onValueChange={(val) => handleDestFieldChange(row.id, 'floorNo', val)}
                          disabled={!row.chamberName}
                        >
                          <SelectTrigger className="h-9 text-xs bg-white"><SelectValue placeholder="Floor" /></SelectTrigger>
                          <SelectContent>
                            {floors.map((f: any) => {
                              const flDisplay = f.name || (f.floorNo ? `Floor ${f.floorNo}` : 'Floor');
                              return (
                                <SelectItem key={f.floorNo} value={f.floorNo.toString()}>
                                  {flDisplay}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-600">Stack *</label>
                        <Select
                          value={row.stackNo.toString()}
                          onValueChange={(val) => handleDestFieldChange(row.id, 'stackNo', val)}
                          disabled={!row.floorNo}
                        >
                          <SelectTrigger className="h-9 text-xs bg-white"><SelectValue placeholder="Stack" /></SelectTrigger>
                          <SelectContent>
                            {stacks.map((s: any) => {
                              const effCap = getEffectiveAvailCap(row.id, row.warehouseId, row.chamberName, row.floorNo, s.stackNo);
                              return (
                                <SelectItem key={s.stackNo} value={s.stackNo.toString()}>
                                  Stack {s.stackNo} — Available: {effCap.toFixed(0)} KG
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-600">Weight (KG) *</label>
                        <ColdNumberInput
                          min="0.01"
                          step="0.01"
                          className={`h-9 text-xs bg-white ${
                            row.stackNo && getEffectiveAvailCap(row.id, row.warehouseId, row.chamberName, row.floorNo, row.stackNo) < (row.allocatedWeight || 0)
                              ? 'border-rose-500 focus:ring-rose-500 text-rose-700'
                              : 'border-emerald-300'
                          }`}
                          value={row.allocatedWeight ?? ''}
                          onChange={(val) => handleDestFieldChange(row.id, 'allocatedWeight', val ? Number(val) : null)}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-6 gap-3 pt-1">
                      <div className="space-y-1 md:col-start-6">
                        <label className="text-xs font-semibold text-slate-600">Bags *</label>
                        <ColdNumberInput
                          min="0"
                          className="h-9 text-xs bg-white border-emerald-300"
                          value={row.bagsCount ?? ''}
                          onChange={(val) => handleDestFieldChange(row.id, 'bagsCount', val ? Number(val) : null)}
                        />
                      </div>
                    </div>

                    {row.stackNo && (
                      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-emerald-50/70 rounded-md border border-emerald-200 text-xs mt-2">
                        <span className="text-slate-600 font-medium">
                          Selected Stack: <strong className="text-slate-900 font-bold">Stack {row.stackNo}</strong>
                        </span>
                        {(() => {
                          const effCap = getEffectiveAvailCap(row.id, row.warehouseId, row.chamberName, row.floorNo, row.stackNo);
                          const totalConfigCap = floorCapacitiesMap[`${row.warehouseId}_${row.chamberName}_${row.floorNo}`]?.[Number(row.stackNo)]?.capacity || 1000;
                          const isExceeded = (row.allocatedWeight || 0) > effCap;
                          return (
                            <div className="flex items-center gap-3">
                              <span className="text-slate-600">
                                Total Capacity: <strong className="text-slate-800">{totalConfigCap.toFixed(0)} KG</strong>
                              </span>
                              <span className="text-slate-600">
                                Available: <strong className={isExceeded ? 'text-rose-600 font-bold' : 'text-emerald-700 font-bold'}>
                                  {effCap.toFixed(2)} KG
                                </strong>
                              </span>
                              {isExceeded && (
                                <span className="text-rose-600 font-bold bg-rose-100 px-2 py-0.5 rounded text-[11px] border border-rose-200">
                                  ⚠️ Exceeds Available Capacity
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                );
              })}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddDestRow}
                className="mt-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50 text-xs font-semibold flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5 text-emerald-600" />
                Add Destination Stack
              </Button>
            </div>
          </div>

          {/* Live Balance Match Indicator Banner */}
          <div
            className={`p-4 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-semibold ${
              isBalanced
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                : 'bg-amber-50 border-amber-300 text-amber-900'
            }`}
          >
            <div className="flex items-center space-x-2">
              {isBalanced ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
              )}
              <div>
                {isBalanced ? (
                  <span>✓ Stock Quantity, Bags, and Stack Capacities are perfectly balanced. Ready to confirm shifting!</span>
                ) : hasCapExceeded ? (
                  <span className="text-rose-700 font-bold">
                    ⚠️ Stack Capacity Exceeded! One or more destination stack weights exceed available stack capacity.
                  </span>
                ) : (
                  <span>
                    ⚠️ Mismatch detected! Total Source ({totalSourceWeight.toFixed(2)} KG, {totalSourceBags} Bags) must equal Total Destination ({totalDestWeight.toFixed(2)} KG, {totalDestBags} Bags).
                  </span>
                )}
              </div>
            </div>

            <div className="shrink-0 text-right">
              <div>Weight Diff: <strong className={Math.abs(totalSourceWeight - totalDestWeight) < 0.01 ? 'text-emerald-700' : 'text-rose-700'}>{(totalSourceWeight - totalDestWeight).toFixed(2)} KG</strong></div>
              <div>Bags Diff: <strong className={totalSourceBags === totalDestBags ? 'text-emerald-700' : 'text-rose-700'}>{totalSourceBags - totalDestBags} Bags</strong></div>
            </div>
          </div>

          {/* Date, Remarks & Note */}
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Shifting Date *</label>
              <Input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="bg-white"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Remarks</label>
              <Input
                placeholder="Optional remarks"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="bg-white"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Note</label>
              <Input
                placeholder="Optional note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="bg-white"
              />
            </div>
          </div>
        </>
      )}

      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/cold/stock-shifting')}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={loading || !selectedInward || selectedSources.length === 0 || !isBalanced}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold flex items-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
          Confirm & Shift Stock
        </Button>
      </div>
    </form>
  );
}
