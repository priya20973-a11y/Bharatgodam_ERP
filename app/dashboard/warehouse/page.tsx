import { Metadata } from 'next';
import WarehouseInventory from '@/components/features/warehouse/warehouse-inventory';

export const metadata: Metadata = {
  title: 'Warehouse Management | BharatGodam',
  description: 'Comprehensive warehouse inventory and capacity management dashboard.',
};

export default function WarehousePage() {
  return (
    <div className="w-full max-w-[1600px] mx-auto px-4 py-8 md:px-0">
      <WarehouseInventory />
    </div>
  );
}