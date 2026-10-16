'use client';

import React, { useMemo, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { 
  Printer, 
  Search, 
  Download, 
  Calendar as CalendarIcon, 
  ChevronDown, 
  Check, 
  ArrowUp, 
  ArrowDown, 
  ChevronLeft, 
  ChevronRight, 
  X 
} from 'lucide-react';
import { getDynamicUnitLabel } from '@/lib/utils';
import { Button } from "@/components/ui/button";
import { useColdTranslation } from '@/components/providers/cold-language-provider';
import { Badge } from '@/components/ui/badge';
import SearchInwardModal from './search-inward-modal';
import SearchLotModal from './search-lot-modal';

interface ColdOutwardListProps {
  outwards: any[];
}

export default function ColdOutwardList({ outwards }: ColdOutwardListProps) {
  const { t, formatNumber } = useColdTranslation();

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isSearchLotModalOpen, setIsSearchLotModalOpen] = useState(false);
  const [showFarmerNameOnPrint, setShowFarmerNameOnPrint] = useState(true);

  // Date column sorting state: 'desc' (newest first) or 'asc' (oldest first)
  const [dateSortOrder, setDateSortOrder] = useState<'desc' | 'asc'>('desc');

  // Client name search state
  const [clientSearchQuery, setClientSearchQuery] = useState('');

  // Lot No search state
  const [lotSearchQuery, setLotSearchQuery] = useState('');

  const toggleDateSort = () => {
    setDateSortOrder(prev => (prev === 'desc' ? 'asc' : 'desc'));
    setCurrentPage(1);
  };

  const getTxDateMs = (item: any): number => {
    if (item.date) {
      const d = new Date(item.date).getTime();
      if (!isNaN(d)) return d;
    }
    if (item.createdAt) {
      const d = new Date(item.createdAt).getTime();
      if (!isNaN(d)) return d;
    }
    return 0;
  };

  // Filtered and sorted outwards
  const processedOutwards = useMemo(() => {
    let list = outwards || [];

    // Filter by client name (case-insensitive, matching client name or C/o client name)
    if (clientSearchQuery.trim()) {
      const q = clientSearchQuery.trim().toLowerCase();
      list = list.filter((w) => {
        const clientName = (w.clientId?.name || '').toLowerCase();
        const coClientName = (w.carryOverClientName || w.carryOverClientId?.name || '').toLowerCase();
        return clientName.includes(q) || coClientName.includes(q);
      });
    }

    // Filter by lot number (case-insensitive partial matching across w.lotNo, w.inwardId?.lotNo, and w.items)
    if (lotSearchQuery.trim()) {
      const q = lotSearchQuery.trim().toLowerCase();
      list = list.filter((w) => {
        if (w.lotNo && String(w.lotNo).toLowerCase().includes(q)) return true;
        if (w.inwardId?.lotNo && String(w.inwardId.lotNo).toLowerCase().includes(q)) return true;
        if (Array.isArray(w.items)) {
          return w.items.some((item: any) => {
            const itemLot = item.lotNo || item.inwardId?.lotNo;
            return itemLot && String(itemLot).toLowerCase().includes(q);
          });
        }
        return false;
      });
    }

    // Sort by actual transaction date
    return [...list].sort((a, b) => {
      const timeA = getTxDateMs(a);
      const timeB = getTxDateMs(b);
      return dateSortOrder === 'asc' ? timeA - timeB : timeB - timeA;
    });
  }, [outwards, clientSearchQuery, lotSearchQuery, dateSortOrder]);

  const totalItems = processedOutwards.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const paginatedOutwards = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return processedOutwards.slice(start, start + itemsPerPage);
  }, [processedOutwards, currentPage, itemsPerPage]);

  const exportCsv = () => {
    const headers = [
      t('outward.dateHeader') || 'Date',
      t('outward.clientNameHeader') || 'Client Name',
      'Farmer Name',
      t('outward.commodityHeader') || 'Commodity',
      t('outward.lotNo') || 'Lot No',
      t('outward.warehouseHeader') || 'Warehouse',
      t('outward.chamberHeader') || 'Chamber',
      t('outward.floorHeader') || 'Floor',
      t('outward.stackHeader') || 'Stack',
      t('inward.grade') || 'Grade',
      t('outward.quantityHeader') || 'Net Weight (kg)',
      t('outward.bagsHeader') || 'Bags'
    ];
    
    const rows = processedOutwards.map(w => {
      const date = w.date ? format(new Date(w.date), 'dd MMM yyyy') : '-';
      const clientName = w.clientId?.name || '-';
      const coClientName = w.carryOverClientName || w.carryOverClientId?.name;
      const coClient = w.isCarryOver && coClientName ? ` (C/o: ${coClientName})` : '';
      const client = `${clientName}${coClient}`;
      const farmer = w.farmerName || '-';
      const commodity = w.commodityId ? `${w.commodityId.name} (${w.commodityId.type})` : 'Unknown';
      const lotNo = w.isBatch && w.items && w.items.length > 1
        ? w.items.map((item: any) => item.lotNo || item.inwardId?.lotNo || '-').join('; ')
        : (w.lotNo || w.inwardId?.lotNo || '-');
      const warehouse = w.warehouseId?.name || '-';
      const chamber = w.isBatch && w.items && w.items.length > 1
        ? w.items.map((item: any) => String(item.chamberName || item.chamberNo).replace(/^Chamber\s+/i, '')).join('; ')
        : String(w.chamberName || w.chamberNo).replace(/^Chamber\s+/i, '');
      const floor = w.isBatch && w.items && w.items.length > 1
        ? w.items.map((item: any) => (item.floorName && item.floorName.trim().toLowerCase() !== `floor ${item.floorNo}`) ? item.floorName : item.floorNo).join('; ')
        : ((w.floorName && w.floorName.trim().toLowerCase() !== `floor ${w.floorNo}`) ? w.floorName : (w.floorNo || '-'));
      const stack = w.isBatch && w.items && w.items.length > 1
        ? w.items.map((item: any) => item.stackNo).join('; ')
        : (w.stackNo || '-');

      let sameGrade = true;
      if (w.isBatch && w.items && w.items.length > 0) {
        const first = w.items[0];
        for (const item of w.items) {
          if (item.grade !== first.grade || item.gradingType !== first.gradingType) sameGrade = false;
        }
      }
      const grade = (w.isBatch && !sameGrade) ? (t('outward.mixedMulti') || 'Mixed') : (w.gradingType || '-');
      const qty = w.quantityKg || 0;
      const bags = w.bagsCount || 0;
      return [date, client, farmer, commodity, lotNo, warehouse, chamber, floor, stack, grade, qty, bags]
        .map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });
    
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Outward_Export_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div className="flex items-center space-x-2">
          <input 
            type="checkbox" 
            id="showFarmerName" 
            checked={showFarmerNameOnPrint} 
            onChange={(e) => setShowFarmerNameOnPrint(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer"
          />
          <label htmlFor="showFarmerName" className="text-sm font-medium text-slate-700 cursor-pointer select-none">
            Show Farmer Name on Gate Pass
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <Button onClick={() => setIsSearchLotModalOpen(true)} variant="secondary" size="sm">
            <Search className="mr-2 h-4 w-4" /> Search Lot No
          </Button>
          <Button onClick={() => setIsSearchModalOpen(true)} variant="secondary" size="sm">
            <Search className="mr-2 h-4 w-4" /> Search Inward
          </Button>
          <Button onClick={exportCsv} variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>
      
      <SearchLotModal 
        isOpen={isSearchLotModalOpen} 
        onClose={() => setIsSearchLotModalOpen(false)} 
      />
      <SearchInwardModal 
        isOpen={isSearchModalOpen} 
        onClose={() => setIsSearchModalOpen(false)} 
      />

      <div className="rounded-md border bg-white shadow-sm overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead className="font-semibold whitespace-nowrap align-middle">
              <button
                type="button"
                onClick={toggleDateSort}
                className="inline-flex items-center gap-1.5 font-semibold text-slate-800 hover:text-indigo-600 focus:outline-none transition-colors group cursor-pointer"
                title={`Sort by Date: currently ${dateSortOrder === 'asc' ? 'Oldest to Newest' : 'Newest to Oldest'} (click to toggle)`}
              >
                <span>{t('outward.dateHeader')}</span>
                <span className="inline-flex items-center text-xs font-medium text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                  {dateSortOrder === 'asc' ? (
                    <>
                      <ArrowUp className="h-3.5 w-3.5 mr-0.5" /> Asc
                    </>
                  ) : (
                    <>
                      <ArrowDown className="h-3.5 w-3.5 mr-0.5" /> Desc
                    </>
                  )}
                </span>
              </button>
            </TableHead>
            <TableHead className="font-semibold min-w-[220px] align-middle">
              <div className="flex flex-col gap-1.5 py-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-800">{t('outward.clientNameHeader')}</span>
                  {clientSearchQuery && (
                    <span className="text-[10px] bg-indigo-50 text-indigo-700 font-medium px-1.5 py-0.5 rounded border border-indigo-200">
                      Filtered
                    </span>
                  )}
                </div>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search client name..."
                    value={clientSearchQuery}
                    onChange={(e) => {
                      setClientSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="h-7 w-full pl-8 pr-7 rounded border border-slate-300 bg-white text-xs font-normal text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-sm"
                  />
                  {clientSearchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setClientSearchQuery('');
                        setCurrentPage(1);
                      }}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer rounded-full hover:bg-slate-100"
                      title="Clear client search"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </TableHead>
            <TableHead className="font-semibold align-middle">{t('outward.commodityHeader')}</TableHead>
            <TableHead className="font-semibold min-w-[170px] align-middle">
              <div className="flex flex-col gap-1.5 py-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-800">{t('outward.lotNo') || 'Lot No'}</span>
                  {lotSearchQuery && (
                    <span className="text-[10px] bg-indigo-50 text-indigo-700 font-medium px-1.5 py-0.5 rounded border border-indigo-200">
                      Filtered
                    </span>
                  )}
                </div>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search lot no..."
                    value={lotSearchQuery}
                    onChange={(e) => {
                      setLotSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="h-7 w-full pl-8 pr-7 rounded border border-slate-300 bg-white text-xs font-normal text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-sm"
                  />
                  {lotSearchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setLotSearchQuery('');
                        setCurrentPage(1);
                      }}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer rounded-full hover:bg-slate-100"
                      title="Clear lot search"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </TableHead>
            <TableHead className="font-semibold align-middle">{t('outward.warehouseHeader')}</TableHead>
            <TableHead className="text-right font-semibold align-middle">{t('outward.chamberHeader')}</TableHead>
            <TableHead className="text-right font-semibold align-middle">{t('outward.floorHeader')}</TableHead>
            <TableHead className="text-right font-semibold align-middle">{t('outward.stackHeader')}</TableHead>
            <TableHead className="font-semibold align-middle">{t('inward.grade')}</TableHead>
            <TableHead className="text-right font-semibold align-middle">Qty (KG)</TableHead>
            <TableHead className="text-right font-semibold align-middle">Units</TableHead>
            <TableHead className="text-right font-semibold align-middle">{t('outward.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {processedOutwards.length === 0 ? (
            <TableRow>
              <TableCell colSpan={12} className="h-24 text-center text-slate-500">
                {(clientSearchQuery || lotSearchQuery) ? (
                  <div className="flex flex-col items-center justify-center gap-2">
                    <p>
                      No outward transactions found matching
                      {clientSearchQuery && <> client &quot;{clientSearchQuery}&quot;</>}
                      {clientSearchQuery && lotSearchQuery && <> and</>}
                      {lotSearchQuery && <> lot no &quot;{lotSearchQuery}&quot;</>}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setClientSearchQuery('');
                        setLotSearchQuery('');
                        setCurrentPage(1);
                      }}
                      className="text-xs h-7"
                    >
                      Clear filters
                    </Button>
                  </div>
                ) : (
                  t('outward.noOutwardFound')
                )}
              </TableCell>
            </TableRow>
          ) : (
            paginatedOutwards.map((w) => {
              const commodityDisplay = w.commodityId ? `${w.commodityId.name} (${w.commodityId.type})` : t('clients.unknown');
              
              const printUrl = (w.isBatch && w.batchId)
                ? `/api/cold/receipt/html?batchId=${w.batchId}&type=outward&showFarmerName=${showFarmerNameOnPrint}`
                : `/api/cold/receipt/html?id=${w._id}&type=outward&showFarmerName=${showFarmerNameOnPrint}`;

              let sameGrade = true;

              if (w.isBatch && w.items && w.items.length > 0) {
                const first = w.items[0];
                for (const item of w.items) {
                  if (item.grade !== first.grade || item.gradingType !== first.gradingType) sameGrade = false;
                }
              }

              const displayChamber = w.isBatch && w.items && w.items.length > 1 ? (
                <div className="flex flex-col gap-1">
                  {w.items.map((item: any, i: number) => <div key={item._id || i}>{String(item.chamberName || formatNumber(item.chamberNo)).replace(/^Chamber\s+/i, '')}</div>)}
                </div>
              ) : String(w.chamberName || formatNumber(w.chamberNo)).replace(/^Chamber\s+/i, '');

              const displayFloor = w.isBatch && w.items && w.items.length > 1 ? (
                <div className="flex flex-col gap-1">
                  {w.items.map((item: any, i: number) => {
                     const isCustom = item.floorName && item.floorName.trim().toLowerCase() !== `floor ${item.floorNo}`;
                     return <div key={item._id || i}>{isCustom ? item.floorName : formatNumber(item.floorNo)}</div>;
                  })}
                </div>
              ) : ((w.floorName && w.floorName.trim().toLowerCase() !== `floor ${w.floorNo}`) ? w.floorName : formatNumber(w.floorNo));

              const displayStack = w.isBatch && w.items && w.items.length > 1 ? (
                <div className="flex flex-col gap-1">
                  {w.items.map((item: any, i: number) => <div key={item._id || i}>{formatNumber(item.stackNo)}</div>)}
                </div>
              ) : formatNumber(w.stackNo);
              
              const displayLotNo = w.isBatch && w.items && w.items.length > 1 ? (
                <div className="flex flex-col gap-1">
                  {w.items.map((item: any, i: number) => <div key={item._id || i}>{item.lotNo || item.inwardId?.lotNo || '-'}</div>)}
                </div>
              ) : (w.lotNo || w.inwardId?.lotNo || '-');

              const displayGrade = (w.isBatch && !sameGrade) ? t('outward.mixedMulti') : (
                <>
                  {w.gradingType || '-'}
                </>
              );

              return (
                <TableRow key={(w.batchId || w._id).toString()} className="hover:bg-slate-50/50 transition-colors">
                  <TableCell className="text-slate-600">
                    {w.date ? format(new Date(w.date), 'dd MMM yyyy') : '-'}
                  </TableCell>
                  <TableCell className="font-medium text-slate-900">
                    {w.clientId?.name || '-'}
                    {w.farmerName && <div className="text-xs font-normal text-slate-500 mt-0.5">{t('outward.farmerPrefix')}{w.farmerName}</div>}
                    {w.isCarryOver && (w.carryOverClientName || w.carryOverClientId?.name) && <div className="text-xs font-semibold text-indigo-600 mt-0.5">C/o: {w.carryOverClientName || w.carryOverClientId?.name}</div>}
                  </TableCell>
                  <TableCell className="text-slate-700">{commodityDisplay}</TableCell>
                  <TableCell className="font-medium text-slate-900">{displayLotNo}</TableCell>
                  <TableCell className="text-slate-700">{w.warehouseId?.name || '-'}</TableCell>
                  <TableCell className="text-right text-slate-700">{displayChamber}</TableCell>
                  <TableCell className="text-right text-slate-700">{displayFloor}</TableCell>
                  <TableCell className="text-right text-slate-700">{displayStack}</TableCell>
                  <TableCell className="text-slate-700">
                    {displayGrade}
                  </TableCell>
                  <TableCell className="text-right font-medium text-slate-900">{formatNumber(w.quantityKg)} KG</TableCell>
                  <TableCell className="text-right text-slate-700">{formatNumber(w.bagsCount)} {getDynamicUnitLabel(w.unit || w.commodityId?.unit || 'KG', 'plural')}</TableCell>
                  <TableCell className="text-right">
                    <a 
                      href={printUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-transparent shadow-sm hover:bg-accent hover:text-accent-foreground h-8 w-8 text-slate-600 hover:text-indigo-600"
                      title={t('outward.print')}
                    >
                      <Printer className="h-4 w-4" />
                      <span className="sr-only">{t('outward.print')}</span>
                    </a>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
      </div>

      {totalItems > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-2 px-1 text-sm text-slate-600">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-600">Rows per page:</span>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="border border-slate-300 rounded px-2 py-1 bg-white text-slate-900 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span className="text-xs text-slate-500 ml-2">
              {(clientSearchQuery || lotSearchQuery) ? (
                <>Showing {totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} to {Math.min(totalItems, currentPage * itemsPerPage)} of {totalItems} records (filtered from {(outwards || []).length} total)</>
              ) : (
                <>Showing {totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} to {Math.min(totalItems, currentPage * itemsPerPage)} of {totalItems} records</>
              )}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-600 mr-2">
              Page {currentPage} of {Math.max(1, totalPages)}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage <= 1}
              className="h-8 px-2"
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage >= totalPages}
              className="h-8 px-2"
            >
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
