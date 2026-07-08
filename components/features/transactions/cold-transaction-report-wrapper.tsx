'use client';

import { useState, useEffect } from 'react';
import { getColdTransactions } from '@/app/actions/cold-transaction-report-actions';
import ColdTransactionReport from './cold-transaction-report';
import { Toaster, toast } from 'react-hot-toast';
import { useColdTranslation } from '@/components/providers/cold-language-provider';

export default function ColdTransactionReportWrapper() {
  const { t } = useColdTranslation();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        const data = await getColdTransactions();
        setTransactions(data);
      } catch (err: any) {
        toast.error(err.message || t('transactions.fetchFailed'));
      } finally {
        setLoading(false);
      }
    };
    fetchTransactions();
  }, [t]);

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
      <ColdTransactionReport initialTransactions={transactions} />
    </>
  );
}
