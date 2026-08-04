'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ColdOutwardList from './cold-outward-list';
import ColdOutwardForm from './cold-outward-form';
import { Button } from '@/components/ui/button';
import { Plus, X } from 'lucide-react';
import { getColdOutwards } from '@/app/actions/cold-outward-actions';
import { Toaster, toast } from 'react-hot-toast';
import { useColdTranslation } from '@/components/providers/cold-language-provider';

interface ColdOutwardWrapperProps {
  initialOutwards: any[];
  clients: any[];
  commodities: any[];
  warehouses: any[];
  searchParams?: { [key: string]: string | undefined };
}

export default function ColdOutwardWrapper({ initialOutwards, clients, commodities, warehouses, searchParams }: ColdOutwardWrapperProps) {
  const router = useRouter();
  const { t } = useColdTranslation();
  const [outwards, setOutwards] = useState(initialOutwards);
  const qrId = searchParams?.qrId || searchParams?.scanQrId;
  const isQrShortcut = !!qrId;
  const [isAdding, setIsAdding] = useState(searchParams?.action === 'add' || isQrShortcut);

  const refreshData = async () => {
    try {
      const data = await getColdOutwards();
      setOutwards(data);
    } catch (err: any) {
      toast.error(err.message || t('outward.refreshFailed'));
    }
    setIsAdding(false);
    if (isQrShortcut || searchParams?.action) {
      router.replace('/cold/outward');
    }
  };

  const handleToggleAdding = () => {
    if (isAdding && (isQrShortcut || searchParams?.action)) {
      router.replace('/cold/outward');
    }
    setIsAdding(!isAdding);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 mb-6">
        <h1 className="text-3xl font-bold tracking-tight">{t('outward.pageTitle')}</h1>
        <p className="text-slate-500">
          {t('outward.pageDescription')}
        </p>
      </div>
      <Toaster />
      <div className="flex justify-between items-center border-b pb-2">
        <h2 className="text-xl font-semibold">{t('outward.pageTitle')}</h2>
        <Button 
          onClick={handleToggleAdding}
          variant={isAdding ? "outline" : "destructive"}
        >
          {isAdding ? <><X className="mr-2 h-4 w-4" /> {t('common.cancel')}</> : <><Plus className="mr-2 h-4 w-4" /> {t('outward.addOutward')}</>}
        </Button>
      </div>

      {isAdding && (
        <div className="mb-6">
          <ColdOutwardForm 
            clients={clients} 
            commodities={commodities} 
            warehouses={warehouses} 
            onSuccess={refreshData} 
            prefillData={qrId ? { scanQrId: qrId } : searchParams}
          />
        </div>
      )}

      <ColdOutwardList outwards={outwards} />
    </div>
  );
}
