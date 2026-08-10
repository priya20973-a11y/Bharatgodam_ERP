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
import { getDynamicUnitLabel } from '@/lib/utils';

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
      gradingApplied: false,
      gradingRate: 0,
      gradingChargeType: 'Per Bag',
      grossWeight: null,
      emptyWeight: null,
      bagsCount: null,
      jin: null,
      mixed: null,
      stockType: 'Self',
      purchaseQuantityKg: null,
      purchaseBagsCount: null,
      selfQuantityKg: null,
      selfBagsCount: null,
      marko: '',
      farmerName: '',
      farmerId: '',
      kataBharati: 0,
      stacks: [{ id: Date.now().toString(), chamberNo: '', floorNo: '', stackNo: '', allocatedWeight: null, allocatedBags: null, stockType: 'Self' }],
      referencePersons: [],
      qualityEntries: []
    }]);
  };

  const removeClient = (index: number) => {
    const updated = [...clientSections];
    updated.splice(index, 1);
    setClientSections(updated);
  };

  const updateClient = (index: number, field: string, value: any) => {
    setClientSections(prev => {
      const updated = [...prev];
      updated[index][field] = value;
      return updated;
    });
  };

  const updateClientFields = (index: number, fields: Record<string, any>) => {
    setClientSections(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], ...fields };
      return updated;
    });
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

      // Stock Type validation
      if (c.stockType === 'Both') {
        let totalSelfWt = 0;
        let totalPurchaseWt = 0;
        for (const s of c.stacks) {
          if (s.stockType === 'Self') totalSelfWt += Number(s.allocatedWeight) || 0;
          if (s.stockType === 'Purchase') totalPurchaseWt += Number(s.allocatedWeight) || 0;
        }
        if (Math.abs(totalSelfWt - (Number(c.selfQuantityKg) || 0)) > 0.01) {
          toast.error(`Self allocated weight (${totalSelfWt}) does not match Self Qty (${c.selfQuantityKg}) for client ${i + 1}`);
          return;
        }
        if (Math.abs(totalPurchaseWt - (Number(c.purchaseQuantityKg) || 0)) > 0.01) {
          toast.error(`Purchase allocated weight (${totalPurchaseWt}) does not match Purchase Qty (${c.purchaseQuantityKg}) for client ${i + 1}`);
          return;
        }
      }
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
      }

      if (c.stockType === 'Self') {
        c.selfQuantityKg = c.grossWeight;
        c.purchaseQuantityKg = 0;
        const totalBags = Number(c.bagsCount || 0) + Number(c.jin || 0) + Number(c.mixed || 0);
        c.selfBagsCount = totalBags;
        c.purchaseBagsCount = 0;
      } else if (c.stockType === 'Purchase') {
        c.purchaseQuantityKg = c.grossWeight;
        c.selfQuantityKg = 0;
        const totalBags = Number(c.bagsCount || 0) + Number(c.jin || 0) + Number(c.mixed || 0);
        c.purchaseBagsCount = totalBags;
        c.selfBagsCount = 0;
      } else if (c.stockType === 'Both') {
        // Quantities are already specified by the user manually, but we should calculate bags based on stacks
        let totalSelfBags = 0;
        let totalPurchaseBags = 0;
        for (const s of c.stacks) {
          if (s.stockType === 'Self') totalSelfBags += Number(s.allocatedBags) || 0;
          if (s.stockType === 'Purchase') totalPurchaseBags += Number(s.allocatedBags) || 0;
        }
        c.selfBagsCount = totalSelfBags;
        c.purchaseBagsCount = totalPurchaseBags;
      }
      
      if (c.gradingApplied) {
        const chargeType = c.gradingChargeType;
        const totalBags = Number(c.bagsCount || 0) + Number(c.jin || 0) + Number(c.mixed || 0);
        let allocWeight = 0;
        c.stacks.forEach((s: any) => allocWeight += Number(s.allocatedWeight) || 0);
        
        let units = chargeType === 'Per Bag' ? totalBags : (chargeType === 'Per Kg' ? allocWeight : allocWeight);
        c.gradingCharge = units * (c.gradingRate || 0);
      } else {
        c.gradingCharge = 0;
        c.gradingRate = 0;
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

  const getCommodityUnit = (commodityId: string) => {
    if (!commodityId) return 'KG';
    const c = commodities.find(c => c._id === commodityId);
    return c?.unit || 'KG';
  };

  const commonCommodities = getCommonCommodities();
  const commonUnit = common.sameCommodity && common.commodityId ? getCommodityUnit(common.commodityId) : 'KG';

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
            <label className="text-sm font-medium text-blue-600">Gross Qty (KG) *</label>
            <ColdNumberInput min="0" step="0.01" value={common.grossWeight ?? ''} onChange={(v) => setCommon({ ...common, grossWeight: v ? Number(v) : null })} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-orange-600">Empty Qty (KG) *</label>
            <ColdNumberInput min="0" step="0.01" value={common.emptyWeight ?? ''} onChange={(v) => setCommon({ ...common, emptyWeight: v ? Number(v) : null })} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-green-700">Net Qty (KG)</label>
            <div className="px-3 py-2 border rounded-md bg-white font-bold text-slate-700">
              {((Number(common.grossWeight) || 0) - (Number(common.emptyWeight) || 0)).toFixed(2)}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">{getDynamicUnitLabel(commonUnit, 'weight')}</label>
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
              <Select value={common.commodityId} onValueChange={(v) => {
                setCommon({ ...common, commodityId: v });
                const comm = commodities.find(c => c._id === v);
                if (comm) {
                  const newClients = clientSections.map(c => {
                    const updates: any = {};
                    
                    if (comm.qualityParameters) {
                      updates.qualityEntries = comm.qualityParameters.map((qp: any) => ({
                        parameterName: qp.name,
                        lowerLimit: qp.lowerLimit,
                        upperLimit: qp.upperLimit,
                        value: '',
                        status: '',
                        remark: ''
                      }));
                    } else {
                      updates.qualityEntries = [];
                    }

                    if (comm.gradingCharge) {
                      updates.gradingChargeType = comm.gradingCharge.type || 'Per Bag';
                      updates.gradingRate = comm.gradingCharge.defaultRate || 0;
                    }

                    return { ...c, ...updates };
                  });
                  setClientSections(newClients);
                }
              }} required>
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
        
        const calcTotalBags = Number(client.bagsCount || 0) + Number(client.jin || 0) + Number(client.mixed || 0);

        const clientAllowedCommodities = getClientCommodities(client.clientId);
        const clientUnit = commodities.find(c => c._id === effectiveCommodityId)?.unit || 'KG';

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
                    const comm = commodities.find(c => c._id === v);
                    const fieldsToUpdate: any = { commodityId: v };
                    
                    if (comm && comm.qualityParameters) {
                      fieldsToUpdate.qualityEntries = comm.qualityParameters.map((qp: any) => ({
                        parameterName: qp.name,
                        lowerLimit: qp.lowerLimit,
                        upperLimit: qp.upperLimit,
                        value: '',
                        status: '',
                        remark: ''
                      }));
                    } else {
                      fieldsToUpdate.qualityEntries = [];
                    }

                    if (comm && comm.gradingCharge) {
                      fieldsToUpdate.gradingChargeType = comm.gradingCharge.type || 'Per Bag';
                      fieldsToUpdate.gradingRate = comm.gradingCharge.defaultRate || 0;
                    }

                    updateClientFields(cIdx, fieldsToUpdate);
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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-4 border-b">
              <div className="space-y-2">
                <label className="text-sm font-medium text-purple-700">Stock Type</label>
                <Select value={client.stockType || 'Self'} onValueChange={(v) => {
                  updateClient(cIdx, 'stockType', v);
                  // Auto-update all existing stacks
                  if (v === 'Self' || v === 'Purchase') {
                    const updatedStacks = client.stacks.map((s: any) => ({ ...s, stockType: v }));
                    updateClient(cIdx, 'stacks', updatedStacks);
                  }
                }}>
                  <SelectTrigger className="bg-purple-50 border-purple-200 focus:ring-purple-500">
                    <SelectValue placeholder="Stock Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Self">Self</SelectItem>
                    <SelectItem value="Purchase">Purchase</SelectItem>
                    <SelectItem value="Both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {client.stockType === 'Both' && (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-purple-700">Self Qty (KG)</label>
                    <ColdNumberInput 
                      value={client.selfQuantityKg ?? ''} 
                      onChange={(v) => updateClient(cIdx, 'selfQuantityKg', v ? Number(v) : null)} 
                      className="bg-white border-purple-200 focus:ring-purple-500" 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-purple-700">Purchase Qty (KG)</label>
                    <ColdNumberInput 
                      value={client.purchaseQuantityKg ?? ''} 
                      onChange={(v) => updateClient(cIdx, 'purchaseQuantityKg', v ? Number(v) : null)} 
                      className="bg-white border-purple-200 focus:ring-purple-500" 
                    />
                  </div>
                </>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-blue-600">{getDynamicUnitLabel(clientUnit, 'large')}</label>
                <ColdNumberInput min="0" value={client.bagsCount ?? ''} onChange={(v) => updateClient(cIdx, 'bagsCount', v ? Number(v) : null)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-blue-600">{getDynamicUnitLabel(clientUnit, 'small')}</label>
                <ColdNumberInput min="0" value={client.jin ?? ''} onChange={(v) => updateClient(cIdx, 'jin', v ? Number(v) : null)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-blue-600">{getDynamicUnitLabel(clientUnit, 'mixed')}</label>
                <ColdNumberInput min="0" value={client.mixed ?? ''} onChange={(v) => updateClient(cIdx, 'mixed', v ? Number(v) : null)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-green-700">{getDynamicUnitLabel(clientUnit, 'total')}</label>
                <div className="px-3 py-2 border rounded-md bg-slate-100 font-bold">{calcTotalBags}</div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Marko</label>
                <Input value={client.marko} onChange={(e) => updateClient(cIdx, 'marko', e.target.value)} />
              </div>
            </div>

            {/* Grading Section */}
            {(() => {
              const currentComm = commodities.find(c => c._id === effectiveCommodityId);
              if (currentComm?.gradingCharge?.type) {
                return (
                  <div className="mt-4 bg-orange-50 border border-orange-200 p-4 rounded-md">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <h4 className="font-semibold text-orange-800">Apply Grading?</h4>
                        <p className="text-xs text-orange-600">Select Yes to apply grading charges for this inward. This will be passed to Outward.</p>
                      </div>
                      <div className="flex gap-4">
                        <label className="flex items-center space-x-2">
                          <input type="radio" checked={client.gradingApplied === true} onChange={() => updateClient(cIdx, 'gradingApplied', true)} className="w-4 h-4 text-orange-600 border-orange-300 focus:ring-orange-500" />
                          <span className="text-sm font-medium">Yes</span>
                        </label>
                        <label className="flex items-center space-x-2">
                          <input type="radio" checked={client.gradingApplied === false} onChange={() => updateClient(cIdx, 'gradingApplied', false)} className="w-4 h-4 text-orange-600 border-orange-300 focus:ring-orange-500" />
                          <span className="text-sm font-medium">No</span>
                        </label>
                      </div>
                    </div>
                    
                    {client.gradingApplied && (
                      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-orange-200 pt-4">
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-orange-800">Grading Charge Type</label>
                          <div className="px-3 py-2 bg-white border border-orange-200 rounded-md text-sm text-slate-500">{client.gradingChargeType}</div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-orange-800">Grading Rate (Rs)</label>
                          <ColdNumberInput 
                            value={client.gradingRate ?? ''} 
                            onChange={(v) => updateClient(cIdx, 'gradingRate', v ? Number(v) : 0)} 
                            className="bg-white border-orange-200 focus-visible:ring-orange-500 focus-visible:border-orange-500" 
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-orange-800">Calculated Charge (Rs)</label>
                          <div className="px-3 py-2 bg-white border border-orange-200 rounded-md text-sm font-bold text-slate-800">
                            {(() => {
                              const chargeType = client.gradingChargeType;
                              let units = chargeType === 'Per Bag' ? calcTotalBags : (common.sameCommodity ? (Number(common.grossWeight) || 0) - (Number(common.emptyWeight) || 0) : client.stacks.reduce((acc: number, s: any) => acc + (Number(s.allocatedWeight) || 0), 0));
                              // For weight in inward, it's better to use the allocated weight or net weight.
                              // Since net weight for specific client is based on stack allocations (for independent clients).
                              let allocWeight = client.stacks.reduce((acc: number, s: any) => acc + (Number(s.allocatedWeight) || 0), 0);
                              if (chargeType === 'Per Kg') {
                                units = allocWeight;
                              }
                              const total = units * (client.gradingRate || 0);
                              return `Rs ${total.toFixed(2)}`;
                            })()}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              }
              return null;
            })()}

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
                          Avail: {getRemainingCapacity(common.warehouseId, stack.chamberNo, stack.floorNo, stack.stackNo, -1, -1, false)?.toLocaleString() ?? (stackCapacities[`${common.warehouseId}-${stack.chamberNo}-${stack.floorNo}-${stack.stackNo}`]?.availableCapacity || 0)?.toLocaleString()} KG
                        </div>
                      )}
                    </div>
                    {client.stockType === 'Both' && (
                      <div className="space-y-1">
                        <label className="text-xs text-purple-600">Type</label>
                        <Select value={stack.stockType || 'Self'} onValueChange={(v) => updateStack(cIdx, sIdx, 'stockType', v)}>
                          <SelectTrigger className="h-8 text-xs bg-purple-50"><SelectValue placeholder="Type" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Self">Self</SelectItem>
                            <SelectItem value="Purchase">Purchase</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="space-y-1">
                      <label className="text-xs text-blue-600">Alloc. Qty (KG)</label>
                      <ColdNumberInput className="h-8 text-xs" min="0" max={getRemainingCapacity(common.warehouseId, stack.chamberNo, stack.floorNo, stack.stackNo, cIdx, sIdx, true) ?? undefined} step="0.01" value={stack.allocatedWeight ?? ''} onChange={(v) => updateStack(cIdx, sIdx, 'allocatedWeight', v ? Number(v) : null)} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-blue-600">{getDynamicUnitLabel(clientUnit, 'alloc')}</label>
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

            {/* Quality Parameters */}
            {client.qualityEntries && client.qualityEntries.length > 0 && (
              <div className="mt-4 border p-4 rounded-md bg-slate-50">
                <h4 className="font-medium text-sm mb-2">Quality Parameters</h4>
                <div className="space-y-2">
                  {client.qualityEntries.map((qe: any, qeIdx: number) => (
                    <div key={qeIdx} className="grid grid-cols-1 md:grid-cols-4 gap-2 items-center bg-white p-2 rounded border">
                      <div className="text-sm font-medium">{qe.parameterName}</div>
                      <div>
                        <ColdNumberInput 
                          placeholder="Value" 
                          value={qe.value ?? ''} 
                          onChange={(v) => {
                            const val = v ? Number(v) : '';
                            let status = '';
                            if (val !== '') {
                              if (val < qe.lowerLimit) status = 'Low';
                              else if (val > qe.upperLimit) status = 'High';
                              else status = 'OK';
                            }
                            const newQe = [...client.qualityEntries];
                            newQe[qeIdx] = { ...newQe[qeIdx], value: val, status };
                            updateClient(cIdx, 'qualityEntries', newQe);
                          }} 
                        />
                      </div>
                      <div>
                        <div className={`text-xs font-bold px-2 py-1 rounded inline-block ${qe.status === 'OK' ? 'bg-green-100 text-green-700' : qe.status ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'}`}>
                          {qe.status || 'No Value'}
                        </div>
                      </div>
                      <div>
                        <Input placeholder="Remark (Optional)" value={qe.remark || ''} onChange={(e) => {
                          const newQe = [...client.qualityEntries];
                          newQe[qeIdx] = { ...newQe[qeIdx], remark: e.target.value };
                          updateClient(cIdx, 'qualityEntries', newQe);
                        }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        );
      })}

      <div className={`p-4 border rounded-lg flex items-center justify-between shadow-sm sticky bottom-4 z-10 transition-colors ${isRemainingZero ? 'bg-green-50 border-green-300' : isRemainingNegative ? 'bg-red-50 border-red-300' : 'bg-amber-50 border-amber-300'}`}>
        <div>
          <h4 className={`font-semibold ${isRemainingZero ? 'text-green-800' : isRemainingNegative ? 'text-red-800' : 'text-amber-800'}`}>Remaining Net Quantity to Allocate</h4>
          <p className={`text-sm ${isRemainingZero ? 'text-green-700' : isRemainingNegative ? 'text-red-700' : 'text-amber-700'}`}>
            Total Net Qty: {commonNetWeight.toFixed(2)} {commonUnit} | Allocated: {grandTotalAllocatedWeight.toFixed(2)} {commonUnit}
          </p>
        </div>
        <div className={`text-2xl font-bold tracking-tight ${isRemainingZero ? 'text-green-700' : isRemainingNegative ? 'text-red-700' : 'text-amber-700'}`}>
          {remainingNetWeight.toFixed(2)} {commonUnit}
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
