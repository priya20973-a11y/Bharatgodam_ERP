'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getFloorInventory } from '@/app/actions/floor-mapping-actions';
import FloorGrid from './floor-grid';
import { useColdTranslation } from '@/components/providers/cold-language-provider';

export default function FloorMappingWrapper({ warehouses }: { warehouses: any[] }) {
  const { t } = useColdTranslation();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const initWarehouseId = searchParams.get('warehouseId') || '';
  const initChamberNo = searchParams.get('chamberNo') ? Number(searchParams.get('chamberNo')) : null;
  const initFloorNo = searchParams.get('floorNo') ? Number(searchParams.get('floorNo')) : null;
  const initStackNo = searchParams.get('stackNo') ? Number(searchParams.get('stackNo')) : null;

  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(initWarehouseId);
  const [selectedChamberNo, setSelectedChamberNo] = useState<number | null>(initChamberNo);
  const [selectedFloorNo, setSelectedFloorNo] = useState<number | null>(initFloorNo);

  const [loading, setLoading] = useState(false);
  const [floorData, setFloorData] = useState<any>(null);

  const activeWarehouse = warehouses.find(w => w._id === selectedWarehouseId);
  const activeChamber = activeWarehouse?.chambers?.find((c: any) => c.chamberNo === selectedChamberNo);
  const availableFloors = activeChamber?.floors || [];

  const initialMountWH = useRef(true);
  const initialMountCh = useRef(true);

  useEffect(() => {
    if (initialMountWH.current) {
      initialMountWH.current = false;
      return;
    }
    // Reset selections on warehouse change
    setSelectedChamberNo(null);
    setSelectedFloorNo(null);
    setFloorData(null);
    
    // Clear URL params if manually changing
    router.replace(pathname, { scroll: false });
  }, [selectedWarehouseId, router, pathname]);

  useEffect(() => {
    if (initialMountCh.current) {
      initialMountCh.current = false;
      return;
    }
    // Reset floor on chamber change
    setSelectedFloorNo(null);
    setFloorData(null);
  }, [selectedChamberNo]);

  useEffect(() => {
    if (selectedWarehouseId && selectedChamberNo && selectedFloorNo) {
      fetchFloorData();
    }
  }, [selectedWarehouseId, selectedChamberNo, selectedFloorNo]);

  const fetchFloorData = async () => {
    setLoading(true);
    setFloorData(null);
    try {
      const res = await getFloorInventory(selectedWarehouseId, selectedChamberNo!, selectedFloorNo!);
      if (res.success) {
        setFloorData(res.data);
      } else {
        console.error(res.error);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 rounded-lg shadow-sm border flex flex-col md:flex-row gap-4 items-end">
        <div className="space-y-2 flex-1">
          <label className="text-sm font-medium text-slate-700">{t('inward.warehouse') || 'Warehouse'}</label>
          <Select value={selectedWarehouseId} onValueChange={setSelectedWarehouseId}>
            <SelectTrigger><SelectValue placeholder="Select Warehouse" /></SelectTrigger>
            <SelectContent>
              {warehouses.map((w: any) => (
                <SelectItem key={w._id} value={w._id}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 flex-1">
          <label className="text-sm font-medium text-slate-700">{t('inward.chamberNo') || 'Chamber No.'}</label>
          <Select 
            value={selectedChamberNo?.toString() || ''} 
            onValueChange={(val) => setSelectedChamberNo(Number(val))}
            disabled={!selectedWarehouseId}
          >
            <SelectTrigger><SelectValue placeholder="Select Chamber" /></SelectTrigger>
            <SelectContent>
              {activeWarehouse?.chambers?.map((c: any) => (
                <SelectItem key={c.chamberNo} value={c.chamberNo.toString()}>Chamber {c.chamberNo}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 flex-1">
          <label className="text-sm font-medium text-slate-700">{t('inward.floorNo') || 'Floor No.'}</label>
          <Select 
            value={selectedFloorNo?.toString() || ''} 
            onValueChange={(val) => setSelectedFloorNo(Number(val))}
            disabled={!selectedChamberNo}
          >
            <SelectTrigger><SelectValue placeholder="Select Floor" /></SelectTrigger>
            <SelectContent>
              {availableFloors.map((f: any) => (
                <SelectItem key={f.floorNo} value={f.floorNo.toString()}>Floor {f.floorNo}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading && (
        <div className="flex justify-center p-12">
          <div className="animate-spin h-8 w-8 border-4 border-blue-600 rounded-full border-t-transparent"></div>
        </div>
      )}

      {!loading && floorData && (
        <div className="bg-white p-6 rounded-lg shadow-sm border overflow-x-auto">
          <FloorGrid floorData={floorData} highlightStackNo={initStackNo} />
        </div>
      )}
      
      {!loading && !floorData && selectedFloorNo && (
        <div className="bg-white p-12 rounded-lg shadow-sm border text-center text-slate-500">
          Failed to load floor mapping data.
        </div>
      )}
      
      {!selectedFloorNo && (
        <div className="bg-slate-50 p-12 rounded-lg border border-dashed border-slate-300 text-center text-slate-500">
          Select a Warehouse, Chamber, and Floor to view mapping.
        </div>
      )}
    </div>
  );
}
