'use client';

import { useState } from 'react';
import ColdInwardList from './cold-inward-list';
import ColdInwardForm from './cold-inward-form';
import { Button } from '@/components/ui/button';
import { Plus, X, FileEdit, Trash2 } from 'lucide-react';
import { getColdInwards, getColdInwardDrafts, deleteColdInwardDraft } from '@/app/actions/cold-inward-actions';
import { Toaster, toast } from 'react-hot-toast';
import { useColdTranslation } from '@/components/providers/cold-language-provider';

interface ColdInwardWrapperProps {
  initialInwards: any[];
  initialDrafts?: any[];
  clients: any[];
  commodities: any[];
  warehouses: any[];
  searchParams?: { [key: string]: string | undefined };
}

export default function ColdInwardWrapper({ initialInwards, initialDrafts = [], clients, commodities, warehouses, searchParams }: ColdInwardWrapperProps) {
  const { t } = useColdTranslation();
  const [inwards, setInwards] = useState(initialInwards);
  const [drafts, setDrafts] = useState(initialDrafts);
  const [isAdding, setIsAdding] = useState(searchParams?.action === 'add');
  const [editingDraft, setEditingDraft] = useState<any>(null);

  // Convert searchParams to proper prefillData format for the form if coming from Stack Details
  const initialPrefill = searchParams?.warehouseId ? {
    common: {
      warehouseId: searchParams.warehouseId,
    },
    clients: [{
      id: Date.now().toString(),
      clientId: '',
      commodityId: '',
      gradingApplied: false,
      gradingRate: 0,
      gradingChargeType: 'Per Bag',
      stockType: 'Self',
      stacks: [{
        id: Date.now().toString(),
        chamberNo: searchParams.chamberName,
        floorNo: searchParams.floorNo,
        stackNo: searchParams.stackNo,
        stockType: 'Self'
      }]
    }]
  } : searchParams;

  const refreshData = async () => {
    try {
      const [data, draftsData] = await Promise.all([getColdInwards(), getColdInwardDrafts()]);
      setInwards(data);
      setDrafts(draftsData);
    } catch (err: any) {
      toast.error(err.message || t('inward.refreshFailed'));
    }
    setIsAdding(false);
    setEditingDraft(null);
  };

  const handleResumeDraft = (draft: any) => {
    setEditingDraft(draft);
    setIsAdding(true);
  };

  const handleDeleteDraft = async (draftId: string) => {
    if (!confirm('Are you sure you want to delete this draft?')) return;
    try {
      const res = await deleteColdInwardDraft(draftId);
      if (res.success) {
        toast.success('Draft deleted');
        refreshData();
      } else {
        toast.error(res.error || 'Failed to delete draft');
      }
    } catch (err) {
      toast.error('Something went wrong');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 mb-6">
        <h1 className="text-3xl font-bold tracking-tight">{t('inward.pageTitle')}</h1>
        <p className="text-slate-500">
          {t('inward.pageDescription')}
        </p>
      </div>
      <Toaster />
      <div className="flex justify-between items-center border-b pb-2">
        <h2 className="text-xl font-semibold">{t('inward.pageTitle')}</h2>
        <Button 
          onClick={() => {
            if (isAdding) {
              setIsAdding(false);
              setEditingDraft(null);
            } else {
              setIsAdding(true);
            }
          }}
          variant={isAdding ? "outline" : "default"}
        >
          {isAdding ? <><X className="mr-2 h-4 w-4" /> {t('common.cancel')}</> : <><Plus className="mr-2 h-4 w-4" /> {t('inward.addInward')}</>}
        </Button>
      </div>

      {isAdding && (
        <div className="mb-6">
          <ColdInwardForm 
            clients={clients} 
            commodities={commodities} 
            warehouses={warehouses} 
            onSuccess={refreshData} 
            prefillData={editingDraft ? editingDraft.formData : initialPrefill}
            draftId={editingDraft ? editingDraft._id : undefined}
          />
        </div>
      )}

      {!isAdding && drafts.length > 0 && (
        <div className="mb-6 space-y-4">
          <h3 className="font-semibold text-lg text-slate-700 border-b pb-2">Saved Drafts</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {drafts.map((draft: any) => (
              <div key={draft._id} className="p-4 border rounded-lg bg-orange-50 flex flex-col gap-2 relative">
                <div className="flex justify-between">
                  <span className="text-xs font-semibold bg-orange-200 text-orange-800 px-2 py-1 rounded">Draft</span>
                  <span className="text-xs text-slate-500">{new Date(draft.updatedAt).toLocaleDateString()}</span>
                </div>
                <p className="font-medium text-sm">
                  {draft.formData?.clients?.length || 0} Client(s)
                </p>
                <p className="text-xs text-slate-600 truncate">
                  Truck: {draft.formData?.common?.truckNo || 'N/A'}
                </p>
                <div className="flex gap-2 mt-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => handleResumeDraft(draft)}>
                    <FileEdit className="w-4 h-4 mr-1" /> Resume
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDeleteDraft(draft._id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <ColdInwardList inwards={inwards} />
    </div>
  );
}
