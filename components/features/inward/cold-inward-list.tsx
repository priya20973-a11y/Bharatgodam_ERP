'use client';

import React, { useState, useMemo } from 'react';
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
  Download, 
  QrCode, 
  Loader2, 
  ChevronLeft, 
  ChevronRight,
  Search,
  ArrowUp,
  ArrowDown,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useColdTranslation } from '@/components/providers/cold-language-provider';
import QrCodeModal from "./qr-code-modal";
import { ensureInwardQrId } from "@/app/actions/cold-inward-actions";
import { toast } from "react-hot-toast";

interface ColdInwardListProps {
  inwards: any[];
  pagination?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  onPageChange?: (page: number) => void;
  onLimitChange?: (limit: number) => void;
  isLoading?: boolean;
  fetchFullDataset?: () => Promise<any[]>;
}

export default function ColdInwardList({ 
  inwards, 
  pagination, 
  onPageChange, 
  onLimitChange, 
  isLoading,
  fetchFullDataset
}: ColdInwardListProps) {
  const { t, formatNumber } = useColdTranslation();

  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [selectedInward, setSelectedInward] = useState<any | null>(null);
  const [selectedQrId, setSelectedQrId] = useState<string | null>(null);
  const [generatingQrId, setGeneratingQrId] = useState<string | null>(null);

  // Date column sorting state: 'desc' (newest first) or 'asc' (oldest first)
  const [dateSortOrder, setDateSortOrder] = useState<'desc' | 'asc'>('desc');

  // Client name search state
  const [clientSearchQuery, setClientSearchQuery] = useState('');

  // Lot No search state
  const [lotSearchQuery, setLotSearchQuery] = useState('');

  const toggleDateSort = () => {
    setDateSortOrder(prev => (prev === 'desc' ? 'asc' : 'desc'));
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

  // Filtered and sorted inwards
  const processedInwards = useMemo(() => {
    let list = inwards || [];

    // Filter by client name (case-insensitive partial matching)
    if (clientSearchQuery.trim()) {
      const q = clientSearchQuery.trim().toLowerCase();
      list = list.filter((w) => {
        const clientName = (w.clientId?.name || '').toLowerCase();
        return clientName.includes(q);
      });
    }

    // Filter by lot number (case-insensitive partial matching)
    if (lotSearchQuery.trim()) {
      const q = lotSearchQuery.trim().toLowerCase();
      list = list.filter((w) => {
        const lot = String(w.lotNo || w.lotNumber || '').toLowerCase();
        return lot.includes(q);
      });
    }

    // Sort by actual transaction date
    return [...list].sort((a, b) => {
      const timeA = getTxDateMs(a);
      const timeB = getTxDateMs(b);
      return dateSortOrder === 'asc' ? timeA - timeB : timeB - timeA;
    });
  }, [inwards, clientSearchQuery, lotSearchQuery, dateSortOrder]);

  const getFloorName = (warehouse: any, chamberName: any, floorNo: any) => {
    if (!warehouse || !warehouse.chambers) return floorNo ?? '-';
    const chamber = warehouse.chambers.find((c: any) => c.name === chamberName || c.chamberNo === chamberName);
    if (!chamber) return floorNo ?? '-';
    const floor = (chamber.floors || []).find((f: any) => f.floorNo === floorNo);
    if (floor && floor.name && floor.name.trim().toLowerCase() !== `floor ${floorNo}`) {
       return floor.name;
    }
    return floorNo ?? '-';
  };

  const [isExporting, setIsExporting] = useState(false);

  const exportCsv = async () => {
    setIsExporting(true);
    let exportData = processedInwards;
    
    if (fetchFullDataset) {
      try {
        toast.loading("Preparing CSV...", { id: 'csv-export' });
        const full = await fetchFullDataset();
        let list = full || [];
        if (clientSearchQuery.trim()) {
          const q = clientSearchQuery.trim().toLowerCase();
          list = list.filter((w: any) => (w.clientId?.name || '').toLowerCase().includes(q));
        }
        if (lotSearchQuery.trim()) {
          const q = lotSearchQuery.trim().toLowerCase();
          list = list.filter((w: any) => String(w.lotNo || w.lotNumber || '').toLowerCase().includes(q));
        }
        exportData = [...list].sort((a, b) => {
          const timeA = getTxDateMs(a);
          const timeB = getTxDateMs(b);
          return dateSortOrder === 'asc' ? timeA - timeB : timeB - timeA;
        });
        toast.dismiss('csv-export');
      } catch (err) {
        toast.dismiss('csv-export');
        toast.error("Failed to fetch full dataset for export");
        setIsExporting(false);
        return;
      }
    }
    const headers = [
      t('inward.dateHeader') || 'Date',
      t('inward.clientNameHeader') || 'Client Name',
      'Farmer Name',
      'Village Name',
      'Large Bag',
      'Small Bag',
      t('inward.commodityHeader') || 'Commodity',
      t('inward.lotNo') || 'Lot No',
      t('inward.warehouseHeader') || 'Warehouse',
      t('inward.chamberHeader') || 'Chamber',
      t('inward.floorHeader') || 'Floor',
      t('inward.stackHeader') || 'Stack',
      'Grade',
      t('inward.quantityHeader') || 'Net Weight (kg)',
      t('inward.bagsHeader') || 'Bags'
    ];
    
    const rows = exportData.map((w: any) => {
      const date = w.date ? format(new Date(w.date), 'dd MMM yyyy') : '-';
      const client = w.clientId?.name || '-';
      const farmer = w.farmerName || '-';
      const village = w.villageName || '-';
      const largeBag = w.largeBag || 0;
      const smallBag = w.smallBag || 0;
      const commodity = w.commodityId ? `${w.commodityId.name} (${w.commodityId.type})` : 'Unknown';
      const lotNo = w.lotNo || '-';
      const warehouse = w.warehouseId?.name || '-';
      const chamber = w.stackAllocations?.map((s: any) => String(s.chamberName || s.chamberNo).replace(/^Chamber\s+/i, '')).join('; ') || String(w.chamberName || w.chamberNo).replace(/^Chamber\s+/i, '');
      const floor = w.stackAllocations?.map((s: any) => getFloorName(w.warehouseId, s.chamberName || s.chamberNo, s.floorNo)).join('; ') || getFloorName(w.warehouseId, w.chamberName || w.chamberNo, w.floorNo);
      const stack = w.stackAllocations?.map((s: any) => s.stackNo).join('; ') || w.stackNo || '-';
      const grade = w.gradingType || '-';
      const qty = (w.originalQuantityKg ?? w.quantityKg) || 0;
      const bags = (w.originalBagsCount ?? w.bagsCount) || 0;
      return [date, client, farmer, village, largeBag, smallBag, commodity, lotNo, warehouse, chamber, floor, stack, grade, qty, bags]
        .map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });
    
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Inward_Export_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setIsExporting(false);
  };

  const handleOpenQrModal = async (w: any) => {
    if (w.qrId) {
      setSelectedInward(w);
      setSelectedQrId(w.qrId);
      setQrModalOpen(true);
    } else {
      setGeneratingQrId(w._id.toString());
      try {
        const res = await ensureInwardQrId(w._id.toString());
        if (res.success && res.qrId) {
          // Mutate local state so we don't have to fetch it again next time
          w.qrId = res.qrId;
          setSelectedInward(w);
          setSelectedQrId(res.qrId);
          setQrModalOpen(true);
        } else {
          toast.error(res.error || 'Failed to generate QR ID');
        }
      } catch (err: any) {
        toast.error(err.message || 'An unexpected error occurred while generating QR ID');
      } finally {
        setGeneratingQrId(null);
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={exportCsv} variant="outline" size="sm" disabled={isExporting}>
          {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          {isExporting ? 'Exporting...' : 'Export CSV'}
        </Button>
      </div>
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
                <span>{t('inward.dateHeader')}</span>
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
                  <span className="text-slate-800">{t('inward.clientNameHeader')}</span>
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
                    onChange={(e) => setClientSearchQuery(e.target.value)}
                    className="h-7 w-full pl-8 pr-7 rounded border border-slate-300 bg-white text-xs font-normal text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-sm"
                  />
                  {clientSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setClientSearchQuery('')}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer rounded-full hover:bg-slate-100"
                      title="Clear client search"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </TableHead>
            <TableHead className="font-semibold align-middle">{t('inward.commodityHeader')}</TableHead>
            <TableHead className="font-semibold min-w-[170px] align-middle">
              <div className="flex flex-col gap-1.5 py-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-800">{t('inward.lotNo') || 'Lot No'}</span>
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
                    onChange={(e) => setLotSearchQuery(e.target.value)}
                    className="h-7 w-full pl-8 pr-7 rounded border border-slate-300 bg-white text-xs font-normal text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-sm"
                  />
                  {lotSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setLotSearchQuery('')}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer rounded-full hover:bg-slate-100"
                      title="Clear lot search"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </TableHead>
            <TableHead className="font-semibold align-middle">{t('inward.warehouseHeader')}</TableHead>
            <TableHead className="text-right font-semibold align-middle">{t('inward.chamberHeader')}</TableHead>
            <TableHead className="text-right font-semibold align-middle">{t('inward.floorHeader')}</TableHead>
            <TableHead className="text-right font-semibold align-middle">{t('inward.stackHeader')}</TableHead>
            <TableHead className="font-semibold align-middle">Grade</TableHead>
            <TableHead className="text-right font-semibold align-middle">{t('inward.quantityHeader')}</TableHead>
            <TableHead className="text-right font-semibold align-middle">{t('inward.bagsHeader')}</TableHead>
            <TableHead className="text-right font-semibold align-middle">{t('inward.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {processedInwards.length === 0 ? (
            <TableRow>
              <TableCell colSpan={12} className="h-24 text-center text-slate-500">
                {(clientSearchQuery || lotSearchQuery) ? (
                  <div className="flex flex-col items-center justify-center gap-2">
                    <p>
                      No inward transactions found matching
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
                      }}
                      className="text-xs h-7"
                    >
                      Clear filters
                    </Button>
                  </div>
                ) : (
                  t('inward.noInwardFound')
                )}
              </TableCell>
            </TableRow>
          ) : (
            processedInwards.map((w) => {
              const commodityDisplay = w.commodityId ? `${w.commodityId.name} (${w.commodityId.type})` : t('clients.unknown');
              return (
                <TableRow key={w._id.toString()} className="hover:bg-slate-50/50 transition-colors">
                  <TableCell className="text-slate-600">
                    {w.date ? format(new Date(w.date), 'dd MMM yyyy') : '-'}
                  </TableCell>
                  <TableCell className="font-medium text-slate-900">
                    {w.clientId?.name || '-'}
                    {w.farmerName && <div className="text-xs font-normal text-slate-500 mt-0.5">Farmer: {w.farmerName}</div>}
                    {w.villageName && <div className="text-xs font-normal text-slate-500 mt-0.5">Village: {w.villageName}</div>}
                  </TableCell>
                  <TableCell className="text-slate-700">{commodityDisplay}</TableCell>
                  <TableCell className="font-medium text-slate-900">{w.lotNo || '-'}</TableCell>
                  <TableCell className="text-slate-700">{w.warehouseId?.name || '-'}</TableCell>
                  <TableCell className="text-right text-slate-700">
                    {w.stackAllocations?.map((s: any, i: number) => <div key={i}>{String(s.chamberName || formatNumber(s.chamberNo)).replace(/^Chamber\s+/i, '')}</div>) || String(w.chamberName || formatNumber(w.chamberNo)).replace(/^Chamber\s+/i, '')}
                  </TableCell>
                  <TableCell className="text-right text-slate-700">
                    {w.stackAllocations?.map((s: any, i: number) => <div key={i}>{getFloorName(w.warehouseId, s.chamberName || s.chamberNo, s.floorNo)}</div>) || getFloorName(w.warehouseId, w.chamberName || w.chamberNo, w.floorNo)}
                  </TableCell>
                  <TableCell className="text-right text-slate-700">
                    {w.stackAllocations?.map((s: any, i: number) => <div key={i}>{formatNumber(s.stackNo)}</div>) || formatNumber(w.stackNo)}
                  </TableCell>
                  <TableCell className="text-slate-700">
                    {w.gradingType || '-'}
                  </TableCell>
                  <TableCell className="text-right font-medium text-slate-900">{formatNumber((w.originalQuantityKg ?? w.quantityKg) || 0)} KG</TableCell>
                  <TableCell className="text-right text-slate-700">
                    <div>
                      {formatNumber((w.originalBagsCount ?? w.bagsCount) || 0)}
                      {(w.unit || w.commodityId?.unit) && (w.unit || w.commodityId?.unit) !== 'KG' ? ` ${w.unit || w.commodityId?.unit}` : ''}
                    </div>
                    {(w.largeBag || w.smallBag) ? (
                      <div className="text-xs text-slate-500 mt-0.5">L: {formatNumber(w.largeBag || 0)} | S: {formatNumber(w.smallBag || 0)}</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right">
                    <a 
                      href={`/api/cold/receipt/html?id=${w._id}&type=inward`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-transparent shadow-sm hover:bg-accent hover:text-accent-foreground h-8 w-8 text-slate-600 hover:text-indigo-600"
                      title={t('inward.print')}
                    >
                      <Printer className="h-4 w-4" />
                      <span className="sr-only">{t('inward.print')}</span>
                    </a>
                    <button
                      onClick={() => handleOpenQrModal(w)}
                      disabled={generatingQrId === w._id.toString()}
                      className="inline-flex ml-1 items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-transparent shadow-sm hover:bg-accent hover:text-accent-foreground h-8 w-8 text-slate-600 hover:text-indigo-600"
                      title="View QR Code"
                    >
                      {generatingQrId === w._id.toString() ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                      <span className="sr-only">View QR Code</span>
                    </button>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
      </div>

      {pagination && pagination.total > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-2 px-1 text-sm text-slate-600">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-600">Rows per page:</span>
            <select
              value={pagination.limit}
              onChange={(e) => onLimitChange?.(Number(e.target.value))}
              disabled={isLoading}
              className="border rounded px-2 py-1 bg-white text-slate-900 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span className="text-xs text-slate-500 ml-2">
              {(clientSearchQuery || lotSearchQuery) ? (
                <>Showing {processedInwards.length} matching records on this page (filtered from {pagination.total} total)</>
              ) : (
                <>Showing {pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1} to {Math.min(pagination.total, pagination.page * pagination.limit)} of {pagination.total} records</>
              )}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-600 mr-2">
              Page {pagination.page} of {Math.max(1, pagination.totalPages)}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange?.(pagination.page - 1)}
              disabled={pagination.page <= 1 || isLoading}
              className="h-8 px-2"
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange?.(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages || isLoading}
              className="h-8 px-2"
            >
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      <QrCodeModal 
        isOpen={qrModalOpen} 
        onClose={() => setQrModalOpen(false)} 
        inwardData={selectedInward} 
        qrId={selectedQrId} 
      />
    </div>
  );
}
