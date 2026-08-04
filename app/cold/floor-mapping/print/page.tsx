import { getFloorInventory } from '@/app/actions/floor-mapping-actions';
import PrintFloorGrid from '@/components/features/floor-mapping/print-floor-grid';

export default async function PrintFloorMappingPage({
  searchParams
}: {
  searchParams: Promise<{ warehouseId: string, chamberNo: string, floorNo: string }>
}) {
  const sp = await searchParams;
  const { warehouseId, chamberNo, floorNo } = sp;

  if (!warehouseId || !chamberNo || !floorNo) {
    return <div className="p-12 text-center text-red-500">Missing parameters</div>;
  }

  const res = await getFloorInventory(warehouseId, chamberNo, Number(floorNo));
  
  if (!res.success) {
    return <div className="p-12 text-center text-red-500">Failed to load floor mapping data: {res.error}</div>;
  }

  return (
    <div className="bg-white min-h-screen print:min-h-0">
      <PrintFloorGrid floorData={res.data} />
    </div>
  );
}
