'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowRightLeft, Plus, Search } from 'lucide-react';
import { useColdTranslation } from '@/components/providers/cold-language-provider';

interface ColdStockShiftingListProps {
  shiftings: any[];
}

export default function ColdStockShiftingList({ shiftings }: ColdStockShiftingListProps) {
  const { t } = useColdTranslation();
  const [search, setSearch] = useState('');

  const getWarehouseName = (allocWh: any, topWh: any) => {
    if (allocWh && typeof allocWh === 'object' && allocWh.name) return allocWh.name;
    if (typeof allocWh === 'string' && allocWh.trim()) return allocWh;
    if (topWh && typeof topWh === 'object' && topWh.name) return topWh.name;
    if (typeof topWh === 'string' && topWh.trim()) return topWh;
    return '';
  };

  const filtered = shiftings.filter((s) => {
    const term = search.toLowerCase();
    const clientName = s.clientId?.name?.toLowerCase() || '';
    const commodityName = s.commodityId?.name?.toLowerCase() || '';
    const receiptNo = s.receiptNo?.toLowerCase() || '';
    const srcWh = s.sourceWarehouseId?.name?.toLowerCase() || '';
    const dstWh = s.destWarehouseId?.name?.toLowerCase() || '';
    const srcAllocWhs = (s.sourceAllocations || []).map((alloc: any) => alloc.warehouseId?.name?.toLowerCase() || '').join(' ');
    const dstAllocWhs = (s.destAllocations || []).map((alloc: any) => alloc.warehouseId?.name?.toLowerCase() || '').join(' ');

    return (
      clientName.includes(term) ||
      commodityName.includes(term) ||
      receiptNo.includes(term) ||
      srcWh.includes(term) ||
      dstWh.includes(term) ||
      srcAllocWhs.includes(term) ||
      dstAllocWhs.includes(term)
    );
  });


  const renderSourceSummary = (item: any) => {
    const sources = item.sourceAllocations || [];

    const formatAlloc = (src: any) => {
      const whName = getWarehouseName(src.warehouseId, item.sourceWarehouseId);
      const fl = src.floorName || (src.floorNo ? (isNaN(Number(src.floorName)) && src.floorName ? src.floorName : `F${src.floorNo}`) : '-');
      const chamberStr = src.chamberName || (src.chamberNo ? `C${src.chamberNo}` : '-');
      const stackStr = `${chamberStr} / ${fl} / S${src.stackNo}`;
      return { whName, stackStr };
    };

    if (sources.length > 0) {
      return (
        <div className="space-y-1">
          {sources.map((src: any, idx: number) => {
            const { whName, stackStr } = formatAlloc(src);
            return (
              <div key={idx} className="leading-snug">
                {whName && <span className="font-bold text-slate-900">{whName} → </span>}
                <span className="font-semibold text-rose-800">{stackStr}</span>
              </div>
            );
          })}
        </div>
      );
    }

    // Legacy fallback
    const whName = getWarehouseName(item.sourceWarehouseId, null);
    const fl = item.sourceFloorName || (item.sourceFloorNo ? `F${item.sourceFloorNo}` : '-');
    const chamberStr = item.sourceChamberName || (item.sourceChamberNo ? `C${item.sourceChamberNo}` : '-');
    const stackStr = `${chamberStr} / ${fl} / S${item.sourceStackNo}`;

    return (
      <div className="leading-snug">
        {whName && <span className="font-bold text-slate-900">{whName} → </span>}
        <span className="font-semibold text-rose-800">{stackStr}</span>
      </div>
    );
  };

  const renderDestSummary = (item: any) => {
    const dests = item.destAllocations || [];

    const formatAlloc = (dst: any) => {
      const whName = getWarehouseName(dst.warehouseId, item.destWarehouseId);
      const fl = dst.floorName || (dst.floorNo ? (isNaN(Number(dst.floorName)) && dst.floorName ? dst.floorName : `F${dst.floorNo}`) : '-');
      const chamberStr = dst.chamberName || (dst.chamberNo ? `C${dst.chamberNo}` : '-');
      const stackStr = `${chamberStr} / ${fl} / S${dst.stackNo}`;
      return { whName, stackStr };
    };

    if (dests.length > 0) {
      return (
        <div className="space-y-1">
          {dests.map((dst: any, idx: number) => {
            const { whName, stackStr } = formatAlloc(dst);
            return (
              <div key={idx} className="leading-snug">
                {whName && <span className="font-bold text-slate-900">{whName} → </span>}
                <span className="font-semibold text-emerald-800">{stackStr}</span>
              </div>
            );
          })}
        </div>
      );
    }

    // Legacy fallback
    const whName = getWarehouseName(item.destWarehouseId, null);
    const fl = item.destFloorName || (item.destFloorNo ? `F${item.destFloorNo}` : '-');
    const chamberStr = item.destChamberName || (item.destChamberNo ? `C${item.destChamberNo}` : '-');
    const stackStr = `${chamberStr} / ${fl} / S${item.destStackNo}`;

    return (
      <div className="leading-snug">
        {whName && <span className="font-bold text-slate-900">{whName} → </span>}
        <span className="font-semibold text-emerald-800">{stackStr}</span>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
            <ArrowRightLeft className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Internal Stock Shifting</h1>
            <p className="text-xs text-slate-500">Record and audit stack-to-stack stock relocation</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <Input
              type="text"
              placeholder="Search shifting..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-64 text-sm"
            />
          </div>

          <Link href="/cold/stock-shifting/new">
            <Button className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold flex items-center gap-1.5">
              <Plus className="w-4 h-4" />
              New Stock Shifting
            </Button>
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-semibold border-b text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Receipt No</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Commodity</th>
                <th className="px-4 py-3 text-rose-700">Source (Warehouse & Stack)</th>
                <th className="px-4 py-3 text-emerald-700">Destination (Warehouse & Stack)</th>
                <th className="px-4 py-3 text-right">Shifted Qty</th>
                <th className="px-4 py-3 text-right">Bags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-slate-400">
                    No internal stock shifting records found.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item._id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3 font-bold text-slate-900">{item.receiptNo}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {new Date(item.date).toLocaleDateString('en-GB')}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{item.clientId?.name || '-'}</td>
                    <td className="px-4 py-3">
                      {item.commodityId?.name} {item.commodityId?.type ? `(${item.commodityId.type})` : ''}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {renderSourceSummary(item)}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {renderDestSummary(item)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-indigo-700">
                      {item.quantityKg} {item.commodityId?.unit || 'KG'}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-700">
                      {item.bagsCount}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
