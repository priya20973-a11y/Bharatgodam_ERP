'use client';

import React, { useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { Printer, Search, Download, Calendar as CalendarIcon, ChevronDown, Check } from 'lucide-react';
import { getDynamicUnitLabel } from '@/lib/utils';
import { Button } from "@/components/ui/button";
import { useColdTranslation } from '@/components/providers/cold-language-provider';

interface ColdOutwardListProps {
  outwards: any[];
}

export default function ColdOutwardList({ outwards }: ColdOutwardListProps) {
  const { t, formatNumber } = useColdTranslation();

  const groupedOutwards = useMemo(() => {
    return outwards;
  }, [outwards]);

  const exportCsv = () => {
    const headers = [
      t('outward.dateHeader') || 'Date',
      t('outward.clientNameHeader') || 'Client Name',
      'Farmer Name',
      t('outward.commodityHeader') || 'Commodity',
      t('outward.warehouseHeader') || 'Warehouse',
      t('outward.chamberHeader') || 'Chamber',
      t('outward.floorHeader') || 'Floor',
      t('outward.stackHeader') || 'Stack',
      t('inward.grade') || 'Grade',
      t('outward.quantityHeader') || 'Net Weight (kg)',
      t('outward.bagsHeader') || 'Bags'
    ];
    
    const rows = groupedOutwards.map(w => {
      const date = w.date ? format(new Date(w.date), 'dd MMM yyyy') : '-';
      const client = w.clientId?.name || '-';
      const farmer = w.farmerName || '-';
      const commodity = w.commodityId ? `${w.commodityId.name} (${w.commodityId.type})` : 'Unknown';
      const warehouse = w.warehouseId?.name || '-';
      const chamber = w.isBatch && w.items && w.items.length > 1
        ? w.items.map((item: any) => String(item.chamberName || item.chamberNo).replace(/^Chamber\s+/i, '')).join('; ')
        : String(w.chamberName || w.chamberNo).replace(/^Chamber\s+/i, '');
      const floor = w.isBatch && w.items && w.items.length > 1
        ? w.items.map((item: any) => item.floorName || item.floorNo).join('; ')
        : (w.floorName || w.floorNo || '-');
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
      return [date, client, farmer, commodity, warehouse, chamber, floor, stack, grade, qty, bags]
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
      <div className="flex justify-end">
        <Button onClick={exportCsv} variant="outline" size="sm">
          <Download className="mr-2 h-4 w-4" /> Export CSV
        </Button>
      </div>
      <div className="rounded-md border bg-white shadow-sm overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead className="font-semibold">{t('outward.dateHeader')}</TableHead>
            <TableHead className="font-semibold">{t('outward.clientNameHeader')}</TableHead>
            <TableHead className="font-semibold">{t('outward.commodityHeader')}</TableHead>
            <TableHead className="font-semibold">{t('outward.warehouseHeader')}</TableHead>
            <TableHead className="text-right font-semibold">{t('outward.chamberHeader')}</TableHead>
            <TableHead className="text-right font-semibold">{t('outward.floorHeader')}</TableHead>
            <TableHead className="text-right font-semibold">{t('outward.stackHeader')}</TableHead>
            <TableHead className="font-semibold">{t('inward.grade')}</TableHead>
            <TableHead className="text-right font-semibold">Qty (KG)</TableHead>
            <TableHead className="text-right font-semibold">Units</TableHead>
            <TableHead className="text-right font-semibold">{t('outward.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groupedOutwards.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="h-24 text-center text-slate-500">
                {t('outward.noOutwardFound')}
              </TableCell>
            </TableRow>
          ) : (
            groupedOutwards.map((w) => {
              const commodityDisplay = w.commodityId ? `${w.commodityId.name} (${w.commodityId.type})` : t('clients.unknown');
              
              const printUrl = (w.isBatch && w.batchId)
                ? `/api/cold/receipt/html?batchId=${w.batchId}&type=outward`
                : `/api/cold/receipt/html?id=${w._id}&type=outward`;

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
                  {w.items.map((item: any, i: number) => <div key={item._id || i}>{item.floorName || formatNumber(item.floorNo)}</div>)}
                </div>
              ) : (w.floorName || formatNumber(w.floorNo));

              const displayStack = w.isBatch && w.items && w.items.length > 1 ? (
                <div className="flex flex-col gap-1">
                  {w.items.map((item: any, i: number) => <div key={item._id || i}>{formatNumber(item.stackNo)}</div>)}
                </div>
              ) : formatNumber(w.stackNo);
              
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
                  </TableCell>
                  <TableCell className="text-slate-700">{commodityDisplay}</TableCell>
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
    </div>
  );
}
