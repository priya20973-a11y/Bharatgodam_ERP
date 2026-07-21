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
import { Printer } from "lucide-react";
import { useColdTranslation } from '@/components/providers/cold-language-provider';

interface ColdOutwardListProps {
  outwards: any[];
}

export default function ColdOutwardList({ outwards }: ColdOutwardListProps) {
  const { t, formatNumber } = useColdTranslation();

  const groupedOutwards = useMemo(() => {
    const groups: any[] = [];
    outwards.forEach(w => {
      // Find an existing group where the client is the same and the createdAt time is within 1 minute
      const wTime = w.createdAt ? new Date(w.createdAt).getTime() : 0;
      const existingGroup = wTime > 0 ? groups.find(g => {
        const gClientId = g.clientId?._id?.toString() || g.clientId?.toString();
        const wClientId = w.clientId?._id?.toString() || w.clientId?.toString();
        if (gClientId !== wClientId) return false;
        
        const gTime = g.createdAt ? new Date(g.createdAt).getTime() : 0;
        return Math.abs(gTime - wTime) <= 60000;
      }) : null;

      if (existingGroup && !w.batchId) {
        existingGroup.items = existingGroup.items || [ { ...existingGroup } ];
        existingGroup.items.push(...(w.items || [w]));
        existingGroup.quantityKg += w.quantityKg || 0;
        existingGroup.bagsCount += w.bagsCount || 0;
        existingGroup.isBatch = true;
      } else {
        groups.push({ ...w, items: w.items ? [...w.items] : undefined });
      }
    });
    return groups;
  }, [outwards]);

  return (
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
            <TableHead className="text-right font-semibold">{t('outward.quantityHeader')}</TableHead>
            <TableHead className="text-right font-semibold">{t('outward.bagsHeader')}</TableHead>
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
                  {w.items.map((item: any, i: number) => <div key={item._id || i}>{formatNumber(item.chamberNo)}</div>)}
                </div>
              ) : formatNumber(w.chamberNo);

              const displayFloor = w.isBatch && w.items && w.items.length > 1 ? (
                <div className="flex flex-col gap-1">
                  {w.items.map((item: any, i: number) => <div key={item._id || i}>{formatNumber(item.floorNo)}</div>)}
                </div>
              ) : formatNumber(w.floorNo);

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
                  <TableCell className="text-right font-medium text-slate-900">{formatNumber(w.quantityKg)}</TableCell>
                  <TableCell className="text-right text-slate-700">{formatNumber(w.bagsCount)}</TableCell>
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
  );
}
