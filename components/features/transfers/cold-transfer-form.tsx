'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getAvailableInwardsForTransfer, createOwnershipTransfer } from '@/app/actions/cold-transfer-actions';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { CalendarIcon, Loader2, Search, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useColdTranslation } from '@/components/providers/cold-language-provider';
import SearchTransferStockModal from './search-transfer-stock-modal';
import { SearchableSelect } from '@/components/ui/searchable-select';

interface SourceItem {
  id: string;
  fromClientId: string;
  clientName: string;
  inwardId: string;
  receiptNumber: string;
  lotNo: string;
  commodityName: string;
  unit: string;
  inwardDate: string;
  transferWeight: number;
  transferBags: number;
  availableQty: number;
  availableBags: number;
}

interface ColdTransferFormProps {
  clients: any[];
}

export default function ColdTransferForm({ clients }: ColdTransferFormProps) {
  const router = useRouter();
  const { t, formatNumber } = useColdTranslation();
  
  const [transferType, setTransferType] = useState<'Self' | 'Purchase'>('Self');
  const [transferDate, setTransferDate] = useState(new Date().toISOString().slice(0, 10));
  const [toClientId, setToClientId] = useState('');
  
  // Current selection state
  const [fromClientId, setFromClientId] = useState('');
  const [inwardId, setInwardId] = useState('');
  const [transferWeight, setTransferWeight] = useState<number | ''>('');
  const [transferBags, setTransferBags] = useState<number | ''>('');
  
  const [availableInwards, setAvailableInwards] = useState<any[]>([]);
  const [loadingInwards, setLoadingInwards] = useState(false);
  const [selectedInwardDetails, setSelectedInwardDetails] = useState<any>(null);
  
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [pendingInwardId, setPendingInwardId] = useState<string | null>(null);

  const [sources, setSources] = useState<SourceItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function fetchInwards() {
      if (!fromClientId) {
        setAvailableInwards([]);
        return;
      }
      setLoadingInwards(true);
      try {
        const data = await getAvailableInwardsForTransfer(fromClientId, transferType);
        setAvailableInwards(data);
        if (pendingInwardId) {
          setInwardId(pendingInwardId);
          setPendingInwardId(null);
        }
      } catch (error) {
        console.error('Failed to fetch inwards', error);
      } finally {
        setLoadingInwards(false);
      }
    }
    fetchInwards();
    if (!pendingInwardId) {
      setInwardId('');
    }
  }, [fromClientId, transferType]);

  useEffect(() => {
    if (inwardId && availableInwards.length > 0) {
      const inward = availableInwards.find(inv => inv._id === inwardId);
      setSelectedInwardDetails(inward || null);
      if (inward) {
        setTransferWeight(inward.availableQty);
        setTransferBags(inward.availableBags);
        if (transferType === 'Purchase' && inward.warehouseId?._id) {
          setToClientId(inward.warehouseId._id);
        }
      }
    } else {
      setSelectedInwardDetails(null);
      setTransferWeight('');
      setTransferBags('');
      if (transferType === 'Purchase') {
        setToClientId('');
      }
    }
  }, [inwardId, availableInwards, transferType]);

  const handleAddSource = () => {
    if (!fromClientId || !inwardId || transferWeight === '' || transferBags === '' || !selectedInwardDetails) {
      alert("Please select a source client, an inward receipt, and specify transfer weight and bags.");
      return;
    }

    if (transferWeight <= 0 || transferBags <= 0) {
      alert("Transfer weight and bags must be greater than 0.");
      return;
    }

    if (transferWeight > selectedInwardDetails.availableQty) {
      alert("Transfer weight cannot exceed available stock.");
      return;
    }

    if (transferBags > selectedInwardDetails.availableBags) {
      alert("Transfer bags cannot exceed available bags.");
      return;
    }

    const clientObj = clients.find(c => c._id === fromClientId);
    
    const newSource: SourceItem = {
      id: Math.random().toString(36).substr(2, 9),
      fromClientId,
      clientName: clientObj?.name || 'Unknown',
      inwardId,
      receiptNumber: selectedInwardDetails.receiptNumber || '-',
      lotNo: selectedInwardDetails.lotNo || '-',
      commodityName: selectedInwardDetails.commodityId?.name + (selectedInwardDetails.commodityId?.type ? ` (${selectedInwardDetails.commodityId.type})` : ''),
      unit: selectedInwardDetails.unit || selectedInwardDetails.commodityId?.unit || 'KG',
      inwardDate: selectedInwardDetails.date ? new Date(selectedInwardDetails.date).toLocaleDateString('en-GB') : '',
      transferWeight: Number(transferWeight),
      transferBags: Number(transferBags),
      availableQty: selectedInwardDetails.availableQty,
      availableBags: selectedInwardDetails.availableBags
    };

    setSources([...sources, newSource]);
    
    // Reset selection
    setInwardId('');
    setSelectedInwardDetails(null);
    setTransferWeight('');
    setTransferBags('');
  };

  const handleRemoveSource = (id: string) => {
    setSources(sources.filter(s => s.id !== id));
  };

  const onSubmit = async () => {
    if (sources.length === 0) {
      alert("Please add at least one source to transfer.");
      return;
    }

    if (!toClientId) {
      alert("Please select a destination client.");
      return;
    }

    if (!transferDate) {
      alert("Please select a date of transfer.");
      return;
    }

    if (transferType !== 'Purchase' && sources.some(s => s.fromClientId === toClientId)) {
      alert("Cannot transfer to the same client.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createOwnershipTransfer({
        toClientId: toClientId,
        transferDate: new Date(transferDate).toISOString(),
        transferType: transferType,
        sources: sources.map(s => ({
          fromClientId: s.fromClientId,
          inwardId: s.inwardId,
          transferWeight: s.transferWeight,
          transferBags: s.transferBags
        }))
      });

      if (res.success) {
        alert("Ownership has been transferred successfully.");
        const url = `/api/cold/receipt/html?batchId=${res.transferId}&type=transfer`;
        window.open(url, '_blank');
        router.push('/cold/transfers');
      } else {
        alert("Transfer Failed: " + res.error);
      }
    } catch (error: any) {
      alert("Transfer Failed: " + (error.message || "An unexpected error occurred"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalTransferWeight = sources.reduce((sum, s) => sum + s.transferWeight, 0);
  const totalTransferBags = sources.reduce((sum, s) => sum + s.transferBags, 0);

  return (
    <div className="bg-white p-6 rounded-lg border shadow-sm">
      <div className="space-y-6">
        
        {/* Source Selection Section */}
        <div className="space-y-4">
          <div className="flex justify-between items-center pb-2 border-b">
            <h3 className="text-lg font-bold text-slate-800">1. Select Source(s)</h3>
            <Button 
              type="button" 
              variant="outline" 
              size="sm" 
              onClick={() => setIsSearchModalOpen(true)}
              className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-indigo-200"
            >
              <Search className="w-4 h-4 mr-2" />
              Search Receipt / LOT
            </Button>
          </div>
          
          <div className="space-y-2 mb-4">
            <label className="text-sm font-bold text-slate-700">Transfer Type *</label>
            <div className="flex flex-row space-x-6 mt-2">
              <div className="flex items-center space-x-2">
                <input 
                  type="radio" 
                  id="r1" 
                  name="transferType" 
                  value="Self" 
                  checked={transferType === "Self"} 
                  onChange={(e) => setTransferType(e.target.value as any)}
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                />
                <label htmlFor="r1" className="text-sm font-medium leading-none cursor-pointer text-slate-700">Self (Regular Transfer)</label>
              </div>
              <div className="flex items-center space-x-2">
                <input 
                  type="radio" 
                  id="r2" 
                  name="transferType" 
                  value="Purchase" 
                  checked={transferType === "Purchase"} 
                  onChange={(e) => setTransferType(e.target.value as any)}
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                />
                <label htmlFor="r2" className="text-sm font-medium leading-none cursor-pointer text-slate-700">Purchase</label>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Current Client (From Client) *</label>
              <SearchableSelect
                value={fromClientId}
                onValueChange={(val) => {
                  setPendingInwardId(null);
                  setFromClientId(val);
                }}
                options={clients.map(c => ({ value: c._id, label: c.name }))}
                placeholder="Select Client"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Inward Receipt * {loadingInwards ? <Loader2 className="inline w-3 h-3 animate-spin ml-2 text-indigo-500" /> : null}</label>
              <Select onValueChange={setInwardId} value={inwardId} disabled={!fromClientId || availableInwards.length === 0}>
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder={availableInwards.length === 0 && fromClientId ? "No available stock found" : "Select Receipt"} />
                </SelectTrigger>
                <SelectContent>
                  {availableInwards.map(inv => (
                    <SelectItem key={inv._id} value={inv._id}>
                      LOT: {inv.lotNo || '-'} | Receipt: {inv.receiptNumber || '-'} | {inv.date ? new Date(inv.date).toLocaleDateString('en-GB') : ''} | {inv.commodityId?.name}{inv.commodityId?.type ? `(${inv.commodityId.type})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {selectedInwardDetails ? (
              <div className="col-span-1 md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Transfer Net Weight ({selectedInwardDetails?.unit || selectedInwardDetails?.commodityId?.unit || 'KG'}) *</label>
                  <Input
                    type="number"
                    step="0.01"
                    className="bg-white"
                    value={transferWeight}
                    onChange={(e) => {
                      const val = e.target.value === '' ? '' : Number(e.target.value);
                      setTransferWeight(val);
                      if (selectedInwardDetails && val !== '') {
                        const ratio = (selectedInwardDetails.originalQuantityKg || selectedInwardDetails.quantityKg || 0) / (selectedInwardDetails.originalBagsCount || selectedInwardDetails.bagsCount || 1);
                        if (ratio > 0) {
                          const calcBags = Math.round(val / ratio);
                          setTransferBags(calcBags);
                        }
                      }
                    }}
                  />
                  <p className="text-xs text-slate-500">Available: <span className="font-bold text-red-500">{formatNumber(selectedInwardDetails.availableQty)}</span></p>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Transfer Bags *</label>
                  <Input
                    type="number"
                    className="bg-white"
                    value={transferBags}
                    onChange={(e) => {
                      const val = e.target.value === '' ? '' : Number(e.target.value);
                      const wholeVal = val === '' ? '' : Math.round(val);
                      setTransferBags(wholeVal);
                      if (selectedInwardDetails && wholeVal !== '') {
                        const ratio = (selectedInwardDetails.originalQuantityKg || selectedInwardDetails.quantityKg || 0) / (selectedInwardDetails.originalBagsCount || selectedInwardDetails.bagsCount || 1);
                        if (ratio > 0) {
                          const calcWeight = Number((wholeVal * ratio).toFixed(2));
                          setTransferWeight(calcWeight);
                        }
                      }
                    }}
                  />
                  <p className="text-xs text-slate-500">Available: <span className="font-bold text-red-500">{formatNumber(selectedInwardDetails.availableBags)}</span></p>
                </div>
              </div>
            ) : null}
            
            <div className="col-span-1 md:col-span-2 flex justify-end mt-2">
              <Button type="button" onClick={handleAddSource} className="bg-indigo-600 hover:bg-indigo-700">
                <Plus className="w-4 h-4 mr-2" /> Add Source to Transfer
              </Button>
            </div>
          </div>
        </div>

        {/* Selected Sources List */}
        {sources.length > 0 ? (
          <div className="space-y-3 pt-4 border-t">
            <h4 className="font-semibold text-slate-800 text-md">Selected Sources</h4>
            <div className="border rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-sm text-left text-slate-600">
                <thead className="bg-slate-50 text-slate-700 font-semibold border-b">
                  <tr>
                    <th className="px-4 py-3">Client</th>
                    <th className="px-4 py-3">Receipt / LOT</th>
                    <th className="px-4 py-3">Commodity</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3 text-right">Transfer Wt.</th>
                    <th className="px-4 py-3 text-right">Bags</th>
                    <th className="px-4 py-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sources.map((s, idx) => (
                    <tr key={s.id} className="bg-white hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-800">{s.clientName}</td>
                      <td className="px-4 py-3">
                        <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md font-mono text-xs mr-2">{s.receiptNumber}</span>
                        {s.lotNo}
                      </td>
                      <td className="px-4 py-3">{s.commodityName}</td>
                      <td className="px-4 py-3 text-slate-500">{s.inwardDate}</td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-600">{formatNumber(s.transferWeight)} {s.unit}</td>
                      <td className="px-4 py-3 text-right font-bold text-blue-600">{formatNumber(s.transferBags)}</td>
                      <td className="px-4 py-3 text-center">
                        <Button variant="ghost" size="sm" onClick={() => handleRemoveSource(s.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8 w-8 p-0">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 border-t border-slate-200">
                  <tr>
                    <td colSpan={4} className="px-4 py-3 font-bold text-right text-slate-800 uppercase tracking-wider text-xs">Total Selected:</td>
                    <td className="px-4 py-3 text-right font-black text-emerald-600 text-base">{formatNumber(totalTransferWeight)}</td>
                    <td className="px-4 py-3 text-right font-black text-blue-600 text-base">{formatNumber(totalTransferBags)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        ) : null}

        <div className="space-y-4 pt-4 border-t">
          <h3 className="text-lg font-bold text-slate-800">2. Select Destination</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">New Client (To Client) *</label>
              {transferType === 'Purchase' ? (
                <div className="flex h-10 w-full items-center rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 font-medium shadow-sm">
                  {selectedInwardDetails?.warehouseId?.name || (sources.length > 0 ? (clients.find(c => c._id === sources[0].fromClientId)?.name + " (Warehouse)") : '-')}
                </div>
              ) : (
                <SearchableSelect
                  value={toClientId}
                  onValueChange={setToClientId}
                  options={clients.map(c => ({ value: c._id, label: c.name }))}
                  placeholder="Select Destination Client"
                />
              )}
            </div>

            <div className="space-y-2 flex flex-col">
              <label className="text-sm font-semibold text-slate-700">Date of Transfer *</label>
              <input
                type="date"
                value={transferDate}
                onChange={(e) => setTransferDate(e.target.value)}
                className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-6 border-t mt-8">
          <Button 
            type="button" 
            variant="outline" 
            className="mr-3" 
            onClick={() => router.push('/cold/transfers')}
          >
            Cancel
          </Button>
          <Button 
            type="button" 
            onClick={onSubmit}
            disabled={isSubmitting || sources.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-8 shadow-sm"
          >
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Submit Transfer
          </Button>
        </div>
      </div>

      <SearchTransferStockModal 
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        onSelect={(id, clientId) => {
          if (fromClientId === clientId) {
             setInwardId(id);
          } else {
             setPendingInwardId(id);
             setFromClientId(clientId);
          }
        }}
        onSelectMultiple={(inwards) => {
          const newSources = inwards.map(inv => {
            const clientIdStr = inv.clientId?._id || inv.clientId;
            const clientName = inv.clientId?.name || clients.find(c => c._id === clientIdStr)?.name || 'Unknown';
            return {
              id: Math.random().toString(36).substr(2, 9),
              fromClientId: clientIdStr,
              clientName,
              inwardId: inv._id,
              receiptNumber: inv.receiptNumber || '-',
              lotNo: inv.lotNo || '-',
              commodityName: inv.commodityId?.name + (inv.commodityId?.type ? ` (${inv.commodityId.type})` : ''),
              unit: inv.unit || inv.commodityId?.unit || 'KG',
              inwardDate: inv.date ? new Date(inv.date).toLocaleDateString('en-GB') : '',
              transferWeight: inv.availableQty,
              transferBags: inv.availableBags,
              availableQty: inv.availableQty,
              availableBags: inv.availableBags
            };
          });
          setSources(prev => [...prev, ...newSources]);
        }}
      />
    </div>
  );
}
