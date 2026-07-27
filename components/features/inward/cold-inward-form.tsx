'use client';

import { useState, useEffect } from 'react';
import { createColdInwardBulk, getStackAvailableCapacity, saveColdInwardDraft } from '@/app/actions/cold-inward-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ColdNumberInput } from '@/components/ui/cold-number-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'react-hot-toast';
import { useColdTranslation } from '@/components/providers/cold-language-provider';
import { Trash2, Plus } from 'lucide-react';

interface ColdInwardFormProps {
  clients: any[];
  commodities: any[];
  warehouses: any[];
  onSuccess: () => void;
  prefillData?: any;
  draftId?: string;
}

export default function ColdInwardForm({ clients, commodities, warehouses, onSuccess, prefillData, draftId }: ColdInwardFormProps) {
  const { t } = useColdTranslation();
  const [loading, setLoading] = useState(false);

  // Common Fields
  const [common, setCommon] = useState({
    date: prefillData?.common?.date || new Date().toISOString().split('T')[0],
    warehouseId: prefillData?.common?.warehouseId || '',
    truckNo: prefillData?.common?.truckNo || '',
    weighbridgeSlipNo: prefillData?.common?.weighbridgeSlipNo || '',
    seed: prefillData?.common?.seed || '',
    tableLabel: prefillData?.common?.tableLabel || '',
    remarks: prefillData?.common?.remarks || '',
    note: prefillData?.common?.note || '',
    grossWeight: prefillData?.common?.grossWeight || null,
    emptyWeight: prefillData?.common?.emptyWeight || null,
    sameCommodity: prefillData?.common?.sameCommodity || false,
    commodityId: prefillData?.common?.commodityId || '',
  });

  const [clientSections, setClientSections] = useState<any[]>(prefillData?.clients || []);
  const [stackCapacities, setStackCapacities] = useState<Record<string, { availableCapacity: number, bufferCapacity: number } | null>>({});

  const selectedWarehouse = warehouses.find(w => w._id === common.warehouseId);

  const selectedStacksString = clientSections.flatMap(c => c.stacks)
    .filter(s => s.chamberNo && s.floorNo && s.stackNo)
    .map(s => `${common.warehouseId}-${s.chamberNo}-${s.floorNo}-${s.stackNo}`)
    .join(',');

  useEffect(() => {
    if (!selectedStacksString) return;
    const fetchCapacities = async () => {
      const keys = selectedStacksString.split(',');
      const newCaps = { ...stackCapacities };
      let changed = false;
      for (const key of keys) {
        if (newCaps[key] === undefined) {
          const [wId, cNo, fNo, sNo] = key.split('-');
          try {
            const res = await getStackAvailableCapacity(wId, cNo, parseInt(fNo), parseInt(sNo));
            newCaps[key] = { availableCapacity: res.availableCapacity, bufferCapacity: res.bufferCapacity || 0 };
            changed = true;
          } catch {
            newCaps[key] = null;
            changed = true;
          }
        }
      }
      if (changed) setStackCapacities(newCaps);
    };
    fetchCapacities();
  }, [selectedStacksString]);

  const handleAddClient = (clientId: string) => {
    if (!clientId) return;
    if (clientSections.find(c => c.clientId === clientId)) {
      toast.error('Client already added');
      return;
    }
    setClientSections([...clientSections, {
      id: Date.now().toString(),
      clientId,
      commodityId: '',
      grade: '',
      gradingType: '',
      grossWeight: null,
      emptyWeight: null,
      bagsCount: null,
      jin: null,
      mixed: null,
      marko: '',
      farmerName: '',
      farmerId: '',
      kataBharati: 0,
      stacks: [{ id: Date.now().toString(), chamberNo: '', floorNo: '', stackNo: '', allocatedWeight: null, allocatedBags: null }],
      referencePersons: []
    }]);
  };

  const removeClient = (index: number) => {
    const updated = [...clientSections];
    updated.splice(index, 1);
    setClientSections(updated);
  };

  const updateClient = (index: number, field: string, value: any) => {
    const updated = [...clientSections];
    updated[index][field] = value;
    setClientSections(updated);
  };

  const addStack = (clientIndex: number) => {
    const updated = [...clientSections];
    updated[clientIndex].stacks.push({ id: Date.now().toString(), chamberNo: '', floorNo: '', stackNo: '', allocatedWeight: null, allocatedBags: null });
    setClientSections(updated);
  };

  const removeStack = (clientIndex: number, stackIndex: number) => {
    const updated = [...clientSections];
    updated[clientIndex].stacks.splice(stackIndex, 1);
    setClientSections(updated);
  };

  const updateStack = (clientIndex: number, stackIndex: number, field: string, value: any) => {
    const updated = [...clientSections];
    updated[clientIndex].stacks[stackIndex][field] = value;
    setClientSections(updated);
  };

  const handleSaveDraft = async () => {
    if (!common.warehouseId) {
      toast.error('Warehouse is required for draft');
      return;
    }
    setLoading(true);
    try {
      const res = await saveColdInwardDraft({ common, clients: clientSections }, draftId);
      if (res.success) {
        toast.success('Draft saved successfully');
        onSuccess();
      } else {
        toast.error(res.error || 'Failed to save draft');
      }
    } catch (err) {
      toast.error('Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!common.warehouseId) {
      toast.error('Warehouse is required');
      return;
    }
    if (clientSections.length === 0) {
      toast.error('Please add at least one client');
      return;
    }

    const commonNetWeight = (Number(common.grossWeight) || 0) - (Number(common.emptyWeight) || 0);
    
    // Validate common weight matches total of ALL client allocations
    let grandTotalAllocatedWeight = 0;
    let grandTotalAllocatedBags = 0;
    let grandTotalBags = 0;

    for (let i = 0; i < clientSections.length; i++) {
      const c = clientSections[i];
      if (common.sameCommodity && !common.commodityId) {
        toast.error('Please select the common commodity');
        return;
      }
      if (!common.sameCommodity && !c.commodityId) {
        toast.error(`Commodity required for client ${i + 1}`);
        return;
      }
      for (const s of c.stacks) {
        if (!s.chamberNo || !s.floorNo || !s.stackNo) {
          toast.error(`Incomplete stack details for client ${i + 1}`);
          return;
        }
        grandTotalAllocatedWeight += Number(s.allocatedWeight) || 0;
        grandTotalAllocatedBags += Number(s.allocatedBags) || 0;
      }
      grandTotalBags += Number(c.bagsCount || 0) + Number(c.jin || 0) + Number(c.mixed || 0);
    }

    if (grandTotalAllocatedBags !== grandTotalBags) {
      toast.error('Total Allocation Bags must be equal to Total Bags.');
      return;
    }

    if (Math.abs(grandTotalAllocatedWeight - commonNetWeight) > 0.01) {
      toast.error(`Total allocated weight across all clients (${grandTotalAllocatedWeight}) does not match the Common Net Weight (${commonNetWeight})`);
      return;
    }

    // Distribute common weight proportionally and assign common values
    const commonKataBharati = grandTotalBags > 0 ? (commonNetWeight / grandTotalBags) : 0;

    for (let i = 0; i < clientSections.length; i++) {
      const c = clientSections[i];
      
      let clientAllocated = 0;
      for (const s of c.stacks) {
        clientAllocated += Number(s.allocatedWeight) || 0;
      }

      // Proportional split
      const weightRatio = commonNetWeight > 0 ? (clientAllocated / commonNetWeight) : 0;
      c.grossWeight = (Number(common.grossWeight) || 0) * weightRatio;
      c.emptyWeight = (Number(common.emptyWeight) || 0) * weightRatio;
      
      c.kataBharati = commonKataBharati;
      
      if (common.sameCommodity) {
        c.commodityId = common.commodityId;
        // Optionally map grading if needed based on the selected common commodity
        const selectedCommodity = commodities.find(comm => comm._id === common.commodityId);
        c.gradingType = selectedCommodity?.gradingType || '';
      }
    }

    const submitData = async (isConfirmed = false) => {
      setLoading(true);
      try {
        const res = await createColdInwardBulk({ common, warehouseId: common.warehouseId, clients: clientSections, confirmed: isConfirmed }, draftId);
        if (res.success) {
          toast.success('Inwards created successfully');
          if (res.warning) {
            toast.custom((t) => (
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded shadow-md">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-yellow-700">{res.warning}</p>
                  </div>
                </div>
              </div>
            ), { duration: 6000 });
          }
          onSuccess();
        } else if (res.requireConfirmation) {
          if (window.confirm(res.error || 'Stack capacity exceeded. Use buffer capacity?')) {
            submitData(true);
          } else {
            setLoading(false);
          }
        } else {
          toast.error(res.error || 'Failed to create inwards');
          setLoading(false);
        }
      } catch (err) {
        toast.error('Something went wrong');
        setLoading(false);
      }
    };

    submitData(false);
  };

  const getRemainingCapacity = (wId: string, cNo: string, fNo: string, sNo: string, skipClientIdx = -1, skipStackIdx = -1, includeBuffer = false) => {
    const key = `${wId}-${cNo}-${fNo}-${sNo}`;
    const capInfo = stackCapacities[key];
    if (capInfo === undefined || capInfo === null) return null;
    
    let otherAllocations = 0;
    clientSections.forEach((c, cIdx) => {
      c.stacks.forEach((s: any, sIdx: number) => {
        if (cIdx === skipClientIdx && sIdx === skipStackIdx) return;
        if (s.chamberNo === cNo && s.floorNo === fNo && s.stackNo === sNo) {
          otherAllocations += (Number(s.allocatedWeight) || 0);
        }
      });
    });
    const maxCapacity = includeBuffer ? capInfo.availableCapacity + capInfo.bufferCapacity : capInfo.availableCapacity;
    return Math.max(0, maxCapacity - otherAllocations);
  };

  const getClientCommodities = (clientId: string) => {
    const client = clients.find(c => c._id === clientId);
    if (!client) return [];
    if (!client.commodityIds || client.commodityIds.length === 0) return commodities;
    return commodities.filter(c => client.commodityIds.includes(c._id) || client.commodityIds.includes(c._id.toString()));
  };

  const getCommonCommodities = () => {
    if (clientSections.length === 0) return commodities;
    let common = getClientCommodities(clientSections[0].clientId);
    for (let i = 1; i < clientSections.length; i++) {
      const nextClientCommodities = getClientCommodities(clientSections[i].clientId);
      common = common.filter(c => nextClientCommodities.some(nc => nc._id === c._id));
    }
    return common;
  };

  const commonCommodities = getCommonCommodities();

  const commonNetWeight = (Number(common.grossWeight) || 0) - (Number(common.emptyWeight) || 0);
  const grandTotalAllocatedWeight = clientSections.reduce((sum, client) => {
    return sum + client.stacks.reduce((sSum: number, stack: any) => sSum + (Number(stack.allocatedWeight) || 0), 0);
  }, 0);

  const remainingNetWeight = commonNetWeight - grandTotalAllocatedWeight;
  const isRemainingZero = Math.abs(remainingNetWeight) <= 0.01;
  const isRemainingNegative = remainingNetWeight < -0.01;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Common Fields */}
      <div className="p-6 border rounded-lg bg-slate-50 space-y-4">
        <h3 className="font-semibold text-lg border-b pb-2">Common Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('inward.date')}</label>
            <Input required type="date" value={common.date} onChange={(e) => setCommon({ ...common, date: e.target.value })} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('inward.warehouse')}</label>
            <Select value={common.warehouseId} onValueChange={(v) => setCommon({ ...common, warehouseId: v })} required>
              <SelectTrigger><SelectValue placeholder={t('inward.selectWarehouse')} /></SelectTrigger>
              <SelectContent>
                {warehouses.map(w => <SelectItem key={w._id} value={w._id}>{w.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Select Client for Inward</label>
            <Select onValueChange={handleAddClient} value="">
              <SelectTrigger><SelectValue placeholder="Add Client..." /></SelectTrigger>
              <SelectContent>
                {clients.map(c => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4 border-t">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('inward.truckNo')}</label>
            <Input value={common.truckNo} onChange={(e) => setCommon({ ...common, truckNo: e.target.value })} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('inward.weighbridgeSlipNo')}</label>
            <Input value={common.weighbridgeSlipNo} onChange={(e) => setCommon({ ...common, weighbridgeSlipNo: e.target.value })} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('inward.seed')}</label>
            <Input value={common.seed} onChange={(e) => setCommon({ ...common, seed: e.target.value })} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('inward.tableLabel')}</label>
            <Input value={common.tableLabel} onChange={(e) => setCommon({ ...common, tableLabel: e.target.value })} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 pt-4 border-t bg-slate-100 p-4 rounded-md">
          <div className="space-y-2">
            <label className="text-sm font-medium text-blue-600">Gross Weight (Kg) *</label>
            <ColdNumberInput min="0" step="0.01" value={common.grossWeight ?? ''} onChange={(v) => setCommon({ ...common, grossWeight: v ? Number(v) : null })} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-orange-600">Empty Weight (Kg) *</label>
            <ColdNumberInput min="0" step="0.01" value={common.emptyWeight ?? ''} onChange={(v) => setCommon({ ...common, emptyWeight: v ? Number(v) : null })} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-green-700">Net Weight</label>
            <div className="px-3 py-2 border rounded-md bg-white font-bold text-slate-700">
              {((Number(common.grossWeight) || 0) - (Number(common.emptyWeight) || 0)).toFixed(2)}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Kata Bharati</label>
            <div className="px-3 py-2 border rounded-md bg-white font-bold text-slate-700">
              {(() => {
                const cw = (Number(common.grossWeight) || 0) - (Number(common.emptyWeight) || 0);
                const tb = clientSections.reduce((sum, c) => sum + (Number(c.bagsCount) || 0) + (Number(c.jin) || 0) + (Number(c.mixed) || 0), 0);
                return tb > 0 ? (cw / tb).toFixed(3) : '0.000';
              })()}
            </div>
          </div>
          <div className="space-y-2 flex flex-col justify-center pt-6">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input 
                type="checkbox" 
                className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                checked={common.sameCommodity}
                onChange={(e) => setCommon({ ...common, sameCommodity: e.target.checked })}
              />
              <span className="text-sm font-medium text-slate-700">Same Commodity for All Clients</span>
            </label>
          </div>
        </div>

        {common.sameCommodity && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t bg-slate-100 p-4 rounded-md">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('inward.commodityVariety')} *</label>
              <Select value={common.commodityId} onValueChange={(v) => setCommon({ ...common, commodityId: v })} required>
                <SelectTrigger className="bg-white"><SelectValue placeholder={t('inward.selectCommodity')} /></SelectTrigger>
                <SelectContent>
                  {commonCommodities.length > 0 ? (
                    commonCommodities.map(c => (
                      <SelectItem key={c._id} value={c._id}>{c.name} ({c.type})</SelectItem>
                    ))
                  ) : (
                    <SelectItem value="none" disabled>No common commodity available for the selected clients.</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      {/* Client Sections */}
      {clientSections.map((client, cIdx) => {
        const clientDetails = clients.find(c => c._id === client.clientId);
        const effectiveCommodityId = common.sameCommodity ? common.commodityId : client.commodityId;
        const selectedCommodity = commodities.find(c => c._id === effectiveCommodityId);
        const autoGradingType = selectedCommodity?.gradingType || '';
        
        const calcTotalBags = Number(client.bagsCount || 0) + Number(client.jin || 0) + Number(client.mixed || 0);

        const clientAllowedCommodities = getClientCommodities(client.clientId);

        return (
          <div key={client.id} className="p-6 border rounded-lg bg-white shadow-sm space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="font-semibold text-lg text-indigo-700">Client: {clientDetails?.name}</h3>
              <Button type="button" variant="destructive" size="sm" onClick={() => removeClient(cIdx)}>
                <Trash2 className="w-4 h-4 mr-2" /> Remove Client
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-md mb-4">
              {!common.sameCommodity ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('inward.commodityVariety')} *</label>
                  <Select value={client.commodityId} onValueChange={(v) => {
                    updateClient(cIdx, 'commodityId', v);
                    const comm = commodities.find(c => c._id === v);
                    if (comm) updateClient(cIdx, 'gradingType', comm.gradingType || '');
                  }} required>
                    <SelectTrigger className="bg-white"><SelectValue placeholder={t('inward.selectCommodity')} /></SelectTrigger>
                    <SelectContent>
                      {clientAllowedCommodities.length > 0 ? (
                        clientAllowedCommodities.map(c => (
                          <SelectItem key={c._id} value={c._id}>{c.name} ({c.type})</SelectItem>
                        ))
                      ) : (
                        <SelectItem value="none" disabled>No commodities assigned to this client.</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="text-sm text-slate-500 italic flex items-center h-full">
                  Using common commodity details.
                </div>
              )}
              
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('inward.farmerName') || 'Farmer Name'}</label>
                <Input value={client.farmerName || ''} onChange={(e) => updateClient(cIdx, 'farmerName', e.target.value)} className="bg-white" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Farmer ID</label>
                <Input value={client.farmerId || ''} onChange={(e) => updateClient(cIdx, 'farmerId', e.target.value)} className="bg-white" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-blue-600">Large Bag</label>
                <ColdNumberInput min="0" value={client.bagsCount ?? ''} onChange={(v) => updateClient(cIdx, 'bagsCount', v ? Number(v) : null)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-blue-600">Small Bag</label>
                <ColdNumberInput min="0" value={client.jin ?? ''} onChange={(v) => updateClient(cIdx, 'jin', v ? Number(v) : null)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-blue-600">Mixed Bag</label>
                <ColdNumberInput min="0" value={client.mixed ?? ''} onChange={(v) => updateClient(cIdx, 'mixed', v ? Number(v) : null)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-green-700">Total Bags</label>
                <div className="px-3 py-2 border rounded-md bg-slate-100 font-bold">{calcTotalBags}</div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Marko</label>
                <Input value={client.marko} onChange={(e) => updateClient(cIdx, 'marko', e.target.value)} />
              </div>
            </div>

            {/* Stacks Section */}
            <div className="mt-4 border p-4 rounded-md bg-slate-50">
              <div className="flex justify-between items-center mb-2">
                <h4 className="font-medium text-sm">Stack Allocations</h4>
                <Button type="button" variant="outline" size="sm" onClick={() => addStack(cIdx)}>
                  <Plus className="w-4 h-4 mr-1" /> Add Stack
                </Button>
              </div>
              {client.stacks.map((stack: any, sIdx: number) => {
                const chamber = selectedWarehouse?.chambers?.find((c: any) => (c.name || c.chamberNo.toString()) === stack.chamberNo);
                const floor = chamber?.floors?.find((f: any) => f.floorNo === parseInt(stack.floorNo));
                const floorName = floor?.name || `Floor ${stack.floorNo}`;
                
                return (
                  <div key={stack.id} className="grid grid-cols-1 md:grid-cols-6 gap-2 mb-2 items-start">
                    <div className="space-y-1">
                      <label className="text-xs">Chamber</label>
                      <Select value={stack.chamberNo} onValueChange={(v) => updateStack(cIdx, sIdx, 'chamberNo', v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Chamber" /></SelectTrigger>
                        <SelectContent>
                          {selectedWarehouse?.chambers?.map((c: any) => {
                            const val = (c.name || c.chamberNo).toString();
                            return <SelectItem key={c.chamberNo} value={val}>{c.name || `Chamber ${c.chamberNo}`}</SelectItem>;
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs">Floor</label>
                      <Select value={stack.floorNo} onValueChange={(v) => updateStack(cIdx, sIdx, 'floorNo', v)} disabled={!stack.chamberNo}>
                        <SelectTrigger className="h-8 text-xs bg-slate-50 border-slate-300 shadow-sm"><SelectValue placeholder="Floor" /></SelectTrigger>
                        <SelectContent>
                          {chamber?.floors?.map((f: any) => (
                            <SelectItem key={f.floorNo} value={f.floorNo.toString()}>{f.name || `Floor ${f.floorNo}`}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs">Stack</label>
                      <Select value={stack.stackNo} onValueChange={(v) => updateStack(cIdx, sIdx, 'stackNo', v)} disabled={!stack.floorNo}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Stack" /></SelectTrigger>
                        <SelectContent>
                          {floor?.stacks?.map((s: any) => {
                            const clientSelectedStackKeys = client.stacks
                              .filter((clientStack: any, idx: number) => idx !== sIdx && clientStack.chamberNo && clientStack.floorNo && clientStack.stackNo)
                              .map((clientStack: any) => `${clientStack.chamberNo}-${clientStack.floorNo}-${clientStack.stackNo}`);
                              
                            const itemKey = `${stack.chamberNo}-${stack.floorNo}-${s.stackNo}`;
                            const isSelectedByThisClient = clientSelectedStackKeys.includes(itemKey);
                            const remaining = getRemainingCapacity(common.warehouseId, stack.chamberNo, stack.floorNo, s.stackNo.toString(), cIdx, sIdx);
                            const isCurrentSelection = stack.stackNo === s.stackNo.toString();
                            const noCapacity = remaining !== null && remaining <= 0;
                            const isDisabled = isSelectedByThisClient || (!isCurrentSelection && noCapacity);
                            
                            return (
                              <SelectItem key={s.stackNo} value={s.stackNo.toString()} disabled={isDisabled}>
                                {s.stackNo} {isSelectedByThisClient ? '(Already Selected)' : ''}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      {stack.chamberNo && stack.floorNo && stack.stackNo && stackCapacities[`${common.warehouseId}-${stack.chamberNo}-${stack.floorNo}-${stack.stackNo}`] !== undefined && (
                        <div className="text-[10px] text-green-600 font-semibold leading-tight pt-1">
                          Avail: {getRemainingCapacity(common.warehouseId, stack.chamberNo, stack.floorNo, stack.stackNo, -1, -1, false)?.toLocaleString() ?? (stackCapacities[`${common.warehouseId}-${stack.chamberNo}-${stack.floorNo}-${stack.stackNo}`]?.availableCapacity || 0)?.toLocaleString()} Kg
                        </div>
                      )}
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-blue-600">Alloc. Weight</label>
                      <ColdNumberInput className="h-8 text-xs" min="0" max={getRemainingCapacity(common.warehouseId, stack.chamberNo, stack.floorNo, stack.stackNo, cIdx, sIdx, true) ?? undefined} step="0.01" value={stack.allocatedWeight ?? ''} onChange={(v) => updateStack(cIdx, sIdx, 'allocatedWeight', v ? Number(v) : null)} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-blue-600">Alloc. Bags</label>
                      <ColdNumberInput className="h-8 text-xs" min="0" value={stack.allocatedBags ?? ''} onChange={(v) => updateStack(cIdx, sIdx, 'allocatedBags', v ? Number(v) : null)} />
                    </div>
                    <div className="pb-0.5">
                      {client.stacks.length > 1 && (
                        <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500" onClick={() => removeStack(cIdx, sIdx)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            
            {/* Reference Persons */}
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
                      const selected = client.referencePersons?.some((r: any) => r.name === rp.name) || false;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            const current = client.referencePersons || [];
                            const isSel = current.some((r: any) => r.name === rp.name);
                            if (isSel) {
                              updateClient(cIdx, 'referencePersons', current.filter((r: any) => r.name !== rp.name));
                            } else {
                              updateClient(cIdx, 'referencePersons', [...current, rp]);
                            }
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
            </div>

          </div>
        );
      })}

      <div className={`p-4 border rounded-lg flex items-center justify-between shadow-sm sticky bottom-4 z-10 transition-colors ${isRemainingZero ? 'bg-green-50 border-green-300' : isRemainingNegative ? 'bg-red-50 border-red-300' : 'bg-amber-50 border-amber-300'}`}>
        <div>
          <h4 className={`font-semibold ${isRemainingZero ? 'text-green-800' : isRemainingNegative ? 'text-red-800' : 'text-amber-800'}`}>Remaining Net Weight to Allocate</h4>
          <p className={`text-sm ${isRemainingZero ? 'text-green-700' : isRemainingNegative ? 'text-red-700' : 'text-amber-700'}`}>
            Total Net Weight: {commonNetWeight.toFixed(2)} Kg | Allocated: {grandTotalAllocatedWeight.toFixed(2)} Kg
          </p>
        </div>
        <div className={`text-2xl font-bold tracking-tight ${isRemainingZero ? 'text-green-700' : isRemainingNegative ? 'text-red-700' : 'text-amber-700'}`}>
          {remainingNetWeight.toFixed(2)} Kg
        </div>
      </div>

      <div className="flex justify-end gap-4 pt-4 border-t">
        <Button type="button" variant="outline" onClick={handleSaveDraft} disabled={loading || clientSections.length === 0}>
          Save Draft
        </Button>
        <Button type="submit" disabled={loading || clientSections.length === 0 || !isRemainingZero}>
          {loading ? t('inward.saving') : t('inward.saveInward')}
        </Button>
      </div>
    </form>
  );
}
