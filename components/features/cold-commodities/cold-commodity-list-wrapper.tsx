'use client';

import React, { useState } from 'react';
import { Layers, Plus, Pencil, Trash2, CalendarDays, Search } from 'lucide-react';
import { deleteColdCommodity } from '@/app/actions/cold-commodities';
import { toast } from 'react-hot-toast';
import ColdCommodityForm from './cold-commodity-form';
import { useColdTranslation } from '@/components/providers/cold-language-provider';

type Props = {
  initialCommodities: any[];
};



export default function ColdCommodityListWrapper({ initialCommodities }: Props) {
  const { t } = useColdTranslation();
  const [commodities, setCommodities] = useState(initialCommodities);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCommodity, setEditingCommodity] = useState<any | null>(null);

  const filteredCommodities = commodities.filter((c: any) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAddClick = () => {
    setEditingCommodity(null);
    setIsModalOpen(true);
  };

  const handleEditClick = (commodity: any) => {
    setEditingCommodity(commodity);
    setIsModalOpen(true);
  };

  const handleDeleteClick = async (id: string, name: string) => {
    if (confirm(t('commodities.deleteConfirm').replace('{name}', name))) {
      const result = await deleteColdCommodity(id);
      if (result.success) {
        setCommodities(commodities.filter((c: any) => c._id !== id));
        toast.success(t('commodities.deleteSuccess'));
      } else {
        toast.error(result.error || t('commodities.deleteFailed'));
      }
    }
  };

  const handleOptimisticUpdate = (action: 'add' | 'edit', data: any) => {
    if (action === 'add') {
      setCommodities([...commodities, data]);
    } else {
      setCommodities(commodities.map((c: any) => c._id === data._id ? data : c));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">{t('commodities.pageTitle')}</h1>
        <p className="text-slate-500">
          {t('commodities.pageDescription')}
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-slate-100">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          <input
            type="text"
            placeholder={t('commodities.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border-none rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all outline-none"
          />
        </div>
        
        <button
          onClick={handleAddClick}
          className="flex items-center justify-center w-full sm:w-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg shadow-md shadow-indigo-200 transition-all shrink-0"
        >
          <Plus className="h-5 w-5 mr-2" />
          {t('commodities.addCommodity')}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredCommodities.map((commodity: any) => (
          <div key={commodity._id} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover:shadow-md transition-shadow relative group">
            <div className="absolute top-4 right-4 flex opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 backdrop-blur-sm rounded-lg shadow-sm border border-slate-100 p-1">
              <button
                onClick={() => handleEditClick(commodity)}
                className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                title={t('commodities.editMaster')}
              >
                <Pencil className="h-4 w-4" />
              </button>
              <div className="w-px bg-slate-200 mx-1" />
              <button
                onClick={() => handleDeleteClick(commodity._id, commodity.name)}
                className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                title={t('commodities.deleteMaster')}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-start gap-4 mb-5">
              <div className="h-12 w-12 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0 border border-indigo-100/50">
                <Layers className="h-6 w-6 text-indigo-600" />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-slate-900 tracking-tight leading-tight">{commodity.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600">
                    {commodity.type}
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-700">
                    {commodity.unit}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center">
                <CalendarDays className="w-3.5 h-3.5 mr-1.5" />
                {t('commodities.seasonalPricing')}
              </h4>
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 max-h-32 overflow-y-auto space-y-2">
                {commodity.seasonalPrices?.map((season: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-600">
                      {new Date(season.fromDate).toLocaleDateString('en-GB')} - {new Date(season.toDate).toLocaleDateString('en-GB')}
                    </span>
                    <div className="flex flex-col items-end">
                      {commodity.priceType === 'Different Price' ? (
                        <span className="font-bold text-green-700 text-xs">
                          L: ₹{(season.priceLarge || 0).toFixed(2)} | S: ₹{(season.priceSmall || 0).toFixed(2)} | M: ₹{(season.priceMixed || 0).toFixed(2)} / {commodity.unit || 'KG'}
                        </span>
                      ) : (
                        <span className="font-bold text-green-700">
                          ₹{(season.pricePerKg || 0).toFixed(2)} / {commodity.unit || 'KG'}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {(!commodity.seasonalPrices || commodity.seasonalPrices.length === 0) && (
                  <p className="text-xs text-slate-500 italic">{t('commodities.noPricesConfigured')}</p>
                )}
              </div>
            </div>
          </div>
        ))}
        {filteredCommodities.length === 0 && (
          <div className="col-span-full py-12 text-center bg-white rounded-2xl border border-dashed border-slate-300">
            <Layers className="mx-auto h-12 w-12 text-slate-300 mb-3" />
            <h3 className="text-lg font-semibold text-slate-900">{t('commodities.noCommoditiesFound')}</h3>
            <p className="text-slate-500 mt-1">{t('commodities.createMasterToStart')}</p>
          </div>
        )}
      </div>

      <ColdCommodityForm
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        initialData={editingCommodity}
        onSuccessOptimistic={handleOptimisticUpdate}
      />
    </div>
  );
}
