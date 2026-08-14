'use client';

import { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getPurchaseStock } from '@/app/actions/cold-purchase-actions';
import { getDynamicUnitLabel } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface PurchaseModuleClientProps {
  warehouses: any[];
}

export default function PurchaseModuleClient({ warehouses }: PurchaseModuleClientProps) {
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [purchaseStock, setPurchaseStock] = useState<any[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!selectedWarehouse) {
      setPurchaseStock([]);
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

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
        <div className="max-w-md">
          <label className="block text-sm font-medium text-slate-700 mb-2">Select Warehouse</label>
          <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
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
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
            <h2 className="font-semibold text-lg text-slate-800">
              Purchase Stock Details
            </h2>
            <div className="text-sm font-medium bg-blue-100 text-blue-800 px-3 py-1 rounded-full">
              {purchaseStock.length} Records
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
                ) : purchaseStock.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      No purchase stock available in this warehouse.
                    </td>
                  </tr>
                ) : (
                  purchaseStock.map((stock: any, idx: number) => (
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
