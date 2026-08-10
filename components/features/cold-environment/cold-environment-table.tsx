'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

export default function ColdEnvironmentTable({ records, warehouses }: { records: any[], warehouses: any[] }) {
  const [isMounted, setIsMounted] = useState(false);
  const [filterWarehouse, setFilterWarehouse] = useState('');
  const [filterChamber, setFilterChamber] = useState('');
  const [filterFloor, setFilterFloor] = useState('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const exportCSV = () => {
    if (records.length === 0) return;
    const headers = ['Date & Time', 'Warehouse', 'Chamber', 'Floor', 'Temperature (°C)', 'Moisture (%)', 'Notes'];
    const csvContent = [
      headers.join(','),
      ...records.map(r => {
        const d = new Date(r.date).toLocaleString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '');
        const w = (r.warehouseId?.name || '').replace(/,/g, '');
        const c = (r.chamberName || '').replace(/,/g, '');
        const n = (r.notes || '').replace(/,/g, '');
        return `${d},${w},${c},Floor ${r.floorNo},${r.temperature},${r.moisture},${n}`;
      })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', 'environment_records.csv');
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const filteredRecords = records.filter(r => {
    let match = true;
    if (filterWarehouse && r.warehouseId?._id !== filterWarehouse) match = false;
    if (filterChamber && r.chamberName !== filterChamber) match = false;
    if (filterFloor && r.floorNo.toString() !== filterFloor) match = false;
    if (dateRange.start && new Date(r.date) < new Date(dateRange.start)) match = false;
    if (dateRange.end && new Date(r.date) > new Date(dateRange.end + 'T23:59:59')) match = false;
    return match;
  });

  const getChambers = () => {
    if (!filterWarehouse) return [];
    const wh = warehouses.find(w => w._id === filterWarehouse);
    return Array.from({ length: wh?.noOfChambers || 0 }, (_, i) => `Chamber ${i + 1}`);
  };

  const getFloors = () => {
    if (!filterWarehouse) return [];
    const wh = warehouses.find(w => w._id === filterWarehouse);
    return Array.from({ length: wh?.noOfFloors || 0 }, (_, i) => i + 1);
  };

  return (
    <div className="bg-white p-6 rounded-lg border shadow-sm mt-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold tracking-tight text-slate-900">All Records</h2>
        <Button onClick={exportCSV} variant="outline">
          <Download className="mr-2 h-4 w-4" /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <select className="border p-2 rounded" value={filterWarehouse} onChange={(e) => { setFilterWarehouse(e.target.value); setFilterChamber(''); setFilterFloor(''); }}>
          <option value="">All Warehouses</option>
          {warehouses.map(w => <option key={w._id} value={w._id}>{w.name}</option>)}
        </select>
        <select className="border p-2 rounded" value={filterChamber} onChange={(e) => setFilterChamber(e.target.value)} disabled={!filterWarehouse}>
          <option value="">All Chambers</option>
          {getChambers().map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="border p-2 rounded" value={filterFloor} onChange={(e) => setFilterFloor(e.target.value)} disabled={!filterWarehouse}>
          <option value="">All Floors</option>
          {getFloors().map(f => <option key={f} value={f.toString()}>Floor {f}</option>)}
        </select>
        <input type="date" className="border p-2 rounded" value={dateRange.start} onChange={e => setDateRange({...dateRange, start: e.target.value})} />
        <input type="date" className="border p-2 rounded" value={dateRange.end} onChange={e => setDateRange({...dateRange, end: e.target.value})} />
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date & Time</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Warehouse</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Chamber & Floor</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Temp (°C)</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Moisture (%)</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredRecords.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-4 text-gray-500">No records found.</td></tr>
            ) : filteredRecords.map((r, i) => (
              <tr key={i}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{isMounted ? new Date(r.date).toLocaleString() : ''}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{r.warehouseId?.name}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{r.chamberName} / Floor {r.floorNo}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold">{r.temperature}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold">{r.moisture}</td>
                <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">{r.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
