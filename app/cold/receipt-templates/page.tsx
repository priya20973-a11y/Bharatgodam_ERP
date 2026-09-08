import { getColdWarehouses } from '@/app/actions/cold-warehouse-actions';
import TemplateDesigner from '@/components/features/receipt-templates/template-designer';

export const metadata = {
  title: 'Receipt Templates | Settings',
};

export default async function ReceiptTemplatesPage() {
  const warehouses = await getColdWarehouses({ includeInactive: false });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Receipt Templates</h1>
        <p className="text-slate-500">
          Design dynamic pre-printed receipt templates for your cold storages.
        </p>
      </div>

      <TemplateDesigner warehouses={warehouses} />
    </div>
  );
}
