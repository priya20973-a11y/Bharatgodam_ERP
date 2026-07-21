'use client';

import { useState } from 'react';
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
  const [showRent, setShowRent] = useState(true);

  return (
    <div className="space-y-4">
      <div className="flex justify-end items-center px-2">
        <label className="flex items-center space-x-2 text-sm font-medium text-slate-700 cursor-pointer">
          <input 
            type="checkbox" 
            checked={showRent} 
            onChange={(e) => setShowRent(e.target.checked)}
            className="rounded border-slate-300 text-indigo-600 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
          />
          <span>Show Rent in Gatepass</span>
        </label>
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
              <TableHead className="text-right font-semibold">{t('outward.quantityHeader')}</TableHead>
              <TableHead className="text-right font-semibold">{t('outward.bagsHeader')}</TableHead>
              <TableHead className="text-right font-semibold">{t('outward.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {outwards.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center text-slate-500">
                  {t('outward.noOutwardFound')}
                </TableCell>
              </TableRow>
            ) : (
              outwards.map((w) => {
                const commodityDisplay = w.commodityId ? `${w.commodityId.name} (${w.commodityId.type})` : t('clients.unknown');
                
                const printUrl = w.isBatch 
                  ? `/api/cold/receipt/html?batchId=${w.batchId}&type=outward&showRent=${showRent}`
                  : `/api/cold/receipt/html?id=${w._id}&type=outward&showRent=${showRent}`;

              let sameChamber = true;
              let sameFloor = true;
              let sameStack = true;
              let sameGrade = true;

              if (w.isBatch && w.items && w.items.length > 0) {
                const first = w.items[0];
                for (const item of w.items) {
                  if (item.chamberNo !== first.chamberNo) sameChamber = false;
                  if (item.floorNo !== first.floorNo) sameFloor = false;
                  if (item.stackNo !== first.stackNo) sameStack = false;
                  if (item.grade !== first.grade || item.gradingType !== first.gradingType) sameGrade = false;
                }
              }

              const displayChamber = (w.isBatch && !sameChamber) ? t('outward.multi') : formatNumber(w.chamberNo);
              const displayFloor = (w.isBatch && !sameFloor) ? t('outward.multi') : formatNumber(w.floorNo);
              const displayStack = (w.isBatch && !sameStack) ? t('outward.multi') : formatNumber(w.stackNo);
              
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
    </div>
  );
}
