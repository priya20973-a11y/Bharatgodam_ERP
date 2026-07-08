'use client';

import { useState } from 'react';
import ColdInwardList from './cold-inward-list';
import ColdInwardForm from './cold-inward-form';
import { Button } from '@/components/ui/button';
import { Plus, X } from 'lucide-react';
import { getColdInwards } from '@/app/actions/cold-inward-actions';
import { Toaster, toast } from 'react-hot-toast';
import { useColdTranslation } from '@/components/providers/cold-language-provider';

interface ColdInwardWrapperProps {
  initialInwards: any[];
  clients: any[];
  commodities: any[];
  warehouses: any[];
  searchParams?: { [key: string]: string | undefined };
}

export default function ColdInwardWrapper({ initialInwards, clients, commodities, warehouses, searchParams }: ColdInwardWrapperProps) {
  const { t } = useColdTranslation();
  const [inwards, setInwards] = useState(initialInwards);
  const [isAdding, setIsAdding] = useState(searchParams?.action === 'add');

  const refreshData = async () => {
    try {
      const data = await getColdInwards();
      setInwards(data);
    } catch (err: any) {
      toast.error(err.message || t('inward.refreshFailed'));
    }
    setIsAdding(false);
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
          onClick={() => setIsAdding(!isAdding)}
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
            prefillData={searchParams}
          />
        </div>
      )}

      <ColdInwardList inwards={inwards} />
    </div>
  );
}
