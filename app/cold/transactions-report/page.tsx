import ColdTransactionReportWrapper from '@/components/features/transactions/cold-transaction-report-wrapper';

export const metadata = {
  title: 'Transaction Report (Cold Storage) | ERP',
};

export default function ColdTransactionsReportPage() {
  return (
    <div className="space-y-6">
      <ColdTransactionReportWrapper />
    </div>
  );
}
