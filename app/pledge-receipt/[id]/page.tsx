import { notFound } from 'next/navigation';
import { getTenantFilterForMongo, requireSession } from '@/lib/ownership';
import mongoose from 'mongoose';
import Pledge from '@/lib/models/Pledge';
import Warehouse from '@/lib/models/Warehouse';
import ColdWarehouse from '@/lib/models/ColdWarehouse';
import connectToDatabase from '@/lib/mongoose';
import { Printer } from 'lucide-react';
import PrintButton from './print-button';

export const metadata = {
  title: 'Pledge Receipt | ERP',
};

export default async function PledgeReceiptPage(props: { 
  params: Promise<{ id: string }>,
  searchParams: Promise<{ receiptIdx?: string }>
}) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const { id } = params;
  const receiptIdx = parseInt(searchParams.receiptIdx || '0', 10);

  await connectToDatabase();
  const session = await requireSession();

  const pledge = await Pledge.findOne({ 
    _id: new mongoose.Types.ObjectId(id), 
    ...getTenantFilterForMongo(session) 
  }).lean();

  if (!pledge) return notFound();

  const release = pledge.releaseHistory?.[receiptIdx];
  
  if (!release || !release.receiptNo) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] p-8">
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Receipt Not Found</h2>
        <p className="text-slate-500">This release record might be from a legacy transaction before receipts were generated.</p>
      </div>
    );
  }

  // Handle legacy ObjectIds in the warehouseIdentifier field
  const processedItems = await Promise.all(
    release.items.map(async (item: any) => {
      let displayId = item.warehouseIdentifier;
      
      if (displayId && /^[a-fA-F0-9]{24}$/.test(displayId)) {
        try {
          const dryWh: any = await Warehouse.findById(displayId).select('warehouseId code').lean();
          if (dryWh && (dryWh.warehouseId || dryWh.code)) {
            displayId = dryWh.warehouseId || dryWh.code;
          } else {
            const coldWh: any = await ColdWarehouse.findById(displayId).select('warehouseId code').lean();
            if (coldWh && (coldWh.warehouseId || coldWh.code)) {
              displayId = coldWh.warehouseId || coldWh.code;
            } else {
              displayId = 'N/A';
            }
          }
        } catch (e) {
          displayId = 'N/A';
        }
      }
      return { ...item, warehouseIdentifier: displayId || 'N/A' };
    })
  );

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          body { background: white !important; }
        }
      `}} />
      <div className="bg-slate-50 min-h-screen p-4 md:p-8 flex flex-col items-center">
        <div className="w-full max-w-5xl flex justify-end mb-4 print:hidden">
          <PrintButton />
        </div>

        <div id="printable-receipt" className="bg-white w-full max-w-5xl shadow-md border rounded-sm p-8 print:shadow-none print:border-none print:p-0 print:max-w-none print:w-full">
        {/* Header */}
        <div className="mb-8 border-b pb-6">
          {session?.user?.companyName && (
            <div className="text-center mb-8">
              <h1 className="text-3xl md:text-4xl font-black text-slate-900 uppercase tracking-wide">{session.user.companyName}</h1>
            </div>
          )}
          <div className="flex flex-col md:flex-row justify-between items-end gap-4">
            <div>
              <h2 className="text-2xl font-bold uppercase tracking-wider text-slate-800">Release Order</h2>
            </div>
            <div className="text-left md:text-right">
              <p className="text-slate-600 font-medium text-sm md:text-base">Receipt No: <span className="font-semibold text-slate-900">{release.receiptNo}</span></p>
              <p className="text-slate-600 font-medium text-sm md:text-base">Date: <span className="font-semibold text-slate-900">{new Date(release.releaseDate).toLocaleDateString()}</span></p>
            </div>
          </div>
        </div>

        {/* Borrower Details */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8 bg-slate-50 p-4 rounded-md print:bg-white print:border print:grid-cols-4 print:text-sm">
          <div>
            <p className="text-sm text-slate-500 font-medium">Borrower Name</p>
            <p className="font-semibold text-slate-900">{release.clientName}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Location</p>
            <p className="font-semibold text-slate-900">{release.clientLocation}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Borrower ID</p>
            <p className="font-semibold text-slate-900">{release.clientIdString}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Pledge / Loan Ref</p>
            <p className="font-semibold text-slate-900">{pledge.pledgeNo}</p>
          </div>
        </div>

        {/* Items Table */}
        <div className="mb-8 overflow-x-auto print:overflow-visible">
          <table className="w-full text-sm text-left border-collapse border border-slate-200 print:text-[10px]">
            <thead className="bg-slate-100 text-slate-700 print:bg-slate-50">
              <tr>
                <th className="border border-slate-200 px-4 py-3 print:px-1 print:py-1">Warehouse Name</th>
                <th className="border border-slate-200 px-4 py-3 print:px-1 print:py-1">Warehouse ID</th>
                <th className="border border-slate-200 px-4 py-3 print:px-1 print:py-1">Address</th>
                <th className="border border-slate-200 px-4 py-3 print:px-1 print:py-1">Commodity</th>
                <th className="border border-slate-200 px-4 py-3 text-right print:px-1 print:py-1">Total Net Wt. (MT)</th>
                <th className="border border-slate-200 px-4 py-3 text-right print:px-1 print:py-1">Prev. Released (MT)</th>
                <th className="border border-slate-200 px-4 py-3 text-right print:px-1 print:py-1">Curr. Released (MT)</th>
                <th className="border border-slate-200 px-4 py-3 text-right print:px-1 print:py-1">Balance Net Wt. (MT)</th>
              </tr>
            </thead>
            <tbody>
              {processedItems.map((item: any, idx: number) => (
                <tr key={idx} className="hover:bg-slate-50 print:hover:bg-transparent">
                  <td className="border border-slate-200 px-4 py-3 font-medium text-slate-900 print:px-1 print:py-1">{item.warehouseName}</td>
                  <td className="border border-slate-200 px-4 py-3 text-slate-600 print:px-1 print:py-1">{item.warehouseIdentifier}</td>
                  <td className="border border-slate-200 px-4 py-3 text-slate-600 print:px-1 print:py-1">{item.warehouseAddress}</td>
                  <td className="border border-slate-200 px-4 py-3 font-medium text-slate-800 print:px-1 print:py-1">{item.commodityName}</td>
                  <td className="border border-slate-200 px-4 py-3 text-right text-slate-900 font-medium print:px-1 print:py-1">{item.totalNetWtMT?.toFixed(3) || '0.000'}</td>
                  <td className="border border-slate-200 px-4 py-3 text-right text-slate-600 print:px-1 print:py-1">{item.previousReleasedMT?.toFixed(3) || '0.000'}</td>
                  <td className="border border-slate-200 px-4 py-3 text-right font-semibold text-indigo-700 print:px-1 print:py-1">{item.currentReleasedMT?.toFixed(3) || '0.000'}</td>
                  <td className="border border-slate-200 px-4 py-3 text-right font-bold text-slate-900 print:px-1 print:py-1">{item.balanceNetWtMT?.toFixed(3) || '0.000'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer Remarks */}
        <div className="mb-12">
          <p className="text-sm text-slate-500 font-medium mb-1">Remarks</p>
          <p className="text-sm text-slate-800 p-3 bg-slate-50 border rounded-md print:bg-white min-h-[60px]">
            {release.remarks || 'No remarks provided.'}
          </p>
        </div>

        {/* Signatures */}
        <div className="flex justify-between items-end pt-12 border-t mt-16 px-8">
          <div className="text-center">
            <div className="border-b border-slate-400 w-48 mb-2"></div>
            <p className="text-sm text-slate-600 font-medium">Authorized Signatory</p>
          </div>
          <div className="text-center">
            <div className="border-b border-slate-400 w-48 mb-2"></div>
            <p className="text-sm text-slate-600 font-medium">Receiver's Signature</p>
          </div>
        </div>
      </div>
      </div>
    </>
  );
}
