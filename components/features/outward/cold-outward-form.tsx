'use client';

import { useState, useEffect, useRef } from 'react';
import { createBatchColdOutwards, getAvailableInwardsForClient } from '@/app/actions/cold-outward-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ColdNumberInput } from '@/components/ui/cold-number-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { toast } from 'react-hot-toast';
import { useColdTranslation } from '@/components/providers/cold-language-provider';
import { Trash2, ChevronDown, QrCode } from 'lucide-react';
import { getDynamicUnitLabel } from '@/lib/utils';
import { getColdInwardByQrId } from '@/app/actions/cold-inward-actions';
import QRScannerModal from './qr-scanner-modal';

const formatLocation = (alloc: any, inwardId: string) => {
  const chamber = alloc.chamberName || alloc.chamberNo;
  const floor = alloc.floorName || alloc.floorNo;
  const stack = alloc.stackName || alloc.stackNo;

  if (chamber === undefined && floor === undefined && stack === undefined) {
    console.warn(`[Cold Outward] Missing location data for inward ID: ${inwardId}`, alloc);
    return '-';
  }

  const formatPart = (val: any, prefix: string) => {
    if (val === undefined || val === null || val === 'undefined' || val === '') return '-';
    const strVal = String(val);
    if (prefix && !strVal.toUpperCase().startsWith(prefix)) {
      return `${prefix}${strVal}`;
    }
    return strVal;
  };

  const cStr = (chamber === undefined || chamber === null || chamber === 'undefined' || chamber === '') ? '-' : String(chamber);
  const fStr = formatPart(floor, 'F');
  const sStr = formatPart(stack, 'S');

  if (cStr === '-' && fStr === '-' && sStr === '-') {
    console.warn(`[Cold Outward] Missing location data for inward ID: ${inwardId}`, alloc);
    return '-';
  }

  return `${cStr}/${fStr}/${sStr}`;
};

interface ColdOutwardFormProps {
  clients: any[];
  commodities: any[];
  warehouses: any[];
  onSuccess: () => void;
  prefillData?: any;
}

export default function ColdOutwardForm({ clients, commodities, warehouses, onSuccess, prefillData }: ColdOutwardFormProps) {
  const { t } = useColdTranslation();
  const [loading, setLoading] = useState(false);
  const isQrShortcut = !!prefillData?.scanQrId;

  const [clientId, setClientId] = useState('');
  const [availableInwards, setAvailableInwards] = useState<any[]>([]);

  // Common Editable fields
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [remarks, setRemarks] = useState('');
  const [note, setNote] = useState('');
  const [truckNo, setTruckNo] = useState('');

  // Selected Inwards
  const [selectedItems, setSelectedItems] = useState<any[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [isScannerOpen, setIsScannerOpen] = useState(false);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [dropdownRef]);

  useEffect(() => {
    if (clientId) {
      const isWarehouse = warehouses.some((w: any) => w._id === clientId);
      getAvailableInwardsForClient(clientId, isWarehouse).then(res => {
        let items = res || [];
        
        // Filter by stack if coming from Stack Details page
        if (prefillData?.warehouseId && prefillData?.chamberName && prefillData?.floorNo && prefillData?.stackNo) {
          items = items.filter((i: any) => {
            const chMatch = i.chamberName === prefillData.chamberName || i.chamberNo?.toString() === prefillData.chamberName;
            return chMatch && i.floorNo === parseInt(prefillData.floorNo) && i.stackNo === parseInt(prefillData.stackNo);
          });
        }
        
        setAvailableInwards(items);
        if (!prefillData?.scanQrId) {
          setSelectedItems([]);
        }
      });
    } else {
      setAvailableInwards([]);
      setSelectedItems([]);
    }
  }, [clientId, warehouses, prefillData]);

  useEffect(() => {
    const initScan = async () => {
      if (prefillData?.scanQrId) {
        setLoading(true);
        try {
          const res = await getColdInwardByQrId(prefillData.scanQrId);
          if (res.success && res.data) {
            const inwardData = res.data;
            const cid = typeof inwardData.clientId === 'object' ? inwardData.clientId._id : inwardData.clientId;
            setClientId(cid);

            const availableRes = await getAvailableInwardsForClient(cid);
            setAvailableInwards(availableRes || []);
            const inward = (availableRes || []).find((i: any) => i.uniqueKey === inwardData._id.toString());

            if (inward) {
              if (inward.status === 'Completed' || inward.availableQty <= 0) {
                toast.error('Cannot create outward: Inward is already completed or has no remaining stock.');
              } else {
                setSelectedItems([{
                  inwardId: inward.uniqueKey,
                  inward,
                  grade: inward.grade || '',
                  bagsCount: inward.bagsCount || null,
                  jin: inward.jin || null,
                  mixed: inward.mixed || null,
                  plusMinus: '-',
                  grossWeight: inward.availableQty || null,
                  emptyWeight: inward.emptyWeight || null
                }]);
              }
            } else {
              toast.error('Scanned inward has no available stock.');
            }
          } else {
            toast.error(res.error || 'Invalid QR Code or Inward not found.');
          }
        } catch (err) {
          toast.error('Failed to fetch inward from QR.');
        } finally {
          setLoading(false);
        }
      }
    };
    initScan();
  }, [prefillData, warehouses]);

  const handleAddInward = (inwardId: string) => {
    if (!inwardId) return;
    const inward = availableInwards.find(i => i.uniqueKey === inwardId);
    if (!inward) return;

    // Check if already added
    if (selectedItems.some(item => item.inwardId === inwardId)) {
      toast.error('Inward already added');
      return;
    }

    const commodity = commodities.find(c => c._id === (inward.commodityId?._id || inward.commodityId));
    const isGradingFromInward = inward.gradingApplied === true;

    setSelectedItems([
      ...selectedItems,
      {
        inwardId,
        inward,
        grade: inward.grade || '',
        bagsCount: inward.bagsCount || null,
        jin: inward.jin || null,
        mixed: inward.mixed || null,
        plusMinus: '-',
        grossWeight: null,
        emptyWeight: null,
        gradingApplied: isGradingFromInward ? true : false,
        gradingChargeType: isGradingFromInward && inward.gradingChargeType ? inward.gradingChargeType : (commodity?.gradingCharge?.type || 'Per Bag'),
        gradingRate: isGradingFromInward && inward.gradingRate !== undefined ? inward.gradingRate : (commodity?.gradingCharge?.defaultRate || 0),
      }
    ]);
  };

  const handleRemoveInward = (inwardId: string) => {
    setSelectedItems(selectedItems.filter(item => item.inwardId !== inwardId));
  };

  const handleItemChange = (inwardId: string, field: string, value: any) => {
    setSelectedItems(selectedItems.map(item => {
      if (item.inwardId === inwardId) {
        return { ...item, [field]: value };
      }
      return item;
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId || selectedItems.length === 0) {
      toast.error(t('outward.fillRequired'));
      return;
    }

    // Validate quantities
    const itemsPayload = [];
    for (const item of selectedItems) {
      const calcNetWeight = Number(item.grossWeight || 0) - Number(item.emptyWeight || 0);
      const calcTotalBags = Number(item.bagsCount || 0) + Number(item.jin || 0) + Number(item.mixed || 0);

      if (calcNetWeight <= 0) {
        toast.error(`Please enter valid weight for inward ${item.inwardId.slice(-4)}`);
        return;
      }

      const adjustedAvailableQty = item.inward.availableQty;
      if (calcNetWeight > adjustedAvailableQty) {
        toast.error(`Quantity exceeds capacity for inward ${item.inwardId.slice(-4)}`);
        return;
      }

      const autoGradingType = commodities.find(c => c._id === (item.inward.commodityId?._id || item.inward.commodityId))?.gradingType || '';

      const allocations = item.inward.availableAllocations || [item.inward];

      let remainingNetWeight = calcNetWeight;
      let remainingLargeBags = Number(item.bagsCount) || 0;
      let remainingSmallBags = Number(item.jin) || 0;
      let remainingMixedBags = Number(item.mixed) || 0;

      for (let i = 0; i < allocations.length; i++) {
        const alloc = allocations[i];
        if (remainingNetWeight <= 0) break;

        const isLastAlloc = i === allocations.length - 1 || remainingNetWeight <= alloc.availableQty;
        const deductNetWeight = Math.min(remainingNetWeight, alloc.availableQty);

        const ratio = deductNetWeight / calcNetWeight;

        const deductLargeBags = isLastAlloc ? remainingLargeBags : Math.round(Number(item.bagsCount || 0) * ratio);
        const deductSmallBags = isLastAlloc ? remainingSmallBags : Math.round(Number(item.jin || 0) * ratio);
        const deductMixedBags = isLastAlloc ? remainingMixedBags : Math.round(Number(item.mixed || 0) * ratio);

        remainingNetWeight -= deductNetWeight;
        remainingLargeBags -= deductLargeBags;
        remainingSmallBags -= deductSmallBags;
        remainingMixedBags -= deductMixedBags;

        const grossWeightPart = Number(item.grossWeight || 0) * ratio;
        const emptyWeightPart = Number(item.emptyWeight || 0) * ratio;
        const deductTotalBags = deductLargeBags + deductSmallBags + deductMixedBags;

        let calculatedGradingCharge = 0;
        if (item.gradingApplied) {
          calculatedGradingCharge = item.gradingChargeType === 'Per Bag'
            ? deductTotalBags * (item.gradingRate || 0)
            : deductNetWeight * (item.gradingRate || 0);
        }

        itemsPayload.push({
          inwardId: item.inward._id,
          commodityId: item.inward.commodityId._id || item.inward.commodityId,
          warehouseId: item.inward.warehouseId._id || item.inward.warehouseId,
          chamberName: alloc.chamberName,
          chamberNo: alloc.chamberNo,
          floorName: alloc.floorName,
          floorNo: alloc.floorNo,
          stackName: alloc.stackName,
          stackNo: alloc.stackNo,
          quantityKg: deductNetWeight,
          bagsCount: deductLargeBags,
          grade: autoGradingType === 'Grading' ? item.grade : undefined,
          gradingType: autoGradingType || undefined,
          seed: item.inward.seed,
          tableLabel: item.inward.tableLabel,
          jin: deductSmallBags,
          mixed: deductMixedBags,
          plusMinus: Number(item.plusMinus) || 0,
          totalBags: deductTotalBags,
          weighbridgeSlipNo: item.inward.weighbridgeSlipNo,
          grossWeight: grossWeightPart,
          emptyWeight: emptyWeightPart,
          kataBharati: deductTotalBags > 0 ? deductNetWeight / deductTotalBags : 0,
          marko: item.inward.marko,
          referencePersons: item.inward.referencePersons,
          gradingApplied: item.gradingApplied,
          gradingChargeType: item.gradingChargeType,
          gradingRate: item.gradingRate,
          gradingCharge: calculatedGradingCharge,
        });
      }
    }

    setLoading(true);
    try {
      const clientModel = warehouses.some((w: any) => w._id === clientId) ? 'ColdWarehouse' : 'Client';
      const res = await createBatchColdOutwards({
        clientId,
        clientModel,
        date,
        truckNo,
        remarks,
        note,
        items: itemsPayload
      });

      if (res.success) {
        toast.success(t('outward.outwardCreated'));
        onSuccess();
      } else {
        toast.error(res.error || t('outward.saveFailed'));
      }
    } catch (err) {
      toast.error(t('outward.somethingWentWrong'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-6 border rounded-lg bg-slate-50">
      <div className="flex justify-between items-center border-b pb-2">
        <h3 className="font-semibold text-lg">{isQrShortcut ? 'Create Outward from QR' : t('outward.newTransaction')}</h3>
        {selectedItems.length === 0 && !isQrShortcut && (
          <Button type="button" variant="outline" onClick={() => setIsScannerOpen(true)}>
            <QrCode className="mr-2 h-4 w-4" /> Scan QR
          </Button>
        )}
      </div>
      <QRScannerModal isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} onScanSuccess={(data) => {
        setIsScannerOpen(false);
        const cid = typeof data.clientId === 'object' ? data.clientId._id : data.clientId;
        setClientId(cid);

        const isWarehouse = warehouses.some((w: any) => w._id === cid);
        getAvailableInwardsForClient(cid, isWarehouse).then(res => {
          setAvailableInwards(res || []);
          const inward = (res || []).find((i: any) => i.uniqueKey === data._id.toString());
          if (inward) {
            setSelectedItems([{
              inwardId: inward.uniqueKey,
              inward,
              grade: inward.grade || '',
              bagsCount: inward.bagsCount || null,
              jin: inward.jin || null,
              mixed: inward.mixed || null,
              plusMinus: '-',
              grossWeight: inward.availableQty || null,
              emptyWeight: inward.emptyWeight || null
            }]);
          }
        });
      }} />

      {!isQrShortcut && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('outward.clientName')}</label>
            <Select value={clientId} onValueChange={setClientId} required>
              <SelectTrigger><SelectValue placeholder={t('outward.selectClient')} /></SelectTrigger>
              <SelectContent>
                {clients.map(c => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}
                {warehouses.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Warehouses (Purchase Stock)</SelectLabel>
                    {warehouses.map((w: any) => (
                      <SelectItem key={w._id} value={w._id}>{w.name} (Warehouse)</SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t('outward.selectInward')}</label>
            <div className="relative" ref={dropdownRef}>
              <div
                className={`flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm ring-offset-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 ${!clientId ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                onClick={() => { if (clientId) setIsDropdownOpen(!isDropdownOpen); }}
              >
                <span className={selectedItems.length > 0 ? "text-slate-900" : "text-slate-500"}>
                  {selectedItems.length > 0
                    ? `${selectedItems.length} inward(s) selected`
                    : t('outward.selectInward')}
                </span>
                <ChevronDown className="h-4 w-4 opacity-50" />
              </div>

              {isDropdownOpen && availableInwards.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-md max-h-60 overflow-y-auto">
                  {availableInwards.map(inw => {
                    const isSelected = selectedItems.some(item => item.inwardId === inw.uniqueKey);
                    return (
                      <div
                        key={inw.uniqueKey}
                        className="flex items-center space-x-2 p-2 hover:bg-slate-100 cursor-pointer"
                        onClick={() => {
                          if (isSelected) {
                            handleRemoveInward(inw.uniqueKey);
                          } else {
                            handleAddInward(inw.uniqueKey);
                          }
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          readOnly
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                        <span className="text-sm text-slate-700">
                          {new Date(inw.date).toLocaleDateString('en-GB')} - {inw.commodityId?.name} ({(inw.availableAllocations || [{ chamberName: inw.chamberName, chamberNo: inw.chamberNo, floorName: inw.floorName, floorNo: inw.floorNo, stackName: inw.stackName, stackNo: inw.stackNo }]).map((a: any) => formatLocation(a, inw._id)).join(', ')}) - {inw.availableQty.toFixed(2)} {inw.unit || inw.commodityId?.unit || 'KG'} {inw.warehouseId?.name ? `(${inw.warehouseId.name})` : ''}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
              {isDropdownOpen && availableInwards.length === 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-md p-3 text-sm text-center text-slate-500">
                  No inwards available
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white p-4 rounded border">
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('outward.date')}</label>
          <Input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('outward.truckNo')}</label>
          <Input value={truckNo} onChange={(e) => setTruckNo(e.target.value)} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('outward.remarks')}</label>
          <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('outward.note')}</label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>

      {selectedItems.map((item, index) => {
        const calcNetWeight = Number(item.grossWeight || 0) - Number(item.emptyWeight || 0);
        const calcTotalBags = Number(item.bagsCount || 0) + Number(item.jin || 0) + Number(item.mixed || 0);
        const calcKataBharati = calcTotalBags > 0 ? (calcNetWeight / calcTotalBags) : 0;
        const autoGradingType = commodities.find(c => c._id === (item.inward.commodityId?._id || item.inward.commodityId))?.gradingType || '';

        return (
          <div key={item.inwardId} className="bg-white p-4 rounded border border-slate-200 relative mt-4 shadow-sm">
            {!isQrShortcut && (
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="absolute top-2 right-2 h-8 w-8"
                onClick={() => handleRemoveInward(item.inwardId)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}

            {isQrShortcut ? (
              <div className="mb-4 p-4 bg-slate-50 border rounded-md grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div><span className="text-slate-500 block">Client</span><span className="font-semibold">{clients.find(c => c._id === clientId)?.name || '-'}</span></div>
                <div><span className="text-slate-500 block">Commodity</span><span className="font-semibold">{item.inward.commodityId?.name || '-'}</span></div>
                <div><span className="text-slate-500 block">Warehouse</span><span className="font-semibold">{item.inward.warehouseId?.name || '-'}</span></div>
                <div><span className="text-slate-500 block">Receipt No.</span><span className="font-semibold">{item.inward.receiptNo || '-'}</span></div>
                <div className="col-span-2 md:col-span-4"><span className="text-slate-500 block">Location (Chamber/Floor/Stack)</span><span className="font-semibold">{(item.inward.availableAllocations || [{ chamberName: item.inward.chamberName, chamberNo: item.inward.chamberNo, floorName: item.inward.floorName, floorNo: item.inward.floorNo, stackName: item.inward.stackName, stackNo: item.inward.stackNo }]).map((a: any) => formatLocation(a, item.inward._id)).join(', ')}</span></div>
                <div><span className="text-slate-500 block">Available Weight</span><span className="font-semibold text-green-700">{item.inward.availableQty?.toFixed(2)} KG</span></div>
                <div className="col-span-3"><span className="text-slate-500 block">Remaining Bags</span><span className="font-semibold text-blue-700">{item.inward.bagsCount || 0} Large, {item.inward.jin || 0} Small, {item.inward.mixed || 0} Mixed</span></div>
              </div>
            ) : (
              <h4 className="font-semibold mb-4 text-slate-700">Item {index + 1}: {item.inward.commodityId?.name} - {(item.inward.availableAllocations || [{ chamberName: item.inward.chamberName, chamberNo: item.inward.chamberNo, floorName: item.inward.floorName, floorNo: item.inward.floorNo, stackName: item.inward.stackName, stackNo: item.inward.stackNo }]).map((a: any) => formatLocation(a, item.inward._id)).join(', ')} (Available Weight: {(() => {
                const baseQty = Number(item.inward?.availableQty) || 0;
                const finalQty = baseQty;
                return finalQty.toFixed(2);
              })()} KG)</h4>
            )}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-blue-600">Net Loss (KG)</label>
                <ColdNumberInput value={item.plusMinus ?? ''} onChange={(val) => handleItemChange(item.inwardId, 'plusMinus', val)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-blue-600">Gross Qty (KG)</label>
                <ColdNumberInput required min="0" step="0.01" value={item.grossWeight ?? ''} onChange={(val) => handleItemChange(item.inwardId, 'grossWeight', val ? Number(val) : null)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-orange-600">Empty Qty (KG)</label>
                <ColdNumberInput min="0" step="0.01" value={item.emptyWeight ?? ''} onChange={(val) => handleItemChange(item.inwardId, 'emptyWeight', val ? Number(val) : null)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-green-700">Final Net Qty (KG)</label>
                <div className="px-3 py-2 border rounded-md bg-slate-100 text-slate-700 font-bold">{calcNetWeight.toFixed(2)}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-blue-600">{getDynamicUnitLabel(item.inward.unit || item.inward.commodityId?.unit || 'KG', 'large')}</label>
                <ColdNumberInput required min="0" value={item.bagsCount ?? ''} onChange={(val) => handleItemChange(item.inwardId, 'bagsCount', val ? Number(val) : null)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-blue-600">{getDynamicUnitLabel(item.inward.unit || item.inward.commodityId?.unit || 'KG', 'small')}</label>
                <ColdNumberInput min="0" value={item.jin ?? ''} onChange={(val) => handleItemChange(item.inwardId, 'jin', val ? Number(val) : null)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-blue-600">{getDynamicUnitLabel(item.inward.unit || item.inward.commodityId?.unit || 'KG', 'mixed')}</label>
                <ColdNumberInput min="0" value={item.mixed ?? ''} onChange={(val) => handleItemChange(item.inwardId, 'mixed', val ? Number(val) : null)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-green-700">{getDynamicUnitLabel(item.inward.unit || item.inward.commodityId?.unit || 'KG', 'total')}</label>
                <div className="px-3 py-2 border rounded-md bg-slate-100 text-slate-700 font-bold">{calcTotalBags.toFixed(2)}</div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{getDynamicUnitLabel(item.inward.unit || item.inward.commodityId?.unit || 'KG', 'weight')}</label>
                <div className="px-3 py-2 border rounded-md bg-slate-100 text-slate-700 font-bold">{calcKataBharati.toFixed(2)}</div>
              </div>


            </div>

            {/* Grading Logic UI */}
            {!item.inward.gradingApplied ? (
              <div className="mt-4 p-4 border rounded-md bg-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <span className="font-medium text-slate-700">Apply Grading?</span>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant={item.gradingApplied ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleItemChange(item.inwardId, 'gradingApplied', true)}
                    >
                      Yes
                    </Button>
                    <Button
                      type="button"
                      variant={!item.gradingApplied ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleItemChange(item.inwardId, 'gradingApplied', false)}
                    >
                      No
                    </Button>
                  </div>
                </div>
                {item.gradingApplied && (
                  <div className="flex items-center gap-4">
                    <div className="text-sm flex items-center">
                      <span className="text-slate-500 mr-2">Rate:</span>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        className="w-24 inline-block h-8"
                        value={item.gradingRate}
                        onChange={(e) => handleItemChange(item.inwardId, 'gradingRate', Number(e.target.value))}
                      />
                    </div>
                    <div className="text-sm text-slate-500">
                      per {item.gradingChargeType === 'Per Bag' ? 'Bag' : 'KG'}
                    </div>
                    <div className="text-sm font-bold text-slate-800">
                      Charge: ₹{(item.gradingChargeType === 'Per Bag' ? (calcTotalBags * (item.gradingRate || 0)) : (calcNetWeight * (item.gradingRate || 0))).toFixed(2)}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-4 p-4 border rounded-md bg-green-50 text-green-800 flex justify-between items-center text-sm">
                <div>
                  <span className="font-semibold mr-2">Grading applied from Inward</span>
                  ({item.gradingChargeType} @ ₹{item.gradingRate})
                </div>
                <div className="font-bold">
                  Charge: ₹{(item.gradingChargeType === 'Per Bag' ? (calcTotalBags * (item.gradingRate || 0)) : (calcNetWeight * (item.gradingRate || 0))).toFixed(2)}
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div className="flex justify-end gap-2 pt-4">
        <Button type="submit" variant="destructive" disabled={loading || selectedItems.length === 0}>
          {loading ? t('outward.saving') : t('outward.saveOutward')}
        </Button>
      </div>
    </form>
  );
}
