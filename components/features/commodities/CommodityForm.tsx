'use client';

import React, { useState } from 'react';
import { useWarehouse } from '@/contexts/WarehouseContext';

export default function CommodityForm() {
  const { addCommodity } = useWarehouse();
  const [formData, setFormData] = useState({
    name: '',
    variety: '',
    rate: 0,
    rateUnit: 'day' as 'day' | 'month',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'rate' ? parseFloat(value) || 0 : value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.name && formData.rate > 0) {
      addCommodity(formData);
      setFormData({ name: '', variety: '', rate: 0, rateUnit: 'day' });
    }
  };

  return (
    <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-6 mb-6">
      <h3 className="text-lg font-semibold text-slate-800 mb-4">Add Commodity</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1">
            Name *
          </label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
            className="w-full rounded-md border border-slate-300 p-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="Enter commodity name"
          />
        </div>
        <div>
          <label htmlFor="variety" className="block text-sm font-medium text-slate-700 mb-1">
            Variety (Optional)
          </label>
          <input
            type="text"
            id="variety"
            name="variety"
            value={formData.variety}
            onChange={handleChange}
            className="w-full rounded-md border border-slate-300 p-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="Enter variety (e.g. Lokwan)"
          />
        </div>
        <div>
          <label htmlFor="rate" className="block text-sm font-medium text-slate-700 mb-1">
            Rate per MT *
          </label>
          <input
            type="number"
            id="rate"
            name="rate"
            value={formData.rate}
            onChange={handleChange}
            required
            min="0"
            step="0.01"
            className="w-full rounded-md border border-slate-300 p-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="Enter rate"
          />
        </div>
        <div>
          <label htmlFor="rateUnit" className="block text-sm font-medium text-slate-700 mb-1">
            Rate Unit *
          </label>
          <select
            id="rateUnit"
            name="rateUnit"
            value={formData.rateUnit}
            onChange={handleChange}
            className="w-full rounded-md border border-slate-300 p-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="day">Per Day</option>
            <option value="month">Per Month</option>
          </select>
        </div>
        <button
          type="submit"
          className="w-full bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
        >
          Add Commodity
        </button>
      </form>
    </div>
  );
}