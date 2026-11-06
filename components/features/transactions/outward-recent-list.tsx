'use client';

import React, { useState, useEffect } from 'react';
import { getRecentDryOutwards } from '@/app/actions/dry-storage-receipt-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Printer, Download, Search, RefreshCw, FileText, ShieldCheck, Truck, ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function OutwardRecentList({ refreshTrigger }: { refreshTrigger?: number }) {
  const [outwards, setOutwards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const fetchList = async () => {
    try {
      setLoading(true);
      const data = await getRecentDryOutwards(30);
      setOutwards(data);
    } catch (err: any) {
      console.error('Failed to load recent outwards:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
  }, [refreshTrigger]);

  const filteredOutwards = outwards.filter((item) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const clientName = item.clientId?.name?.toLowerCase() || '';
    const commodityName = item.commodityId?.name?.toLowerCase() || '';
    const whName = item.warehouseId?.name?.toLowerCase() || '';
    const gp = (item.gatePass || item.gatePassNo || '').toLowerCase();
    const sr = (item.dailyReportSrNo || '').toLowerCase();
    const truck = (item.vehicleNumber || '').toLowerCase();
    return (
      clientName.includes(term) ||
      commodityName.includes(term) ||
      whName.includes(term) ||
      gp.includes(term) ||
      sr.includes(term) ||
      truck.includes(term)
    );
  });

  const handlePrint = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleDownloadPDF = async (url: string, filename: string, id: string) => {
    try {
      setDownloadingId(id);
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch receipt HTML');
      const htmlText = await res.text();

      const container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.left = '-9999px';
      container.style.top = '0';
      container.style.width = '210mm';
      container.innerHTML = htmlText;

      const sheet = container.querySelector('.sheet') || container.querySelector('body') || container;
      const toolbar = sheet.querySelector('.toolbar');
      if (toolbar) toolbar.remove();

      document.body.appendChild(container);

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
      toast.success(`${filename} downloaded`);
    } catch (err: any) {
      console.error('Download PDF error:', err);
      window.open(url, '_blank');
      toast('Opened receipt in new tab for printing', { icon: 'ℹ️' });
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50">
        <div>
          <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-orange-600" />
            Recent Outward Transactions &amp; Receipts
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Quickly preview, print, or download Daily Truck Reports and Gate Passes.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              type="text"
              placeholder="Search receipts..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9 text-xs bg-white"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={fetchList}
            disabled={loading}
            className="h-9 px-3 text-slate-600"
            title="Refresh List"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-100/70 text-slate-600 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-200">
            <tr>
              <th className="py-3 px-4">Date</th>
              <th className="py-3 px-4">Warehouse</th>
              <th className="py-3 px-4">Client</th>
              <th className="py-3 px-4">Commodity</th>
              <th className="py-3 px-4">Bags / Weight</th>
              <th className="py-3 px-4">Daily Report</th>
              <th className="py-3 px-4">Gate Pass</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {loading ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-400">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-orange-600" />
                  Loading outward transactions...
                </td>
              </tr>
            ) : filteredOutwards.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-10 text-center text-slate-400">
                  {searchTerm ? 'No outward records matching your search.' : 'No outward transactions found.'}
                </td>
              </tr>
            ) : (
              filteredOutwards.map((item) => {
                const dateStr = item.date ? new Date(item.date).toLocaleDateString('en-IN') : '—';
                const dailyReportSr = item.dailyReportSrNo || '001';
                const gatePassNo = item.gatePass || item.gatePassNo || '001';
                const dailyReportUrl = `/api/dry-storage/receipts/daily-report?id=${item._id}&type=outward`;
                const gatePassUrl = `/api/dry-storage/receipts/gate-pass?id=${item._id}&type=outward`;

                return (
                  <tr key={item._id.toString()} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-medium whitespace-nowrap text-slate-900">
                      {dateStr}
                    </td>
                    <td className="py-3 px-4 font-medium max-w-[180px] truncate" title={item.warehouseId?.name}>
                      {item.warehouseId?.name || '—'}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900 max-w-[180px] truncate" title={item.clientId?.name}>
                      {item.clientId?.name || '—'}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-orange-700 bg-orange-50 px-2 py-0.5 rounded border border-orange-200">
                        {item.commodityId?.name || '—'}
                      </span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap font-medium">
                      <span>{item.bagsCount ?? '—'} Bags</span>
                      <span className="text-slate-400 mx-1">/</span>
                      <span>{item.quantityMT} MT</span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-300">
                        Sr. {dailyReportSr}
                      </span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-300">
                        No. {gatePassNo}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Daily Report Buttons */}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-orange-700 hover:text-orange-800 hover:bg-orange-50"
                          title="Print Daily Truck Report"
                          onClick={() => handlePrint(dailyReportUrl)}
                        >
                          <Truck className="h-3.5 w-3.5 mr-1" />
                          <Printer className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-orange-700 hover:text-orange-800 hover:bg-orange-50"
                          title="Download Daily Truck Report PDF"
                          disabled={downloadingId === `dr-${item._id}`}
                          onClick={() => handleDownloadPDF(dailyReportUrl, `Daily_Truck_Report_Outward_${dailyReportSr}.pdf`, `dr-${item._id}`)}
                        >
                          {downloadingId === `dr-${item._id}` ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="h-3.5 w-3.5" />
                          )}
                        </Button>

                        <span className="text-slate-300">|</span>

                        {/* Gate Pass Buttons */}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-slate-700 hover:text-slate-900 hover:bg-slate-100"
                          title="Print Gate Pass"
                          onClick={() => handlePrint(gatePassUrl)}
                        >
                          <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                          <Printer className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-slate-700 hover:text-slate-900 hover:bg-slate-100"
                          title="Download Gate Pass PDF"
                          disabled={downloadingId === `gp-${item._id}`}
                          onClick={() => handleDownloadPDF(gatePassUrl, `Gate_Pass_Outward_${gatePassNo}.pdf`, `gp-${item._id}`)}
                        >
                          {downloadingId === `gp-${item._id}` ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="h-3.5 w-3.5" />
                          )}
                        </Button>

                        {/* Open tab */}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-slate-400 hover:text-slate-700"
                          title="Open Both"
                          onClick={() => {
                            window.open(dailyReportUrl, '_blank');
                            window.open(gatePassUrl, '_blank');
                          }}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

