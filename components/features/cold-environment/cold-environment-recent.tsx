'use client';

import React, { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

export default function ColdEnvironmentRecent({ records, warehouses }: { records: any[], warehouses?: any[] }) {
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);

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
    if (!warehouses) return `Floor ${floorNo}`;
    const wh = warehouses.find(w => w._id === (typeof whId === 'object' ? (whId as any)._id : whId));
    if (!wh) return `Floor ${floorNo}`;
    const chamber = (wh.chambers || []).find((c: any) => c.name === chamberName);
    if (!chamber) return `Floor ${floorNo}`;
    const floor = (chamber.floors || []).find((f: any) => f.floorNo === floorNo);
    return floor ? floor.name : `Floor ${floorNo}`;
  };

  return (
    <div className="bg-white p-6 rounded-lg border shadow-sm h-full flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">Recent Records</h2>
          <p className="text-sm text-slate-500">Latest temperature, moisture, and CO2 entries.</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3">
        {records.length === 0 ? (
          <div className="text-center text-slate-500 py-8">No recent records</div>
        ) : (
          records.map((record) => (
            <div key={record._id} className="bg-slate-50 p-4 rounded-lg border flex justify-between items-center">
              <div>
                <div className="text-sm font-medium text-slate-700">
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
          ))
        )}
      </div>
    </div>
  );
}
