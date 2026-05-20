'use client';

import React, { useState } from 'react';
import { useWarehouse } from '@/contexts/WarehouseContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const WAREHOUSES = [
  { id: 'WH1', name: 'Warehouse 1' },
  { id: 'WH2', name: 'Warehouse 2' },
  { id: 'WH3', name: 'Warehouse 3' },
  { id: 'WH4', name: 'Warehouse 4' },
  { id: 'WH5', name: 'Warehouse 5' },
];

export default function OutwardBookingForm() {
  const { clients, commodities } = useWarehouse();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    clientId: '',
    warehouseId: '',
    commodityId: '',
    date: '',
    weight: 0,
  });

  const selectedClient = clients.find(client => client.id === formData.clientId);
  const allowedCommodities = selectedClient?.commodityIds?.length
    ? commodities.filter(commodity => selectedClient.commodityIds?.includes(commodity.id))
    : commodities;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'weight' ? parseFloat(value) || 0 : value
    }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => {
      const next = { ...prev, [name]: value };
      if (name === 'clientId' && prev.commodityId) {
        const client = clients.find(c => c.id === value);
        const isValidCommodity = client?.commodityIds?.includes(prev.commodityId);
        if (!isValidCommodity) {
          next.commodityId = '';
        }
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.clientId && formData.warehouseId && formData.commodityId && formData.date && formData.weight > 0) {
      setIsSubmitting(true);

      try {
        const response = await fetch('/api/bookings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            direction: 'OUTWARD',
            date: formData.date,
            warehouseName: WAREHOUSES.find(w => w.id === formData.warehouseId)?.name || formData.warehouseId,
            clientName: clients.find(c => c.id === formData.clientId)?.name || formData.clientId,
            commodityName: commodities.find(c => c.id === formData.commodityId)?.name || formData.commodityId,
            mt: formData.weight,
          }),
        });

        const result = await response.json();

        if (result.success) {
          setFormData({
            clientId: '',
            warehouseId: '',
            commodityId: '',
            date: '',
            weight: 0,
          });
          alert('Outward booking created successfully!');
        } else {
          alert(result.message || 'Failed to create outward booking');
        }
      } catch (error) {
        console.error('Error creating outward booking:', error);
        alert('Failed to create outward booking. Please try again.');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-slate-800 mb-4">Outward Booking</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Client *</label>
          <Select value={formData.clientId} onValueChange={(value) => handleSelectChange('clientId', value)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select client" />
            </SelectTrigger>
            <SelectContent>
              {clients.map(client => (
                <SelectItem key={client.id} value={client.id}>
                  {client.name}
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
              {WAREHOUSES.map(wh => (
                <SelectItem key={wh.id} value={wh.id}>
                  {wh.name}
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
              {allowedCommodities.map(commodity => (
                <SelectItem key={commodity.id} value={commodity.id}>
                  {commodity.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedClient?.commodityIds?.length ? (
            <p className="text-xs text-slate-500 mt-1">Showing commodities assigned to {selectedClient.name}.</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="date" className="block text-sm font-medium text-slate-700 mb-1">Date *</label>
          <input
            type="date"
            id="date"
            name="date"
            value={formData.date}
            onChange={handleChange}
            required
            className="w-full rounded-md border border-slate-300 p-2 text-sm focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label htmlFor="weight" className="block text-sm font-medium text-slate-700 mb-1">Weight (MT) *</label>
          <input
            type="number"
            id="weight"
            name="weight"
            value={formData.weight}
            onChange={handleChange}
            required
            min="0"
            step="0.1"
            className="w-full rounded-md border border-slate-300 p-2 text-sm focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Creating Booking...' : 'Create Outward Booking'}
        </button>
      </form>
    </div>
  );
}