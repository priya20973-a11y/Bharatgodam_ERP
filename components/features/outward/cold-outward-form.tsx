'use client';

import { useState, useEffect, useRef } from 'react';
import { createBatchColdOutwards, getAvailableInwardsForClient } from '@/app/actions/cold-outward-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ColdNumberInput } from '@/components/ui/cold-number-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'react-hot-toast';
import { useColdTranslation } from '@/components/providers/cold-language-provider';
import { Trash2, ChevronDown } from 'lucide-react';

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
      getAvailableInwardsForClient(clientId).then(res => {
        setAvailableInwards(res || []);
        setSelectedItems([]);
      });
    } else {
      setAvailableInwards([]);
      setSelectedItems([]);
    }
  }, [clientId]);

  const handleAddInward = (inwardId: string) => {
    if (!inwardId) return;
    const inward = availableInwards.find(i => i._id === inwardId);
    if (!inward) return;
    
    // Check if already added
    if (selectedItems.some(item => item.inwardId === inwardId)) {
      toast.error('Inward already added');
      return;
    }

    setSelectedItems([
      ...selectedItems,
      {
        inwardId,
        inward,
        grade: inward.grade || '',
        bagsCount: inward.bagsCount || null,
        jin: inward.jin || null,
        mixed: inward.mixed || null,
        grossWeight: null,
        emptyWeight: null
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
      const calcKataBharati = calcTotalBags > 0 ? (calcNetWeight / calcTotalBags) : 0;
      
      if (calcNetWeight <= 0) {
        toast.error(`Please enter valid weight for inward ${item.inwardId.slice(-4)}`);
        return;
      }
      
      const adjustedAvailableQty = item.inward.availableQty + Number(item.plusMinus || 0);
      if (calcNetWeight > adjustedAvailableQty) {
        toast.error(`Quantity exceeds capacity for inward ${item.inwardId.slice(-4)}`);
        return;
      }

      const autoGradingType = commodities.find(c => c._id === (item.inward.commodityId?._id || item.inward.commodityId))?.gradingType || '';

      itemsPayload.push({
        inwardId: item.inwardId,
        commodityId: item.inward.commodityId._id || item.inward.commodityId,
        warehouseId: item.inward.warehouseId._id || item.inward.warehouseId,
        chamberNo: item.inward.chamberNo,
        floorNo: item.inward.floorNo,
        stackNo: item.inward.stackNo,
        quantityKg: calcNetWeight,
        bagsCount: Number(item.bagsCount) || 0,
        grade: autoGradingType === 'Grading' ? item.grade : undefined,
        gradingType: autoGradingType || undefined,
        seed: item.inward.seed,
        tableLabel: item.inward.tableLabel,
        jin: Number(item.jin) || 0,
        mixed: Number(item.mixed) || 0,
        plusMinus: Number(item.plusMinus) || 0,
        totalBags: calcTotalBags,
        weighbridgeSlipNo: item.inward.weighbridgeSlipNo,
        grossWeight: Number(item.grossWeight) || 0,
        emptyWeight: Number(item.emptyWeight) || 0,
        kataBharati: calcKataBharati,
        marko: item.inward.marko,
        referencePersons: item.inward.referencePersons,
      });
    }

    setLoading(true);
    try {
      const res = await createBatchColdOutwards({
        clientId,
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
      <h3 className="font-semibold text-lg border-b pb-2">{t('outward.newTransaction')}</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('outward.clientName')}</label>
          <Select value={clientId} onValueChange={setClientId} required>
            <SelectTrigger><SelectValue placeholder={t('outward.selectClient')} /></SelectTrigger>
            <SelectContent>
              {clients.map(c => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}
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
                  const isSelected = selectedItems.some(item => item.inwardId === inw._id);
                  return (
                    <div 
                      key={inw._id} 
                      className="flex items-center space-x-2 p-2 hover:bg-slate-100 cursor-pointer"
                      onClick={() => {
                        if (isSelected) {
                          handleRemoveInward(inw._id);
                        } else {
                          handleAddInward(inw._id);
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
                        {new Date(inw.date).toLocaleDateString('en-GB')} - {inw.commodityId?.name} - {inw.availableQty.toFixed(2)} Kg {inw.warehouseId?.name ? `(${inw.warehouseId.name})` : ''}
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
            <Button 
              type="button" 
              variant="destructive" 
              size="icon" 
              className="absolute top-2 right-2 h-8 w-8"
              onClick={() => handleRemoveInward(item.inwardId)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            
            <h4 className="font-semibold mb-4 text-slate-700">Item {index + 1}: {item.inward.commodityId?.name} - C{item.inward.chamberNo}/F{item.inward.floorNo}/S{item.inward.stackNo} (Available: {(item.inward.availableQty + Number(item.plusMinus || 0)).toFixed(2)} Kg)</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-blue-600">Plus/Minus (Kg)</label>
                <ColdNumberInput value={item.plusMinus ?? ''} onChange={(val) => handleItemChange(item.inwardId, 'plusMinus', val ? Number(val) : null)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-blue-600">{t('outward.quantityKg')} (Gross)</label>
                <ColdNumberInput required min="0" step="0.01" value={item.grossWeight ?? ''} onChange={(val) => handleItemChange(item.inwardId, 'grossWeight', val ? Number(val) : null)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-orange-600">{t('outward.emptyWeight')}</label>
                <ColdNumberInput min="0" step="0.01" value={item.emptyWeight ?? ''} onChange={(val) => handleItemChange(item.inwardId, 'emptyWeight', val ? Number(val) : null)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-green-700">Final Net Weight</label>
                <div className="px-3 py-2 border rounded-md bg-slate-100 text-slate-700 font-bold">{calcNetWeight.toFixed(2)}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-blue-600">Large Bags</label>
                <ColdNumberInput required min="0" value={item.bagsCount ?? ''} onChange={(val) => handleItemChange(item.inwardId, 'bagsCount', val ? Number(val) : null)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-blue-600">Small Bags</label>
                <ColdNumberInput min="0" value={item.jin ?? ''} onChange={(val) => handleItemChange(item.inwardId, 'jin', val ? Number(val) : null)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-blue-600">Mixed Bags</label>
                <ColdNumberInput min="0" value={item.mixed ?? ''} onChange={(val) => handleItemChange(item.inwardId, 'mixed', val ? Number(val) : null)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-green-700">Total Bags</label>
                <div className="px-3 py-2 border rounded-md bg-slate-100 text-slate-700 font-bold">{calcTotalBags.toFixed(2)}</div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('outward.kataBharati')}</label>
                <div className="px-3 py-2 border rounded-md bg-slate-100 text-slate-700 font-bold">{calcKataBharati.toFixed(2)}</div>
              </div>
              
              {autoGradingType === 'Grading' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('outward.grade')}</label>
                  <Select value={item.grade} onValueChange={(v) => handleItemChange(item.inwardId, 'grade', v)} required>
                    <SelectTrigger><SelectValue placeholder={t('outward.selectGrade')} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Large">{t('outward.gradeLarge')}</SelectItem>
                      <SelectItem value="Small">{t('outward.gradeSmall')}</SelectItem>
                      <SelectItem value="Mixed">{t('outward.gradeMixed')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
        );
      })}

      <div className="flex justify-end gap-2 pt-4">
        <Button type="submit" disabled={loading || selectedItems.length === 0}>
          {loading ? t('outward.saving') : t('outward.saveOutward')}
        </Button>
      </div>
    </form>
  );
}
