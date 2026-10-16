import React from 'react';
import type { TransactionRecord } from './transactions-report';
import { QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface StorageReceiptPrintableProps {
  transaction: TransactionRecord;
  baseUrl?: string;
  wspName?: string;
}

export const StorageReceiptPrintable = React.forwardRef<HTMLDivElement, StorageReceiptPrintableProps>(
  ({ transaction, baseUrl = '', wspName = '' }, ref) => {
    return (
      <div ref={ref} className="bg-white text-black p-8 w-[210mm] min-h-[297mm] mx-auto font-sans relative">
        {/* Outer Border */}
        <div className="absolute inset-0 m-4 border-2 border-slate-800 pointer-events-none"></div>
        <div className="absolute inset-0 m-[18px] border border-slate-300 pointer-events-none"></div>

        <div className="relative z-10 p-6 h-full flex flex-col">
          {/* Header */}
          <div className="flex justify-between items-start mb-8 border-b-2 border-slate-900 pb-6">
            <div className="flex-1">
              <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase mb-1">
                {wspName || transaction.warehouseName}
              </h2>
              <p className="text-slate-600 text-sm font-semibold tracking-widest uppercase">
                {wspName ? `${transaction.warehouseName} - Warehouse & Logistics` : 'Warehouse & Logistics'}
              </p>
            </div>
            
            <div className="text-right flex-1 flex flex-col items-end">
              <h1 className="text-2xl font-bold text-slate-800 tracking-widest uppercase bg-slate-100 px-4 py-1 border border-slate-300 inline-block mb-3 shadow-sm">
                Storage Receipt
              </h1>
              <div className="flex items-center gap-3 text-sm">
                <div className="p-1 bg-white border border-slate-300">
                  <QRCodeSVG 
                    value={`${baseUrl}/qr/receipt/${transaction._id}`} 
                    size={48} 
                    level="Q" 
                  />
                </div>
                <div className="text-right">
                  <p className="text-slate-500 font-medium text-xs uppercase tracking-wider">Receipt No.</p>
                  <p className="font-bold text-slate-900 text-lg tracking-tight">{transaction.receiptNumber || 'N/A'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Core Info Boxes */}
          <div className="grid grid-cols-2 gap-6 mb-8">
            {/* Depositor Info */}
            <div className="border border-slate-300 rounded-sm overflow-hidden">
              <div className="bg-slate-100 border-b border-slate-300 px-4 py-2">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-widest">Depositor Details</h3>
              </div>
              <div className="p-4 space-y-3 bg-white">
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Client Name</p>
                  <p className="font-bold text-slate-900 text-base leading-tight">{transaction.clientName}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Client ID</p>
                  <p className="font-semibold text-slate-700 text-sm leading-tight">{transaction.clientIdentifier || transaction.clientId}</p>
                </div>
              </div>
            </div>

            {/* Inward Info */}
            <div className="border border-slate-300 rounded-sm overflow-hidden">
              <div className="bg-slate-100 border-b border-slate-300 px-4 py-2">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-widest">Transaction Details</h3>
              </div>
              <div className="p-4 bg-white grid grid-cols-2 gap-y-3 gap-x-4">
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Date of Deposit</p>
                  <p className="font-bold text-slate-900 text-sm">{transaction.date ? new Date(transaction.date).toLocaleDateString('en-IN') : 'N/A'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Time</p>
                  <p className="font-bold text-slate-900 text-sm">{transaction.createdAt ? new Date(transaction.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'N/A'}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Transaction Type</p>
                  <p className="font-bold text-slate-700 text-sm">DRY STORAGE INWARD</p>
                </div>
              </div>
            </div>
          </div>

          {/* Deposit Particulars (Table) */}
          <div className="mb-8">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest mb-3 flex items-center">
              <span className="bg-slate-900 w-1.5 h-4 mr-2 block"></span>
              Deposit Particulars
            </h3>
            <table className="w-full border-collapse border border-slate-300 text-sm">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-300 px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase tracking-wider w-1/3">Commodity</th>
                  <th className="border border-slate-300 px-4 py-3 text-right text-xs font-bold text-slate-700 uppercase tracking-wider">Quantity (MT)</th>
                  <th className="border border-slate-300 px-4 py-3 text-right text-xs font-bold text-slate-700 uppercase tracking-wider">Bags</th>
                  <th className="border border-slate-300 px-4 py-3 text-center text-xs font-bold text-slate-700 uppercase tracking-wider">Stack No.</th>
                  <th className="border border-slate-300 px-4 py-3 text-center text-xs font-bold text-slate-700 uppercase tracking-wider">Lot No.</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-slate-300 px-4 py-4 font-bold text-slate-900">{transaction.commodityName}</td>
                  <td className="border border-slate-300 px-4 py-4 text-right font-black text-slate-900 text-base bg-slate-50">{transaction.quantityMT?.toFixed(4)}</td>
                  <td className="border border-slate-300 px-4 py-4 text-right font-semibold text-slate-800">{transaction.bagsCount || 'N/A'}</td>
                  <td className="border border-slate-300 px-4 py-4 text-center font-medium text-slate-700">{transaction.stackNo || '—'}</td>
                  <td className="border border-slate-300 px-4 py-4 text-center font-medium text-slate-700">{transaction.lotNo || '—'}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Transportation */}
          <div className="mb-8">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest mb-3 flex items-center">
              <span className="bg-slate-900 w-1.5 h-4 mr-2 block"></span>
              Logistics
            </h3>
            <div className="border border-slate-300 rounded-sm bg-white p-4">
              <div className="grid grid-cols-3 gap-6 divide-x divide-slate-200">
                <div className="px-2">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Vehicle Number</p>
                  <p className="font-bold text-slate-800 text-sm">{transaction.vehicleNumber || '—'}</p>
                </div>
                <div className="px-4">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Transporter / Agency</p>
                  <p className="font-semibold text-slate-700 text-sm">{transaction.transportationName || '—'}</p>
                </div>
                <div className="px-4">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Driver Details</p>
                  <p className="font-semibold text-slate-700 text-sm">{transaction.driverName || '—'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="mb-auto">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest mb-3 flex items-center">
              <span className="bg-slate-900 w-1.5 h-4 mr-2 block"></span>
              Notes
            </h3>
            <div className="border border-slate-300 rounded-sm bg-slate-50 p-4 min-h-[60px]">
              <p className="text-sm text-slate-700 italic whitespace-pre-wrap">{transaction.notes || transaction.note || ''}</p>
            </div>
          </div>

          {/* Signatures */}
          <div className="mt-12 pt-8">
            <div className="grid grid-cols-2 gap-12">
              <div className="text-center">
                <div className="h-20 border border-slate-200 bg-slate-50 mb-3 rounded-sm flex items-end justify-center pb-2">
                  <span className="text-[10px] text-slate-400 uppercase tracking-widest">(Sign/Seal here)</span>
                </div>
                <p className="text-xs font-bold text-slate-900 uppercase tracking-wider border-t-2 border-slate-900 pt-2 mx-8">
                  Authorized Signatory
                </p>
                <p className="text-[10px] text-slate-500 font-medium mt-1 uppercase">For {transaction.warehouseName}</p>
              </div>
              
              <div className="text-center">
                <div className="h-20 border border-slate-200 bg-white mb-3 rounded-sm flex items-end justify-center pb-2">
                  <span className="text-[10px] text-slate-400 uppercase tracking-widest">(Sign here)</span>
                </div>
                <p className="text-xs font-bold text-slate-900 uppercase tracking-wider border-t-2 border-slate-900 pt-2 mx-8">
                  Depositor / Driver
                </p>
                <p className="text-[10px] text-slate-500 font-medium mt-1 uppercase">{transaction.clientName}</p>
              </div>
            </div>
          </div>
          
        </div>
      </div>
    );
  }
);
StorageReceiptPrintable.displayName = 'StorageReceiptPrintable';
