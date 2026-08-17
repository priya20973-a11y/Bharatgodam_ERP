'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { toast } from 'react-hot-toast';
import { generateColdClientInvoicePreview, saveColdClientInvoice } from '@/app/actions/cold-invoice-actions';
import { generateColdInvoiceHTML } from '@/lib/invoice/cold-invoice-pdf';

interface ColdInvoiceGeneratorProps {
  warehouses: any[];
  clients: any[];
  userDetails: any;
}

export default function ColdInvoiceGenerator({ warehouses, clients, userDetails }: ColdInvoiceGeneratorProps) {
  const [warehouseId, setWarehouseId] = useState('');
  const [clientId, setClientId] = useState('');
  const [selectedOutwardIds, setSelectedOutwardIds] = useState<string[]>([]);
  const [outwardDropdownOpen, setOutwardDropdownOpen] = useState(false);
  const [additionalCharges, setAdditionalCharges] = useState<{name: string, amount: number}[]>([]);
  const [outwards, setOutwards] = useState<any[]>([]);
  
  
  const [preview, setPreview] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const handlePreview = async () => {
    if (!warehouseId || !clientId || selectedOutwardIds.length === 0) {
      toast.error('Please select warehouse, client and at least one outward transaction');
      return;
    }
    
    setLoading(true);
    try {
      const data = await generateColdClientInvoicePreview(warehouseId, clientId, null, null, selectedOutwardIds);
      setPreview(data);
      if (data.items.length === 0) {
        toast.error('No valid transactions found for the selected period.');
      } else {
        toast.success('Preview generated');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate preview');
    } finally {
      setLoading(false);
    }
  };

  // Fetch outwards when warehouse or client changes
  React.useEffect(() => {
    const fetchOutwards = async () => {
      if (!warehouseId || !clientId) {
        setOutwards([]);
        return;
      }

      try {
        const qs = `?clientId=${encodeURIComponent(clientId)}&warehouseId=${encodeURIComponent(warehouseId)}`;
        const res = await fetch(`/api/cold/outwards${qs}`);
        const json = await res.json();
        if (res.ok && json.success) setOutwards(json.data || []);
      } catch (e) {
        console.error('Failed to load outwards', e);
      }
    };

    fetchOutwards();
  }, [warehouseId, clientId]);

  const toggleOutwardSelection = (id: string) => {
    setSelectedOutwardIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleGenerate = async () => {
    if (!preview || preview.items.length === 0) return;
    
    setGenerating(true);
    
    const finalTotalAmount = preview.totalAmount + additionalCharges.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
    
    try {
      // derive invoice date range from selected outward (use its date as both from/to)
      // derive invoice date range from selected outwards (min and max dates)
      const selectedOutwards = outwards.filter(o => selectedOutwardIds.includes(o._id?.toString()));
      let invoiceFrom = new Date();
      let invoiceTo = new Date();
      if (selectedOutwards.length > 0) {
        const dates = selectedOutwards.map(o => new Date(o.date));
        invoiceFrom = new Date(Math.min(...dates.map(d => d.getTime())));
        invoiceTo = new Date(Math.max(...dates.map(d => d.getTime())));
      }

      const savedInvoice = await saveColdClientInvoice({
        warehouseId,
        clientId,
        fromDate: invoiceFrom,
        toDate: invoiceTo,
        items: preview.items,
        additionalCharges,
        totalAmount: finalTotalAmount
      });
      
      const client = clients.find(c => c._id === clientId);
      const warehouse = warehouses.find(w => w._id === warehouseId);
      
      const html = generateColdInvoiceHTML(savedInvoice, client, warehouse, userDetails, userDetails.coldLanguage || 'en');
      
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      document.body.appendChild(iframe);
      
      iframe.contentWindow?.document.open();
      iframe.contentWindow?.document.write(html);
      iframe.contentWindow?.document.close();
      
      setTimeout(() => {
        if (iframe.contentWindow) {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
        }
        setTimeout(() => document.body.removeChild(iframe), 2000);
      }, 500);
      
      toast.success('Invoice generated successfully');
      setPreview(null);
      setAdditionalCharges([]);
    } catch (err: any) {
      toast.error(err.message || 'Failed to save invoice');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Generate Client Invoice (Cold Storage)</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Warehouse</label>
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger><SelectValue placeholder="Select Warehouse" /></SelectTrigger>
              <SelectContent>
                {warehouses.map(w => (
                  <SelectItem key={w._id} value={w._id?.toString()}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Client</label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger><SelectValue placeholder="Select Client" /></SelectTrigger>
              <SelectContent>
                {clients.map(c => (
                  <SelectItem key={c._id} value={c._id?.toString()}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Outward Transactions</label>
            <div className="relative">
              <button type="button" className="w-full border rounded p-2 text-left" onClick={() => setOutwardDropdownOpen(!outwardDropdownOpen)}>
                {selectedOutwardIds.length === 0 ? 'Select Outward Transactions' : `${selectedOutwardIds.length} selected`}
              </button>
              {outwardDropdownOpen && (
                <div className="absolute z-50 mt-1 w-full max-h-56 overflow-auto border rounded bg-white shadow-lg p-2">
                  {outwards.length === 0 && <div className="text-sm text-slate-500 p-2">No outwards found</div>}
                  {outwards.map(o => (
                    <div key={o._id} className="flex items-center justify-between gap-2 p-2 hover:bg-slate-50 rounded">
                      <label className="flex items-center gap-3">
                        <input type="checkbox" checked={selectedOutwardIds.includes(o._id?.toString())} onChange={() => {
                          const idStr = o._id?.toString();
                          setSelectedOutwardIds(prev => prev.includes(idStr) ? prev.filter(x => x !== idStr) : [...prev, idStr]);
                        }} />
                        <div className="text-sm">
                          <div className="font-medium">{o.receiptNo || o._id} — {o.commodityName || o.commodityId?.name} — {new Date(o.date).toLocaleDateString()}</div>
                          <div className="text-xs text-slate-500">{o.quantityKg} Kg</div>
                        </div>
                      </label>
                      <div className="flex items-center gap-2">
                        <a className="text-xs text-indigo-600 hover:underline" target="_blank" rel="noreferrer" href={`/api/cold/receipt/html?type=outward&id=${o._id}`}>View Outward</a>
                        <div className="text-sm font-semibold">₹{(o.rentRs||0).toFixed(2)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
          <CardFooter className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setPreview(null)}>Clear</Button>
          <Button onClick={handlePreview} disabled={loading || !warehouseId || !clientId || selectedOutwardIds.length === 0}>
            {loading ? 'Calculating...' : 'Preview Invoice'}
          </Button>
        </CardFooter>
      </Card>

      {preview && preview.items.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Invoice Preview</CardTitle>
            <div className="text-xl font-bold text-indigo-700">Total: ₹{(preview.totalAmount + additionalCharges.reduce((sum, c) => sum + (Number(c.amount) || 0), 0)).toFixed(2)}</div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <th className="p-3 border">Commodity</th>
                  <th className="p-3 border">Inward (Kg)</th>
                  <th className="p-3 border">Outward (Kg)</th>
                  <th className="p-3 border">Balance (Kg)</th>
                  <th className="p-3 border">Inward Date</th>
                  <th className="p-3 border">Outward Date</th>
                  <th className="p-3 border">Days</th>
                  <th className="p-3 border text-right">Rent (₹)</th>
                </tr>
              </thead>
              <tbody>
                {preview.items.map((item: any, idx: number) => (
                  <tr key={idx} className="border-b hover:bg-slate-50">
                    <td className="p-3 border">{item.commodityName}</td>
                    <td className="p-3 border font-medium">{item.quantityKg.toFixed(2)}</td>
                    <td className="p-3 border text-rose-600">{item.outwardKg.toFixed(2)}</td>
                    <td className="p-3 border font-bold text-emerald-600">{item.balanceKg.toFixed(2)}</td>
                    <td className="p-3 border">{new Date(item.inwardDate).toLocaleDateString('en-GB')}</td>
                    <td className="p-3 border">{item.outwardDate ? new Date(item.outwardDate).toLocaleDateString('en-GB') : '-'}</td>
                    <td className="p-3 border">{item.days}</td>
                    <td className="p-3 border text-right font-bold">₹{item.subtotal.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {/* Outward selection moved to top dropdown (multi-select) */}
            <div className="mt-6 border-t pt-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-semibold">Additional Charges</h3>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setAdditionalCharges([...additionalCharges, {name: '', amount: 0}])}>
                    + Add Charge
                  </Button>
                  {additionalCharges.length > 0 && (
                    <Button variant="secondary" size="sm" onClick={() => toast.success('Additional charges saved and applied to total')}>
                      Save Charges
                    </Button>
                  )}
                </div>
              </div>
              
              {additionalCharges.map((charge, idx) => (
                <div key={idx} className="flex gap-4 items-center mb-3">
                  <div className="flex-1 space-y-1">
                    <label className="text-xs text-slate-500">Charge Name</label>
                    <Input 
                      placeholder="e.g. Loading/Unloading" 
                      value={charge.name} 
                      onChange={e => {
                        const newCharges = [...additionalCharges];
                        newCharges[idx].name = e.target.value;
                        setAdditionalCharges(newCharges);
                      }} 
                    />
                  </div>
                  <div className="w-48 space-y-1">
                    <label className="text-xs text-slate-500">Amount (₹)</label>
                    <Input 
                      type="number" 
                      placeholder="0.00" 
                      value={charge.amount || ''} 
                      onChange={e => {
                        const newCharges = [...additionalCharges];
                        newCharges[idx].amount = Number(e.target.value);
                        setAdditionalCharges(newCharges);
                      }} 
                    />
                  </div>
                  <div className="pt-5">
                    <Button variant="destructive" size="sm" onClick={() => {
                      const newCharges = [...additionalCharges];
                      newCharges.splice(idx, 1);
                      setAdditionalCharges(newCharges);
                    }}>Remove</Button>
                  </div>
                </div>
              ))}
            </div>
            
          </CardContent>
          <CardFooter className="flex justify-end bg-slate-50 p-4">
            <Button onClick={handleGenerate} disabled={generating} className="bg-indigo-600 hover:bg-indigo-700">
              {generating ? 'Generating...' : 'Save & Print Invoice'}
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
