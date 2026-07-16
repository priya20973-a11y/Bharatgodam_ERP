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
  });

  const [clientSections, setClientSections] = useState<any[]>(prefillData?.clients || []);
  const [stackCapacities, setStackCapacities] = useState<Record<string, number | null>>({});

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
            const res = await getStackAvailableCapacity(wId, parseInt(cNo), parseInt(fNo), parseInt(sNo));
            newCaps[key] = res.availableCapacity;
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

    for (let i = 0; i < clientSections.length; i++) {
      const c = clientSections[i];
      if (!c.commodityId) {
        toast.error(`Commodity required for client ${i + 1}`);
        return;
      }
      const netWeight = (Number(c.grossWeight) || 0) - (Number(c.emptyWeight) || 0);
      let totalAllocated = 0;
      for (const s of c.stacks) {
        if (!s.chamberNo || !s.floorNo || !s.stackNo) {
          toast.error(`Incomplete stack details for client ${i + 1}`);
          return;
        }
        totalAllocated += Number(s.allocatedWeight) || 0;
      }
      if (Math.abs(totalAllocated - netWeight) > 0.01) {
        toast.error(`Total allocated weight (${totalAllocated}) does not match Net Weight (${netWeight}) for client ${i + 1}`);
        return;
      }
      
      const calcTotalBags = Number(c.bagsCount || 0) + Number(c.jin || 0) + Number(c.mixed || 0);
      c.kataBharati = calcTotalBags > 0 ? (netWeight / calcTotalBags) : 0;
    }

    setLoading(true);
    try {
      const res = await createColdInwardBulk({ common, warehouseId: common.warehouseId, clients: clientSections }, draftId);
      if (res.success) {
        toast.success('Inwards created successfully');
        onSuccess();
      } else {
        toast.error(res.error || 'Failed to create inwards');
      }
    } catch (err) {
      toast.error('Something went wrong');
    } finally {
      setLoading(false);
    }
  };

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
      </div>

      {/* Client Sections */}
      {clientSections.map((client, cIdx) => {
        const clientDetails = clients.find(c => c._id === client.clientId);
        const selectedCommodity = commodities.find(c => c._id === client.commodityId);
        const autoGradingType = selectedCommodity?.gradingType || '';
        
        const calcTotalBags = Number(client.bagsCount || 0) + Number(client.jin || 0) + Number(client.mixed || 0);
        const calcNetWeight = Number(client.grossWeight || 0) - Number(client.emptyWeight || 0);
        const calcKataBharati = calcTotalBags > 0 ? (calcNetWeight / calcTotalBags) : 0;

        // Auto update Kata Bharati if needed, though we can just compute it for submit
        if (client.kataBharati !== calcKataBharati && calcKataBharati > 0 && !isNaN(calcKataBharati)) {
            // We shouldn't setState during render, better to just compute it at submit.
        }

        return (
          <div key={client.id} className="p-6 border rounded-lg bg-white shadow-sm space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="font-semibold text-lg text-indigo-700">Client: {clientDetails?.name}</h3>
              <Button type="button" variant="destructive" size="sm" onClick={() => removeClient(cIdx)}>
                <Trash2 className="w-4 h-4 mr-2" /> Remove Client
              </Button>
            </div>

            <div className={`grid grid-cols-1 ${autoGradingType === 'Grading' ? 'md:grid-cols-6' : 'md:grid-cols-5'} gap-4 bg-slate-50 p-4 rounded-md`}>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('inward.commodityVariety')} *</label>
                <Select value={client.commodityId} onValueChange={(v) => {
                  updateClient(cIdx, 'commodityId', v);
                  const comm = commodities.find(c => c._id === v);
                  if (comm) updateClient(cIdx, 'gradingType', comm.gradingType || '');
                }} required>
                  <SelectTrigger><SelectValue placeholder={t('inward.selectCommodity')} /></SelectTrigger>
                  <SelectContent>
                    {commodities.map(c => (
                      <SelectItem key={c._id} value={c._id}>{c.name} ({c.type})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {autoGradingType === 'Grading' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Grade</label>
                  <Select value={client.grade} onValueChange={(v) => updateClient(cIdx, 'grade', v)}>
                    <SelectTrigger><SelectValue placeholder="Select Grade" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Large">Large</SelectItem>
                      <SelectItem value="Small">Small</SelectItem>
                      <SelectItem value="Mixed">Mixed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <label className="text-sm font-medium text-blue-600">Gross Weight (Kg)</label>
                <ColdNumberInput min="0" step="0.01" value={client.grossWeight ?? ''} onChange={(v) => updateClient(cIdx, 'grossWeight', v ? Number(v) : null)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-orange-600">Empty Weight (Kg)</label>
                <ColdNumberInput min="0" step="0.01" value={client.emptyWeight ?? ''} onChange={(v) => updateClient(cIdx, 'emptyWeight', v ? Number(v) : null)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-green-700">Net Weight</label>
                <div className="px-3 py-2 border rounded-md bg-white font-bold">{calcNetWeight.toFixed(2)}</div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Kata Bharati</label>
                <div className="px-3 py-2 border rounded-md bg-white font-bold">{calcKataBharati.toFixed(2)}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-blue-600">Large Bag</label>
                <ColdNumberInput min="0" value={client.bagsCount ?? ''} onChange={(v) => updateClient(cIdx, 'bagsCount', v ? Number(v) : null)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-blue-600">Jin</label>
                <ColdNumberInput min="0" value={client.jin ?? ''} onChange={(v) => updateClient(cIdx, 'jin', v ? Number(v) : null)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-blue-600">Mixed</label>
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
                const chamber = selectedWarehouse?.chambers?.find((c: any) => c.chamberNo === parseInt(stack.chamberNo));
                const floor = chamber?.floors?.find((f: any) => f.floorNo === parseInt(stack.floorNo));
                return (
                  <div key={stack.id} className="grid grid-cols-1 md:grid-cols-6 gap-2 mb-2 items-start">
                    <div className="space-y-1">
                      <label className="text-xs">Chamber</label>
                      <Select value={stack.chamberNo} onValueChange={(v) => updateStack(cIdx, sIdx, 'chamberNo', v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Chamber" /></SelectTrigger>
                        <SelectContent>
                          {selectedWarehouse?.chambers?.map((c: any) => (
                            <SelectItem key={c.chamberNo} value={c.chamberNo.toString()}>{c.chamberNo}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs">Floor</label>
                      <Select value={stack.floorNo} onValueChange={(v) => updateStack(cIdx, sIdx, 'floorNo', v)} disabled={!stack.chamberNo}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Floor" /></SelectTrigger>
                        <SelectContent>
                          {chamber?.floors?.map((f: any) => (
                            <SelectItem key={f.floorNo} value={f.floorNo.toString()}>{f.floorNo}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs">Stack</label>
                      <Select value={stack.stackNo} onValueChange={(v) => updateStack(cIdx, sIdx, 'stackNo', v)} disabled={!stack.floorNo}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Stack" /></SelectTrigger>
                        <SelectContent>
                          {floor?.stacks?.map((s: any) => (
                            <SelectItem key={s.stackNo} value={s.stackNo.toString()}>{s.stackNo}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {stack.chamberNo && stack.floorNo && stack.stackNo && stackCapacities[`${common.warehouseId}-${stack.chamberNo}-${stack.floorNo}-${stack.stackNo}`] !== undefined && (
                        <div className="text-[10px] text-green-600 font-semibold leading-tight pt-1">
                          Avail: {stackCapacities[`${common.warehouseId}-${stack.chamberNo}-${stack.floorNo}-${stack.stackNo}`]?.toLocaleString()} Kg
                        </div>
                      )}
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-blue-600">Alloc. Weight</label>
                      <ColdNumberInput className="h-8 text-xs" min="0" step="0.01" value={stack.allocatedWeight ?? ''} onChange={(v) => updateStack(cIdx, sIdx, 'allocatedWeight', v ? Number(v) : null)} />
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

      <div className="flex justify-end gap-4 pt-4 border-t">
        <Button type="button" variant="outline" onClick={handleSaveDraft} disabled={loading || clientSections.length === 0}>
          Save Draft
        </Button>
        <Button type="submit" disabled={loading || clientSections.length === 0}>
          {loading ? t('inward.saving') : t('inward.saveInward')}
        </Button>
      </div>
    </form>
  );
}
