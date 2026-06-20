'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import toast from 'react-hot-toast';
import { createStockEntry, getCurrentStock, getMasterData } from '@/app/actions/stock-ledger-actions';
import type { IClient, ICommodity, IWarehouse } from '@/types/schemas';
import { getDropdownDisplayName } from '@/lib/utils';

export default function OutwardPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const isAdmin = (session?.user as any)?.role === 'ADMIN';
  
  // Redirect to login if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/');
    }
  }, [status, router]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentStock, setCurrentStock] = useState<number>(0);
  const [masterData, setMasterData] = useState<{
    clients: IClient[];
    commodities: ICommodity[];
    warehouses: IWarehouse[];
  }>({
    clients: [],
    commodities: [],
    warehouses: [],
  });

  const [formData, setFormData] = useState({
    clientId: '',
    warehouseId: '',
    commodityId: '',
    quantityMT: 0,
    bagsCount: 0,
    inwardDate: '', // Not used for outward, but required by interface
    actualOutwardDate: '',
    ratePerMTPerDay: 10, // Will be fetched from existing stock
    gatePass: '',
    remarks: '',
  });

  // Fetch master data on component mount
  useEffect(() => {
    const fetchMasterData = async () => {
      try {
        const data = await getMasterData();
        setMasterData(data);
      } catch (error) {
        console.error('Error fetching master data:', error);
        toast.error('Failed to load master data');
      } finally {
        setIsLoading(false);
      }
    };

    if (session) {
      fetchMasterData();
    }
  }, [session]);

  // Update current stock when selections change
  useEffect(() => {
    const updateStock = async () => {
      if (formData.clientId && formData.warehouseId && formData.commodityId) {
        try {
          const stock = await getCurrentStock(formData.clientId, formData.warehouseId, formData.commodityId);
          setCurrentStock(stock);
        } catch (error) {
          console.error('Error fetching current stock:', error);
          setCurrentStock(0);
        }
      } else {
        setCurrentStock(0);
      }
    };

    updateStock();
  }, [formData.clientId, formData.warehouseId, formData.commodityId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'quantityMT' || name === 'ratePerMTPerDay' || name === 'bagsCount'
        ? parseFloat(value) || 0
        : value
    }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.clientId && formData.warehouseId && formData.commodityId && formData.actualOutwardDate && formData.quantityMT > 0) {
      if (formData.quantityMT > currentStock) {
        toast.error('Insufficient stock available. Cannot complete outward transaction.');
        return;
      }

      setIsSubmitting(true);

      try {
        const result = await createStockEntry({
          ...formData,
          direction: 'OUTWARD',
        });

        if (result.success) {
          // Reset form
          setFormData({
            clientId: '',
            warehouseId: '',
            commodityId: '',
            quantityMT: 0,
            bagsCount: 0,
            inwardDate: '',
            actualOutwardDate: '',
            ratePerMTPerDay: 10,
            gatePass: '',
            remarks: '',
          });
          setCurrentStock(0);

          toast.success('Outward transaction recorded successfully!');
        } else {
          toast.error(result.message || 'Failed to record outward transaction');
        }
      } catch (error) {
        console.error('Error submitting outward transaction:', error);
        toast.error('Failed to record outward transaction. Please try again.');
      } finally {
        setIsSubmitting(false);
      }
    } else {
      toast.error('Please fill in all required fields');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-8">Outward Withdrawal</h1>
        <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-6">
          {/* Show loading while checking authentication */}
          {status === 'loading' ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
              <p className="mt-2 text-slate-600">Loading...</p>
            </div>
          ) : !session ? (
            <div className="text-center py-8">
              <p className="text-slate-900 font-semibold mb-4">Please log in to access this page</p>
              <p className="text-slate-600 text-sm">You will be redirected to the login page.</p>
            </div>
          ) : isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
              <p className="mt-2 text-slate-600">Loading master data...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Client *</label>
              <Select value={formData.clientId} onValueChange={(value) => handleSelectChange('clientId', value)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  {masterData.clients.map(client => (
                    <SelectItem key={client._id?.toString()} value={client._id?.toString() || ''}>
                      {getDropdownDisplayName(client, masterData.clients, isAdmin)} {client.location ? `(${client.location})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Warehouse *</label>
              <Select value={formData.warehouseId} onValueChange={(value) => handleSelectChange('warehouseId', value)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select warehouse" />
                </SelectTrigger>
                <SelectContent>
                  {masterData.warehouses.map(warehouse => (
                    <SelectItem key={warehouse._id?.toString()} value={warehouse._id?.toString() || ''}>
                      {warehouse.name} (Capacity: {warehouse.capacity} MT, Occupied: {warehouse.occupiedCapacity} MT)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Commodity *</label>
              <Select value={formData.commodityId} onValueChange={(value) => handleSelectChange('commodityId', value)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select commodity" />
                </SelectTrigger>
                <SelectContent>
                  {masterData.commodities.map(commodity => (
                    <SelectItem key={commodity._id?.toString()} value={commodity._id?.toString() || ''}>
                      {getDropdownDisplayName(commodity, masterData.commodities, isAdmin)} ({commodity.category})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {formData.clientId && formData.warehouseId && formData.commodityId && (
              <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                <p className="text-sm text-blue-800">
                  <strong>Current Stock Available:</strong> {currentStock} MT
                </p>
              </div>
            )}

            <div>
              <label htmlFor="quantityMT" className="block text-sm font-medium text-slate-700 mb-1">Quantity to Withdraw (MT) *</label>
              <input
                type="number"
                id="quantityMT"
                name="quantityMT"
                value={formData.quantityMT}
                onChange={handleChange}
                required
                min="0"
                step="0.1"
                max={currentStock}
                className="w-full rounded-md border border-slate-300 p-2 text-sm focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label htmlFor="bagsCount" className="block text-sm font-medium text-slate-700 mb-1">No. of Bags</label>
              <input
                type="number"
                id="bagsCount"
                name="bagsCount"
                value={formData.bagsCount}
                onChange={handleChange}
                min="0"
                step="1"
                className="w-full rounded-md border border-slate-300 p-2 text-sm focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label htmlFor="actualOutwardDate" className="block text-sm font-medium text-slate-700 mb-1">Outward Date *</label>
              <input
                type="date"
                id="actualOutwardDate"
                name="actualOutwardDate"
                value={formData.actualOutwardDate}
                onChange={handleChange}
                required
                className="w-full rounded-md border border-slate-300 p-2 text-sm focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label htmlFor="gatePass" className="block text-sm font-medium text-slate-700 mb-1">Gate Pass</label>
              <input
                type="text"
                id="gatePass"
                name="gatePass"
                value={formData.gatePass}
                onChange={handleChange}
                className="w-full rounded-md border border-slate-300 p-2 text-sm focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label htmlFor="remarks" className="block text-sm font-medium text-slate-700 mb-1">Remarks</label>
              <textarea
                id="remarks"
                name="remarks"
                value={formData.remarks}
                onChange={handleChange}
                rows={3}
                className="w-full rounded-md border border-slate-300 p-2 text-sm focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Processing Withdrawal...' : 'Submit Outward Withdrawal'}
            </button>
          </form>
          )}
        </div>
      </div>
    </div>
  );
}