'use client';

import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { Download, Printer, QrCode } from "lucide-react";
import { useColdTranslation } from '@/components/providers/cold-language-provider';
import { Badge } from '@/components/ui/badge';

interface ColdInwardListProps {
  inwards: any[];
}

export default function ColdInwardList({ inwards }: ColdInwardListProps) {
  const { t, formatNumber } = useColdTranslation();

  const groupedInwards = inwards;

  return (
    <div className="rounded-md border bg-white shadow-sm overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead className="font-semibold">{t('inward.dateHeader')}</TableHead>
            <TableHead className="font-semibold">{t('inward.clientNameHeader')}</TableHead>
            <TableHead className="font-semibold">{t('inward.commodityHeader')}</TableHead>
            <TableHead className="font-semibold">{t('inward.warehouseHeader')}</TableHead>
            <TableHead className="text-right font-semibold">{t('inward.chamberHeader')}</TableHead>
            <TableHead className="text-right font-semibold">{t('inward.floorHeader')}</TableHead>
            <TableHead className="text-right font-semibold">{t('inward.stackHeader')}</TableHead>
            <TableHead className="font-semibold">Grade</TableHead>
            <TableHead className="text-right font-semibold">{t('inward.quantityHeader')}</TableHead>
            <TableHead className="text-right font-semibold">{t('inward.bagsHeader')}</TableHead>
            <TableHead className="text-right font-semibold">{t('inward.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groupedInwards.length === 0 ? (
            <TableRow>
              <TableCell colSpan={11} className="h-24 text-center text-slate-500">
                {t('inward.noInwardFound')}
              </TableCell>
            </TableRow>
          ) : (
            groupedInwards.map((w) => {
              const commodityDisplay = w.commodityId ? `${w.commodityId.name} (${w.commodityId.type})` : t('clients.unknown');
              return (
                <TableRow key={w._id.toString()} className="hover:bg-slate-50/50 transition-colors">
                  <TableCell className="text-slate-600">
                    {w.date ? format(new Date(w.date), 'dd MMM yyyy') : '-'}
                  </TableCell>
                  <TableCell className="font-medium text-slate-900">
                    {w.clientId?.name || '-'}
                    {w.farmerName && <div className="text-xs font-normal text-slate-500 mt-0.5">Farmer: {w.farmerName}</div>}
                  </TableCell>
                  <TableCell className="text-slate-700">{commodityDisplay}</TableCell>
                  <TableCell className="text-slate-700">{w.warehouseId?.name || '-'}</TableCell>
                  <TableCell className="text-right text-slate-700">
                    {w.stackAllocations?.map((s: any, i: number) => <div key={i}>{formatNumber(s.chamberNo)}</div>) || formatNumber(w.chamberNo)}
                  </TableCell>
                  <TableCell className="text-right text-slate-700">
                    {w.stackAllocations?.map((s: any, i: number) => <div key={i}>{formatNumber(s.floorNo)}</div>) || formatNumber(w.floorNo)}
                  </TableCell>
                  <TableCell className="text-right text-slate-700">
                    {w.stackAllocations?.map((s: any, i: number) => <div key={i}>{formatNumber(s.stackNo)}</div>) || formatNumber(w.stackNo)}
                  </TableCell>
                  <TableCell className="text-slate-700">
                    {w.gradingType || '-'}
                  </TableCell>
                  <TableCell className="text-right font-medium text-slate-900">{formatNumber(w.quantityKg)}</TableCell>
                  <TableCell className="text-right text-slate-700">{formatNumber(w.bagsCount)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2 flex-wrap">
                      <a 
                        href={`/api/cold/qr?inwardId=${w._id}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 shadow-sm transition hover:bg-indigo-100 hover:text-indigo-900"
                        title="View QR"
                      >
                        <QrCode className="h-4 w-4" />
                        <span>QR</span>
                      </a>
                      <a 
                        href={`/api/cold/qr?inwardId=${w._id}&download=1`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-transparent shadow-sm hover:bg-accent hover:text-accent-foreground h-8 w-8 text-slate-600 hover:text-indigo-600"
                        title="Download QR"
                      >
                        <Download className="h-4 w-4" />
                        <span className="sr-only">Download QR</span>
                      </a>
                      <Badge variant="success" className="text-[10px] px-2 py-1">QR generated</Badge>
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
                    </div>
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
