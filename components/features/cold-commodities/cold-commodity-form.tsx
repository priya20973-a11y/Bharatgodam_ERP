'use client';

import React, { useState, useEffect } from 'react';
import { addColdCommodity, updateColdCommodity } from '@/app/actions/cold-commodities';
import { toast } from 'react-hot-toast';
import { X, Loader2, IndianRupee, Layers, Plus, Trash2 } from 'lucide-react';
import { ISeasonalPrice } from '@/lib/models/ColdCommodity';
import { useColdTranslation } from '@/components/providers/cold-language-provider';
import { ColdNumberInput } from '@/components/ui/cold-number-input';

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  initialData?: any;
  onSuccessOptimistic?: (action: 'add' | 'edit', data: any) => void;
};


export default function ColdCommodityForm({ isOpen, onClose, initialData, onSuccessOptimistic }: ModalProps) {
  const { t } = useColdTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = !!initialData;

  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [gradingType, setGradingType] = useState<'Grading' | 'Wet' | ''>('');
  const [priceType, setPriceType] = useState<'Same Price' | 'Different Price' | ''>('');
  const [seasonalPrices, setSeasonalPrices] = useState<ISeasonalPrice[]>([]);

  useEffect(() => {
    if (initialData && isOpen) {
      setName(initialData.name || '');
      setType(initialData.type || '');
      setGradingType(initialData.gradingType || '');
      setPriceType(initialData.priceType || '');
      setSeasonalPrices(initialData.seasonalPrices?.map((p: any) => ({
        ...p,
        fromDate: p.fromDate && !isNaN(new Date(p.fromDate).getTime()) ? new Date(p.fromDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        toDate: p.toDate && !isNaN(new Date(p.toDate).getTime()) ? new Date(p.toDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
      })) || []);
    } else if (isOpen) {
      setName('');
      setType('');
      setGradingType('');
      setPriceType('Same Price');
      setSeasonalPrices([{ fromDate: new Date().toISOString().split('T')[0], toDate: new Date().toISOString().split('T')[0], pricePerKg: 10, priceLarge: 10, priceSmall: 10, priceMixed: 10 }] as any);
    }
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleAddPrice = () => {
    setSeasonalPrices([...seasonalPrices, { fromDate: new Date().toISOString().split('T')[0], toDate: new Date().toISOString().split('T')[0], pricePerKg: 10, priceLarge: 10, priceSmall: 10, priceMixed: 10 }] as any);
  };

  const handleRemovePrice = (index: number) => {
    const newPrices = [...seasonalPrices];
    newPrices.splice(index, 1);
    setSeasonalPrices(newPrices);
  };

  const handleChangePrice = (index: number, field: string, value: any) => {
    const newPrices = [...seasonalPrices];
    (newPrices[index] as any)[field] = value;
    setSeasonalPrices(newPrices);
  };

  const validate = () => {
    if (!name.trim()) return t('common.error');
    if (!type.trim()) return t('common.error');
    if (seasonalPrices.length === 0) return t('common.error');

    for (const p of seasonalPrices as any[]) {
      if (!p.fromDate || !p.toDate) {
        return t('common.error');
      }
      if (new Date(p.fromDate) > new Date(p.toDate)) {
        return 'From Date cannot be after To Date';
      }
      if (priceType !== 'Different Price') {
        const pKg = Number(p.pricePerKg);
        if (isNaN(pKg) || pKg <= 0) return 'Price per KG is required and must be greater than 0.';
      } else if (priceType === 'Different Price') {
        const pL = Number(p.priceLarge);
        const pS = Number(p.priceSmall);
        const pM = Number(p.priceMixed);
        if (isNaN(pL) || pL <= 0) return 'Large grade price is required and must be greater than 0.';
        if (isNaN(pS) || pS <= 0) return 'Small grade price is required and must be greater than 0.';
        if (isNaN(pM) || pM <= 0) return 'Mixed grade price is required and must be greater than 0.';
      }
    }

    const sorted = [...(seasonalPrices as any[])].sort((a, b) => new Date(a.fromDate).getTime() - new Date(b.fromDate).getTime());
    for (let i = 0; i < sorted.length - 1; i++) {
      if (new Date(sorted[i].toDate) >= new Date(sorted[i+1].fromDate)) {
        return 'Date ranges cannot overlap';
      }
    }

    return null;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const error = validate();
    if (error) {
      toast.error(error);
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: name.trim().toUpperCase(),
        type: type.trim(),
        unit: 'KG',
        gradingType: gradingType || undefined,
        priceType: priceType || undefined,
        seasonalPrices: (seasonalPrices as any[]).map(p => ({
          fromDate: new Date(p.fromDate),
          toDate: new Date(p.toDate),
          pricePerKg: priceType !== 'Different Price' ? (p.pricePerKg ? Number(p.pricePerKg) : undefined) : undefined,
          priceLarge: priceType === 'Different Price' ? (p.priceLarge ? Number(p.priceLarge) : undefined) : undefined,
          priceSmall: priceType === 'Different Price' ? (p.priceSmall ? Number(p.priceSmall) : undefined) : undefined,
          priceMixed: priceType === 'Different Price' ? (p.priceMixed ? Number(p.priceMixed) : undefined) : undefined,
        }))
      };

      if (isEditing) {
        const result = await updateColdCommodity(initialData._id, payload);
        if (result.success) {
          onSuccessOptimistic?.('edit', { _id: initialData._id, ...payload });
          toast.success(t('commodities.commodityUpdated').replace('{name}', payload.name));
          onClose();
        } else {
          toast.error(result.error || t('commodities.syncException'));
        }
      } else {
        const result = await addColdCommodity(payload);
        if (result.success) {
          onSuccessOptimistic?.('add', result.data || { _id: `temp-${Date.now()}`, ...payload, createdAt: new Date().toISOString() });
          toast.success(t('commodities.commodityCreated').replace('{name}', payload.name));
          onClose();
        } else {
          toast.error(result.error || t('commodities.blockValidationFailed'));
        }
      }
    } catch {
      toast.error(t('common.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50 shrink-0">
          <h3 className="text-lg font-bold text-slate-900 flex items-center">
            <Layers className="w-5 h-5 mr-3 text-indigo-500" />
            {isEditing ? t('commodities.reConfigureMaster') : t('commodities.initializeNewCommodity')}
          </h3>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex-1 overflow-y-auto p-6 space-y-8 bg-white">
          <div className="space-y-5">
            <div className="flex items-center pb-2 border-b border-slate-100">
              <div className="h-6 w-1 bg-indigo-500 rounded-full mr-3" />
              <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wide">{t('commodities.commodityIdentity')}</h4>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">{t('commodities.nomenclature')} <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  placeholder={t('commodities.nomenclaturePlaceholder')}
                  value={name}
                  onChange={(e) => setName(e.target.value.toUpperCase())}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white uppercase transition-all outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">{t('commodities.typeVariant')} <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  placeholder={t('commodities.typeVariantPlaceholder')}
                  value={type}
                  onChange={(e) => setType(e.target.value.toUpperCase())}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white uppercase transition-all outline-none"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-semibold text-slate-700">{t('commodities.unitConstraint')} <span className="text-red-500">*</span></label>
                <div className="w-full px-4 py-2.5 bg-slate-100 border border-slate-200 text-slate-500 rounded-xl cursor-not-allowed font-medium">
                  KG (KILOGRAMS)
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Grading Type</label>
                <select
                  value={gradingType}
                  onChange={(e) => setGradingType(e.target.value as any)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none"
                >
                  <option value="">Select Grading Type (Optional)</option>
                  <option value="Grading">Grading</option>
                  <option value="Wet">Wet</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Price Type</label>
                <select
                  value={priceType}
                  onChange={(e) => setPriceType(e.target.value as any)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none"
                >
                  <option value="">Select Price Type (Optional)</option>
                  <option value="Same Price">Same Price</option>
                  <option value="Different Price">Different Price</option>
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <div className="flex items-center pb-2 border-b border-slate-100">
              <div className="h-6 w-1 bg-indigo-500 rounded-full mr-3" />
              <div className="flex flex-col">
                <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wide">{t('commodities.seasonalPricingGrid')}</h4>
                <p className="text-xs text-slate-500 font-medium">{t('commodities.gridDesc')}</p>
              </div>
            </div>

            <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 space-y-4">
              <p className="text-xs text-indigo-700 font-medium leading-relaxed">
                Define the seasonal pricing block using specific date ranges.
              </p>
              
              <div className="space-y-3">
                {seasonalPrices.map((price, idx) => (
                  <div key={idx} className="flex flex-col sm:flex-row items-center gap-3 bg-white p-3 rounded-lg border border-indigo-100 shadow-sm relative group transition-all hover:border-indigo-300">
                    
                    <div className="flex-1 w-full grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">From Date</label>
                        <input
                          type="date"
                          className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                          value={(price as any).fromDate}
                          onChange={(e) => handleChangePrice(idx, 'fromDate', e.target.value)}
                        />
                      </div>
                      
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">To Date</label>
                        <input
                          type="date"
                          className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                          value={(price as any).toDate}
                          onChange={(e) => handleChangePrice(idx, 'toDate', e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="w-full sm:w-auto flex flex-wrap items-end gap-2 shrink-0">
                      {priceType !== 'Different Price' && (
                        <div className="space-y-1 relative w-32">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">{t('commodities.pricePerKg')}</label>
                          <div className="relative">
                            <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <ColdNumberInput
                              className="w-full bg-slate-50 border border-slate-200 rounded-md pl-8 pr-3 py-2 text-sm font-bold text-green-700 focus:ring-2 focus:ring-green-500 outline-none"
                              value={price.pricePerKg ?? ''}
                              onChange={(val) => handleChangePrice(idx, 'pricePerKg', Number(val) || 0)}
                            />
                          </div>
                        </div>
                      )}

                      {priceType === 'Different Price' && (
                        <>
                          <div className="space-y-1 relative w-32">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Large Price</label>
                            <div className="relative">
                              <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                              <ColdNumberInput
                                className="w-full bg-slate-50 border border-slate-200 rounded-md pl-8 pr-3 py-2 text-sm font-bold text-green-700 focus:ring-2 focus:ring-green-500 outline-none"
                                value={price.priceLarge ?? ''}
                                onChange={(val) => handleChangePrice(idx, 'priceLarge', Number(val) || 0)}
                              />
                            </div>
                          </div>
                          <div className="space-y-1 relative w-32">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Small Price</label>
                            <div className="relative">
                              <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                              <ColdNumberInput
                                className="w-full bg-slate-50 border border-slate-200 rounded-md pl-8 pr-3 py-2 text-sm font-bold text-green-700 focus:ring-2 focus:ring-green-500 outline-none"
                                value={price.priceSmall ?? ''}
                                onChange={(val) => handleChangePrice(idx, 'priceSmall', Number(val) || 0)}
                              />
                            </div>
                          </div>
                          <div className="space-y-1 relative w-32">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Mixed Price</label>
                            <div className="relative">
                              <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                              <ColdNumberInput
                                className="w-full bg-slate-50 border border-slate-200 rounded-md pl-8 pr-3 py-2 text-sm font-bold text-green-700 focus:ring-2 focus:ring-green-500 outline-none"
                                value={price.priceMixed ?? ''}
                                onChange={(val) => handleChangePrice(idx, 'priceMixed', Number(val) || 0)}
                              />
                            </div>
                          </div>
                        </>
                      )}

                      {seasonalPrices.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemovePrice(idx)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={handleAddPrice}
                className="flex items-center text-sm font-semibold text-indigo-600 hover:text-indigo-700 mt-2 px-2 py-1 rounded hover:bg-indigo-100/50 transition-colors"
              >
                <Plus className="h-4 w-4 mr-1" />
                {t('commodities.addSeasonalBlock')}
              </button>
            </div>
          </div>
        </form>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl transition-all"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isSubmitting}
            className="px-6 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md shadow-indigo-200 disabled:opacity-70 disabled:cursor-not-allowed flex items-center transition-all"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t('commodities.validating')}
              </>
            ) : (
              isEditing ? t('commodities.syncAndCommit') : t('commodities.validateAndInitialize')
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
