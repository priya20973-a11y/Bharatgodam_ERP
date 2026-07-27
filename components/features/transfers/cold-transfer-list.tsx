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
import { Printer } from "lucide-react";
import { useColdTranslation } from '@/components/providers/cold-language-provider';

interface ColdTransferListProps {
  transfers: any[];
}

export default function ColdTransferList({ transfers }: ColdTransferListProps) {
  const { t, formatNumber } = useColdTranslation();

  const handlePrint = (transferId: string) => {
    const url = `/api/cold/receipt/html?id=${transferId}&type=transfer`;
    window.open(url, '_blank');
  };

  return (
    <div className="rounded-md border bg-white shadow-sm overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead className="font-semibold">{t('inward.dateHeader') || 'Date'}</TableHead>
            <TableHead className="font-semibold">From Client</TableHead>
            <TableHead className="font-semibold">To Client</TableHead>
            <TableHead className="font-semibold">{t('inward.commodityHeader') || 'Commodity'}</TableHead>
            <TableHead className="font-semibold">{t('inward.warehouseHeader') || 'Warehouse'}</TableHead>
            <TableHead className="text-right font-semibold">{t('inward.quantityHeader') || 'Net Weight (kg)'}</TableHead>
            <TableHead className="text-right font-semibold">{t('inward.bagsHeader') || 'Bags'}</TableHead>
            <TableHead className="text-right font-semibold">{t('inward.actions') || 'Actions'}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transfers.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center py-8 text-slate-500">
                No ownership transfers found
              </TableCell>
            </TableRow>
          ) : (
            transfers.map((transfer: any, i: number) => {
              return (
                <TableRow key={transfer._id || i} className="hover:bg-slate-50/50">
                  <TableCell>
                    {transfer.date ? format(new Date(transfer.date), 'dd MMM yyyy') : '-'}
                  </TableCell>
                  <TableCell className="font-medium text-red-600">
                    {transfer.fromClientId?.name || '-'}
                  </TableCell>
                  <TableCell className="font-medium text-emerald-600">
                    {transfer.toClientId?.name || '-'}
                  </TableCell>
                  <TableCell>
                    {transfer.commodityId ? `${transfer.commodityId.name} (${transfer.commodityId.type})` : '-'}
                  </TableCell>
                  <TableCell>
                    {transfer.warehouseId?.name || '-'}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatNumber(transfer.quantityKg)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNumber(transfer.bagsCount)}
                  </TableCell>
                  <TableCell className="text-right">
                    <button
                      onClick={() => handlePrint(transfer._id)}
                      className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                      title="Print Transfer Receipt"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
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
