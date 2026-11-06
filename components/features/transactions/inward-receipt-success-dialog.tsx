'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle2, FileText, Printer, Download, ExternalLink, Truck, ShieldCheck, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

export interface InwardReceiptDialogData {
  inwardId: string;
  dailyReportSrNo?: string;
  gatePassNo?: string;
  clientName?: string;
  commodityName?: string;
  warehouseName?: string;
  bagsCount?: number;
  quantityMT?: number;
}

interface InwardReceiptSuccessDialogProps {
  isOpen: boolean;
  onClose: () => void;
  data: InwardReceiptDialogData | null;
}

export default function InwardReceiptSuccessDialog({
  isOpen,
  onClose,
  data,
}: InwardReceiptSuccessDialogProps) {
  const [downloadingReport, setDownloadingReport] = useState(false);
  const [downloadingGatePass, setDownloadingGatePass] = useState(false);

  if (!data) return null;

  const dailyReportUrl = `/api/dry-storage/receipts/daily-report?id=${data.inwardId}`;
  const gatePassUrl = `/api/dry-storage/receipts/gate-pass?id=${data.inwardId}`;

  const handlePrint = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleDownloadPDF = async (url: string, filename: string, setLoader: (val: boolean) => void) => {
    try {
      setLoader(true);
      // Fetch the HTML content from the API
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch receipt');
      const htmlText = await res.text();

      // Create a temporary off-screen container
      const container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.left = '-9999px';
      container.style.top = '0';
      container.style.width = '210mm';
      container.innerHTML = htmlText;

      // Extract sheet or body
      const sheet = container.querySelector('.sheet') || container.querySelector('body') || container;
      // Remove toolbar if present
      const toolbar = sheet.querySelector('.toolbar');
      if (toolbar) toolbar.remove();

      document.body.appendChild(container);

      // Load html2pdf dynamically
      const html2pdfModule = await import('html2pdf.js');
      const html2pdf = html2pdfModule.default ?? html2pdfModule;

      const opt = {
        margin: [6, 10, 6, 10],
        filename: filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      };

      await html2pdf().set(opt).from(sheet).save();
      document.body.removeChild(container);
      toast.success(`${filename} downloaded successfully`);
    } catch (err: any) {
      console.error('PDF Download Error:', err);
      // Fallback: open URL in new tab for browser print/save
      window.open(url, '_blank');
      toast('Opened receipt in new tab for printing', { icon: 'ℹ️' });
    } finally {
      setLoader(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl bg-white p-6 sm:rounded-2xl border shadow-2xl">
        <DialogHeader className="text-center pb-2 border-b">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 mb-2">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          </div>
          <DialogTitle className="text-2xl font-black text-slate-900">
            Inward Created Successfully!
          </DialogTitle>
          <DialogDescription className="text-slate-600 text-sm">
            Both official Dry Storage receipts have been automatically generated.
          </DialogDescription>
        </DialogHeader>

        {/* Transaction Summary Badge */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 my-2 text-xs text-slate-700 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <span className="text-slate-400 block font-semibold uppercase text-[10px]">Client</span>
            <span className="font-bold text-slate-900 truncate block">{data.clientName || '—'}</span>
          </div>
          <div>
            <span className="text-slate-400 block font-semibold uppercase text-[10px]">Commodity</span>
            <span className="font-bold text-slate-900 truncate block">{data.commodityName || '—'}</span>
          </div>
          <div>
            <span className="text-slate-400 block font-semibold uppercase text-[10px]">Bags / Weight</span>
            <span className="font-bold text-slate-900 truncate block">
              {data.bagsCount || 0} Bags / {data.quantityMT || 0} MT
            </span>
          </div>
          <div>
            <span className="text-slate-400 block font-semibold uppercase text-[10px]">Warehouse</span>
            <span className="font-bold text-slate-900 truncate block">{data.warehouseName || '—'}</span>
          </div>
        </div>

        {/* The Two Receipts Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-2">
          {/* Card 1: Daily Truck Transaction Report */}
          <div className="border-2 border-indigo-200 hover:border-indigo-400 bg-indigo-50/40 rounded-xl p-4 flex flex-col justify-between transition-all">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-indigo-600 text-white">
                    <Truck className="h-5 w-5" />
                  </div>
                  <h4 className="font-bold text-slate-900 text-sm">Daily Truck Report</h4>
                </div>
                <span className="text-xs font-black bg-indigo-100 text-indigo-800 px-2.5 py-0.5 rounded-full border border-indigo-300">
                  Sr. {data.dailyReportSrNo || '001'}
                </span>
              </div>
              <p className="text-xs text-slate-600 mb-4 leading-relaxed">
                Complete transaction breakdown with commodity, packing, weighbridge, and depositor details.
              </p>
            </div>

            <div className="space-y-2 pt-2 border-t border-indigo-100">
              <Button
                type="button"
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs h-9 shadow-sm"
                onClick={() => handlePrint(dailyReportUrl)}
              >
                <Printer className="w-3.5 h-3.5 mr-1.5" /> Preview &amp; Print
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full border-indigo-300 text-indigo-700 hover:bg-indigo-100 text-xs h-9 font-semibold"
                disabled={downloadingReport}
                onClick={() => handleDownloadPDF(dailyReportUrl, `Daily_Truck_Report_${data.dailyReportSrNo || '001'}.pdf`, setDownloadingReport)}
              >
                {downloadingReport ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1.5" />}
                Download PDF
              </Button>
            </div>
          </div>

          {/* Card 2: Gate Pass */}
          <div className="border-2 border-slate-300 hover:border-slate-400 bg-slate-50/60 rounded-xl p-4 flex flex-col justify-between transition-all">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-slate-900 text-white">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <h4 className="font-bold text-slate-900 text-sm">Gate Pass</h4>
                </div>
                <span className="text-xs font-black bg-slate-200 text-slate-800 px-2.5 py-0.5 rounded-full border border-slate-300">
                  No. {data.gatePassNo || '001'}
                </span>
              </div>
              <p className="text-xs text-slate-600 mb-4 leading-relaxed">
                Security and vehicle gate pass featuring In/Out timings, truck number, and gross/tare weights.
              </p>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-200">
              <Button
                type="button"
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs h-9 shadow-sm"
                onClick={() => handlePrint(gatePassUrl)}
              >
                <Printer className="w-3.5 h-3.5 mr-1.5" /> Preview &amp; Print
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full border-slate-300 text-slate-700 hover:bg-slate-200 text-xs h-9 font-semibold"
                disabled={downloadingGatePass}
                onClick={() => handleDownloadPDF(gatePassUrl, `Gate_Pass_${data.gatePassNo || '001'}.pdf`, setDownloadingGatePass)}
              >
                {downloadingGatePass ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1.5" />}
                Download PDF
              </Button>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col sm:flex-row gap-3 pt-3 border-t">
          <Button
            type="button"
            variant="ghost"
            className="sm:mr-auto text-slate-600 hover:text-slate-900 text-xs"
            onClick={() => {
              window.open(dailyReportUrl, '_blank');
              window.open(gatePassUrl, '_blank');
            }}
          >
            <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Open Both Documents
          </Button>
          <Button
            type="button"
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm px-6"
            onClick={onClose}
          >
            Done &amp; New Inward
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

