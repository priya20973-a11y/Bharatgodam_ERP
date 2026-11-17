'use client';

import React, { useState, useEffect } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CommoditySchema, CommodityValues, MongoCommodity } from '@/lib/validations/commodity';
import { addCommodity, updateCommodity } from '@/app/actions/commodities';
import { toast } from 'react-hot-toast';
import { X, Loader2, IndianRupee, Layers } from 'lucide-react';

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  initialData?: MongoCommodity | null;
  onSuccessOptimistic?: (action: 'add' | 'edit', data: Partial<MongoCommodity>) => void;
};

export default function CommodityFormModal({ isOpen, onClose, initialData, onSuccessOptimistic }: ModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = !!initialData;

  const { register, handleSubmit, reset, setValue, formState: { errors, isValid } } = useForm<CommodityValues>({
    resolver: zodResolver(CommoditySchema) as Resolver<CommodityValues>,
    mode: 'onTouched',
  });

  // Hot-Hydration pattern for instantaneous Edit-Mode Injection
  useEffect(() => {
    if (initialData && isOpen) {
      setValue('name', initialData.name);
      setValue('variety', initialData.variety || '');
      setValue('baseRate', initialData.baseRate);
      setValue('category', initialData.category);
      setValue('unit', initialData.unit || 'MT');
    } else if (isOpen) {
      reset({ unit: 'MT', variety: '' });
    }
  }, [initialData, isOpen, setValue, reset]);

  if (!isOpen) return null;

  const onSubmit = async (data: CommodityValues) => {
    setIsSubmitting(true);
    try {
      const payload = {
        name: data.name,
        variety: data.variety && data.variety.trim() !== '' ? data.variety.trim() : undefined,
        ratePerMtPerDay: data.baseRate,
      };

      if (isEditing) {
        // Fire Optimistic rendering hook directly to UI bypass network latency
        onSuccessOptimistic?.('edit', { _id: initialData._id, ...payload });

        const result = await updateCommodity(initialData._id, payload);
        if (result.success) {
          toast.success(`${data.name} synced and updated.`);
          onClose();
        } else {
          toast.error(result.error || 'Synchronization exception.');
        }
      } else {
        // Optimistic Insertion trick via Timestamp mock-ID
        onSuccessOptimistic?.('add', { _id: `temp-${Date.now()}`, ...payload, createdAt: new Date().toISOString() });
        
        const result = await addCommodity(payload);
        if (result.success) {
          toast.success(`${data.name} Master created.`);
          onClose();
        } else {
          toast.error(result.error || 'Block validation failed.');
        }
      }
    } catch {
      toast.error('Local Network Gateway error.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50">
          <h3 className="text-lg font-bold text-slate-900 flex items-center">
            <Layers className="w-5 h-5 mr-3 text-indigo-500" />
            {isEditing ? 'Re-Configure Master Commodity' : 'Initialize New Commodity'}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-5 bg-white">
          <div className="grid grid-cols-2 gap-5">
             <div className="col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Categorical Name *</label>
                <input 
                  {...register('name')} 
                  className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 uppercase font-bold bg-slate-50" 
                  placeholder="E.g., WHEAT, OIL, HAZARDOUS LIQUID" 
                />
                {errors.name && <p className="text-red-500 text-[10px] mt-1 font-medium">{errors.name.message}</p>}
             </div>

             <div className="col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Variety (Optional)</label>
                <input 
                  {...register('variety')} 
                  className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 font-medium bg-slate-50" 
                  placeholder="E.g., Lokwan, Sharbati" 
                />
                {errors.variety && <p className="text-red-500 text-[10px] mt-1 font-medium">{errors.variety.message}</p>}
             </div>

             <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Family Group / Type *</label>
                <input 
                  {...register('category')} 
                  className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 font-medium bg-slate-50" 
                  placeholder="Grains, Pulses, Electronics" 
                />
                {errors.category && <p className="text-red-500 text-[10px] mt-1 font-medium">{errors.category.message}</p>}
             </div>
             
             <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Unit Metric *</label>
                <input 
                  {...register('unit')} 
                  className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm focus:ring-0 font-bold bg-slate-100 text-slate-400 cursor-not-allowed uppercase" 
                  readOnly title="Globally Locked to Metric Tons"
                />
             </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Baseline Storage Rate *</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-500 font-bold flex items-center">
                 <IndianRupee className="w-4 h-4 mr-0.5" />
              </span>
              <input 
                type="number" 
                step="0.01"
                {...register('baseRate')} 
                className="w-full rounded-md border-2 border-green-200 bg-green-50 pl-9 pr-3 py-2.5 text-sm font-black text-green-900 focus:ring-0 focus:border-green-500" 
                placeholder="0.00" 
              />
            </div>
            {errors.baseRate && <p className="text-red-500 text-[10px] mt-1 font-medium">{errors.baseRate.message}</p>}
          </div>

          <div className="pt-6 flex justify-end gap-3 border-t border-slate-100">
            <button 
              type="button" 
              onClick={onClose} 
              className="px-5 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors shadow-sm"
            >
              Cancel Setup
            </button>
            <button 
              type="submit" 
              disabled={!isValid || isSubmitting}
              className="px-6 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center shadow-md shadow-indigo-200"
            >
              {isSubmitting ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Committing...</>
              ) : (isEditing ? 'Transact Master Edit' : 'Compile Commodity')}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
