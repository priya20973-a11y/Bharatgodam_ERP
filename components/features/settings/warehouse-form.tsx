'use client';

import React, { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Trash2, PlusCircle, Settings, Save } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { WarehouseConfigSchema, WarehouseConfigValues } from '@/lib/schemas/warehouse-client';
import { updateWarehouseConfig } from '@/app/actions/warehouse-config';

export default function WarehouseConfigForm({ initialData }: { initialData?: Partial<WarehouseConfigValues> }) {
  const [isSaving, setIsSaving] = useState(false);

  // Setup Form
  const { register, control, handleSubmit, formState: { errors } } = useForm<WarehouseConfigValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(WarehouseConfigSchema) as any,
    defaultValues: initialData || {
      warehouseName: 'Main Hub',
      address: '',
      contactEmail: '',
      totalCapacitySqFt: 100000,
      commodities: [{ name: 'General Storage', ratePerSqFt: 1.50, isActive: true }]
    }
  });

  // Dynamic Array for Commodities
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'commodities'
  });

  const onSubmit = async (data: WarehouseConfigValues) => {
    // Safety confirmation guard
    if (!window.confirm("WARNING: Changing pricing rates will affect all future bookings. Do you want to proceed?")) return;

    setIsSaving(true);
    const result = await updateWarehouseConfig(data);
    
    if (result.success) {
      toast.success(result.message);
    } else {
      toast.error(result.message);
    }
    setIsSaving(false);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 max-w-4xl mx-auto">
      <h2 className="text-xl font-bold flex items-center text-slate-900 mb-6 border-b pb-4">
        <Settings className="w-5 h-5 mr-2 text-slate-500" />
        Master Configuration Rules
      </h2>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        
        {/* SECTION 1: General Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Facility Name</label>
            <input {...register('warehouseName')} className="w-full rounded-md border border-slate-300 p-2 focus:ring-2 focus:ring-blue-500" />
            {errors.warehouseName && <span className="text-sm text-red-500">{errors.warehouseName.message}</span>}
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Total Capacity (SqFt)</label>
            <input type="number" {...register('totalCapacitySqFt')} className="w-full rounded-md border border-slate-300 p-2 focus:ring-2 focus:ring-blue-500" />
            {errors.totalCapacitySqFt && <span className="text-sm text-red-500">{errors.totalCapacitySqFt.message}</span>}
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-semibold text-slate-700 mb-2">Full Address</label>
            <textarea {...register('address')} rows={2} className="w-full rounded-md border border-slate-300 p-2 focus:ring-2 focus:ring-blue-500" placeholder="123 Industrial Parkway..."/>
            {errors.address && <span className="text-sm text-red-500">{errors.address.message}</span>}
          </div>
        </div>

        {/* SECTION 2: Dynamic Pricing Engine */}
        <div className="pt-6 border-t border-slate-200">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-slate-800">Commodities & Pricing</h3>
            <button 
              type="button" 
              onClick={() => append({ name: '', ratePerSqFt: 0, isActive: true })}
              className="text-sm flex items-center bg-blue-50 text-blue-600 px-3 py-1.5 rounded-md hover:bg-blue-100 font-medium"
            >
              <PlusCircle className="w-4 h-4 mr-1" /> Add Commodity Type
            </button>
          </div>

          <div className="space-y-4">
            {fields.map((field, index) => (
              <div key={field.id} className="flex flex-wrap md:flex-nowrap items-center gap-4 bg-slate-50 p-4 rounded-lg border border-slate-100">
                <div className="flex-1">
                  <label className="block text-xs text-slate-500 font-bold uppercase mb-1">Item Category (e.g. Chemical)</label>
                  <input {...register(`commodities.${index}.name`)} className="w-full rounded border-slate-300 p-2 text-sm focus:ring-blue-500" placeholder="Category Name" />
                </div>
                <div className="w-32">
                <label className="block text-xs text-slate-500 font-bold uppercase mb-1">Rate / SqFt</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-slate-400">$</span>
                    <input type="number" step="0.01" {...register(`commodities.${index}.ratePerSqFt`)} className="w-full rounded border-slate-300 pl-7 p-2 text-sm focus:ring-blue-500" />
                  </div>
                </div>
                <div className="w-32 flex flex-col justify-center pt-5">
                  <label className="inline-flex items-center cursor-pointer">
                    <input type="checkbox" {...register(`commodities.${index}.isActive`)} className="sr-only peer" />
                    <div className="w-9 h-5 bg-slate-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
                    <span className="ml-2 text-sm text-slate-600">Active</span>
                  </label>
                </div>
                {fields.length > 1 && (
                  <button type="button" onClick={() => remove(index)} className="pt-5 text-slate-400 hover:text-red-500 transition-colors">
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
              </div>
            ))}
            {errors.commodities && <p className="text-sm text-red-500 border-l-2 border-red-500 pl-2">{errors.commodities.message}</p>}
          </div>
        </div>

        {/* Action Button */}
        <div className="pt-6 flex justify-end">
          <button type="submit" disabled={isSaving} className="flex items-center bg-slate-900 hover:bg-slate-800 text-white font-semibold py-2.5 px-6 rounded-lg transition-all disabled:opacity-50">
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? 'Applying Changes...' : 'Save Configuration'}
          </button>
        </div>
      </form>
    </div>
  );
}

