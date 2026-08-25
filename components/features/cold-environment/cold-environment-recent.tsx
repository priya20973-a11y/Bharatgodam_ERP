'use client';

import React, { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { formatChamberName, formatFloorName } from '@/lib/utils/cold-naming';

export default function ColdEnvironmentRecent({ records, warehouses }: { records: any[], warehouses?: any[] }) {
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const handleRefresh = () => {
    router.refresh();
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString('en-GB', { 
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    }).replace(',', '');
  };

  const getFloorName = (whId: string, chamberName: string, floorNo: number) => {
    if (!warehouses) return formatFloorName(null, floorNo);
    const wh = warehouses.find(w => w._id === (typeof whId === 'object' ? (whId as any)._id : whId));
    if (!wh) return formatFloorName(null, floorNo);
    const chamber = (wh.chambers || []).find((c: any) => c.name === chamberName);
    if (!chamber) return formatFloorName(null, floorNo);
    const floor = (chamber.floors || []).find((f: any) => f.floorNo === floorNo);
    return floor ? floor.name : formatFloorName(null, floorNo);
  };

  const filteredRecords = records.filter((r: any) => {
    if (!selectedWarehouseId) return true;
    const recordWhId = typeof r.warehouseId === 'object' ? r.warehouseId?._id : r.warehouseId;
    return recordWhId === selectedWarehouseId;
  });

  return (
    <div className="bg-white p-6 rounded-lg border shadow-sm h-full flex flex-col">
      <div className="flex flex-wrap justify-between items-center mb-4 gap-2">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">Recent Records</h2>
          <p className="text-sm text-slate-500">Latest temperature, moisture, and CO2 entries.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedWarehouseId}
            onChange={(e) => setSelectedWarehouseId(e.target.value)}
            className="h-9 text-xs border border-slate-300 rounded-md px-2.5 py-1 bg-white text-slate-700 font-medium focus:outline-hidden focus:ring-2 focus:ring-indigo-500 shadow-2xs"
          >
            <option value="">All Warehouses</option>
            {(warehouses || []).map((w: any) => (
              <option key={w._id} value={w._id}>
                {w.name}
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3">
        {filteredRecords.length === 0 ? (
          <div className="text-center text-slate-500 py-8">No recent records</div>
        ) : (
          filteredRecords.map((record) => {
            const whName = typeof record.warehouseId === 'object' ? record.warehouseId?.name : warehouses?.find(w => w._id === record.warehouseId)?.name;
            return (
              <div key={record._id} className="bg-slate-50 p-4 rounded-lg border flex justify-between items-center">
                <div>
                  <div className="text-sm font-medium text-slate-700">
                    {whName ? <span className="font-semibold text-slate-900 mr-1.5">{whName} •</span> : ''}
                    {record.chamberName} / {getFloorName(record.warehouseId, record.chamberName, record.floorNo)}
                  </div>
                  <div className="text-xs font-bold text-slate-900 mt-1">
                    {isMounted ? formatDate(record.date) : ''}
                  </div>
                </div>
                <div className="text-right text-xs sm:text-sm text-slate-600 space-x-3">
                  <span>Temp: {record.temperature}°C</span>
                  <span>Moisture: {record.moisture}%</span>
                  {record.co2 !== undefined && record.co2 !== null && (
                    <span className="font-medium text-indigo-700">CO2: {record.co2} ppm</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
