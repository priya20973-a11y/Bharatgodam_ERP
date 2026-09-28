'use client';

import { useState, useEffect } from 'react';
import { getColdTransactionFilters } from '@/app/actions/cold-transaction-report-actions';
import ColdTransactionReport from './cold-transaction-report';
import { Toaster, toast } from 'react-hot-toast';
import { useColdTranslation } from '@/components/providers/cold-language-provider';

export default function ColdTransactionReportWrapper() {
  const { t } = useColdTranslation();
  const [filterOptions, setFilterOptions] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFilters = async () => {
      try {
        const options = await getColdTransactionFilters();
        setFilterOptions(options);
      } catch (err: any) {
        toast.error(err.message || 'Failed to load filters');
      } finally {
        setLoading(false);
      }
    };
    fetchFilters();
  }, []);

  if (loading) {
    return <div className="text-center py-10 text-slate-500">{t('transactions.loadingMsg')}</div>;
  }

  return (
    <>
      <div className="flex flex-col gap-2 mb-6">
        <h1 className="text-3xl font-bold tracking-tight">{t('transactions.pageTitle')}</h1>
        <p className="text-slate-500">
          {t('transactions.pageDescription')}
        </p>
      </div>
      <Toaster />
      <ColdTransactionReport filterOptions={filterOptions} />
    </>
  );
}
