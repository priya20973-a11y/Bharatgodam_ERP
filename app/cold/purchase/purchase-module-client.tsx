'use client';

import { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getPurchaseStock } from '@/app/actions/cold-purchase-actions';
import { getDynamicUnitLabel } from '@/lib/utils';
import { Loader2, Download, Search } from 'lucide-react';

interface PurchaseModuleClientProps {
  warehouses: any[];
}

export default function PurchaseModuleClient({ warehouses }: PurchaseModuleClientProps) {
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [purchaseStock, setPurchaseStock] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!selectedWarehouse) {
      setPurchaseStock([]);
      setSearchTerm('');
      return;
    }

    const fetchStock = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await getPurchaseStock(selectedWarehouse);
        if (res.success) {
          setPurchaseStock(res.data || []);
        } else {
          setError(res.error || 'Failed to fetch purchase stock');
        }
      } catch (err) {
        setError('An unexpected error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchStock();
  }, [selectedWarehouse]);

  const filteredStock = purchaseStock.filter(stock => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const location = `c${stock.chamber}-f${stock.floor}-s${stock.stack}`.toLowerCase();
    return (
      stock.clientName?.toLowerCase().includes(term) ||
      stock.farmerName?.toLowerCase().includes(term) ||
      stock.referencePerson?.toLowerCase().includes(term) ||
      stock.commodity?.toLowerCase().includes(term) ||
      location.includes(term)
    );
  });

  const handleExportCSV = () => {
    if (!filteredStock || filteredStock.length === 0) return;

    const warehouseObj = warehouses.find(w => w._id === selectedWarehouse);
    const warehouseName = warehouseObj?.name || 'Warehouse';
    const headers = ['Client / Farmer', 'Reference Person', 'Commodity', 'Location (C/F/S)', 'Purchase Qty', 'Available Qty', 'Unit'];

    const csvRows = [
      headers.join(','),
      ...filteredStock.map((s: any) => {
        const clientFarmer = s.farmerName && s.farmerName !== '-' ? `${s.clientName} (Farmer: ${s.farmerName})` : s.clientName;
        const location = `C${s.chamber}-F${s.floor}-S${s.stack}`;
        const unitLabel = getDynamicUnitLabel(s.unit, 'weight');
        return [
          `"${(clientFarmer || '').replace(/"/g, '""')}"`,
          `"${(s.referencePerson || '').replace(/"/g, '""')}"`,
          `"${(s.commodity || '').replace(/"/g, '""')}"`,
          `"${location}"`,
          s.purchaseQuantity ?? 0,
          s.availableQuantity ?? 0,
          `"${unitLabel}"`
        ].join(',');
      })
    ];

    const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeWarehouseName = warehouseName.replace(/[^a-zA-Z0-9]/g, '_');
    const dateStr = new Date().toISOString().slice(0, 10);
    link.setAttribute('href', url);
    link.setAttribute('download', `Purchase_Stock_${safeWarehouseName}_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
        <div className="max-w-md">
          <label className="block text-sm font-medium text-slate-700 mb-2">Select Warehouse</label>
          <Select value={selectedWarehouse} onValueChange={(val) => {
            setSelectedWarehouse(val);
            setSearchTerm('');
          }}>
            <SelectTrigger>
              <SelectValue placeholder="-- Select a Warehouse --" />
            </SelectTrigger>
            <SelectContent>
              {warehouses.map((w: any) => (
                <SelectItem key={w._id} value={w._id}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedWarehouse && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <h2 className="font-semibold text-lg text-slate-800">
                Purchase Stock Details
              </h2>
              <span className="text-xs font-semibold bg-blue-100 text-blue-800 px-3 py-1 rounded-full">
                {filteredStock.length} Records
              </span>
            </div>
            
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Filter stock..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 text-sm bg-white border-slate-300"
                />
              </div>
              <Button 
                onClick={handleExportCSV} 
                disabled={filteredStock.length === 0} 
                variant="outline"
                className="bg-white hover:bg-slate-50 border-slate-300 gap-2 shrink-0 font-medium text-slate-700 hover:text-slate-900"
              >
                <Download className="w-4 h-4 text-emerald-600" />
                Export CSV
              </Button>
            </div>
          </div>

          <div className="p-0 overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-600 bg-slate-100 uppercase">
                <tr>
                  <th className="px-4 py-3">Client / Farmer</th>
                  <th className="px-4 py-3">Reference Person</th>
                  <th className="px-4 py-3">Commodity</th>
                  <th className="px-4 py-3">Location (C/F/S)</th>
                  <th className="px-4 py-3 text-right">Purchase Qty</th>
                  <th className="px-4 py-3 text-right text-blue-700">Available Qty</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                      Loading purchase stock...
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-red-500">
                      {error}
                    </td>
                  </tr>
                ) : filteredStock.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      {searchTerm ? 'No matching purchase stock records found.' : 'No purchase stock available in this warehouse.'}
                    </td>
                  </tr>
                ) : (
                  filteredStock.map((stock: any, idx: number) => (
                    <tr key={`${stock.inwardId}-${stock.chamber}-${stock.floor}-${stock.stack}-${idx}`} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{stock.clientName}</div>
                        {stock.farmerName !== '-' && <div className="text-xs text-slate-500">Farmer: {stock.farmerName}</div>}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{stock.referencePerson}</td>
                      <td className="px-4 py-3 font-medium text-slate-700">{stock.commodity}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-800">
                          C{stock.chamber}-F{stock.floor}-S{stock.stack}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {Number(stock.purchaseQuantity).toLocaleString()} {getDynamicUnitLabel(stock.unit, 'weight')}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-blue-700">
                        {Number(stock.availableQuantity).toLocaleString()} {getDynamicUnitLabel(stock.unit, 'weight')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
