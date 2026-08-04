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
import { Printer, Download, QrCode, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useColdTranslation } from '@/components/providers/cold-language-provider';
import QrCodeModal from "./qr-code-modal";
import { ensureInwardQrId } from "@/app/actions/cold-inward-actions";
import { toast } from "react-hot-toast";
import { useState } from "react";

interface ColdInwardListProps {
  inwards: any[];
}

export default function ColdInwardList({ inwards }: ColdInwardListProps) {
  const { t, formatNumber } = useColdTranslation();

  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [selectedInward, setSelectedInward] = useState<any | null>(null);
  const [selectedQrId, setSelectedQrId] = useState<string | null>(null);
  const [generatingQrId, setGeneratingQrId] = useState<string | null>(null);

  const groupedInwards = inwards;

  const exportCsv = () => {
    const headers = [
      t('inward.dateHeader') || 'Date',
      t('inward.clientNameHeader') || 'Client Name',
      'Farmer Name',
      t('inward.commodityHeader') || 'Commodity',
      t('inward.warehouseHeader') || 'Warehouse',
      t('inward.chamberHeader') || 'Chamber',
      t('inward.floorHeader') || 'Floor',
      t('inward.stackHeader') || 'Stack',
      'Grade',
      t('inward.quantityHeader') || 'Net Weight (kg)',
      t('inward.bagsHeader') || 'Bags'
    ];
    
    const rows = groupedInwards.map(w => {
      const date = w.date ? format(new Date(w.date), 'dd MMM yyyy') : '-';
      const client = w.clientId?.name || '-';
      const farmer = w.farmerName || '-';
      const commodity = w.commodityId ? `${w.commodityId.name} (${w.commodityId.type})` : 'Unknown';
      const warehouse = w.warehouseId?.name || '-';
      const chamber = w.stackAllocations?.map((s: any) => String(s.chamberName || s.chamberNo).replace(/^Chamber\s+/i, '')).join('; ') || String(w.chamberName || w.chamberNo).replace(/^Chamber\s+/i, '');
      const floor = w.stackAllocations?.map((s: any) => s.floorNo).join('; ') || w.floorNo || '-';
      const stack = w.stackAllocations?.map((s: any) => s.stackNo).join('; ') || w.stackNo || '-';
      const grade = w.gradingType || '-';
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
    link.download = `Inward_Export_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
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
        <Button onClick={exportCsv} variant="outline" size="sm">
          <Download className="mr-2 h-4 w-4" /> Export CSV
        </Button>
      </div>
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
                    {w.stackAllocations?.map((s: any, i: number) => <div key={i}>{String(s.chamberName || formatNumber(s.chamberNo)).replace(/^Chamber\s+/i, '')}</div>) || String(w.chamberName || formatNumber(w.chamberNo)).replace(/^Chamber\s+/i, '')}
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
                  <TableCell className="text-right font-medium text-slate-900">{formatNumber(w.quantityKg)} {w.unit || w.commodityId?.unit || 'KG'}</TableCell>
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
      <QrCodeModal 
        isOpen={qrModalOpen} 
        onClose={() => setQrModalOpen(false)} 
        inwardData={selectedInward} 
        qrId={selectedQrId} 
      />
    </div>
  );
}
