'use client';

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

interface ColdInwardListProps {
  inwards: any[];
}

export default function ColdInwardList({ inwards }: ColdInwardListProps) {
  const { t, formatNumber } = useColdTranslation();

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
          {inwards.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="h-24 text-center text-slate-500">
                {t('inward.noInwardFound')}
              </TableCell>
            </TableRow>
          ) : (
            inwards.map((w) => {
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
                  <TableCell className="text-right text-slate-700">{formatNumber(w.chamberNo)}</TableCell>
                  <TableCell className="text-right text-slate-700">{formatNumber(w.floorNo)}</TableCell>
                  <TableCell className="text-right text-slate-700">{formatNumber(w.stackNo)}</TableCell>
                  <TableCell className="text-slate-700">
                    {w.grade || '-'} 
                    {w.gradingType ? ` (${w.gradingType})` : ''}
                  </TableCell>
                  <TableCell className="text-right font-medium text-slate-900">{formatNumber(w.quantityKg)}</TableCell>
                  <TableCell className="text-right text-slate-700">{formatNumber(w.bagsCount)}</TableCell>
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
