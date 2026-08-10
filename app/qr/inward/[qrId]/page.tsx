import { getColdInwardByQrId, getColdInwardById } from '@/app/actions/cold-inward-actions';
import { notFound } from 'next/navigation';
import { CalendarIcon, MapPinIcon, PackageIcon, ScaleIcon, FileTextIcon, InfoIcon } from 'lucide-react';
import connectToDatabase from '@/lib/mongoose';
import ColdOutward from '@/lib/models/ColdOutward';

export default async function PublicInwardQRDetailsPage({ params }: { params: Promise<{ qrId: string }> }) {
  const resolvedParams = await params;
  
  // Fetch inward by qrId first, then fallback to _id
  let res = await getColdInwardByQrId(resolvedParams.qrId);
  if (!res.success) {
    res = await getColdInwardById(resolvedParams.qrId);
  }
  
  if (!res.success || !res.data) {
    return notFound();
  }

  const inward = res.data;

  // Fetch outwards for calculation
  await connectToDatabase();
  const outwards = await ColdOutward.find({ inwardId: inward._id }).lean();
  
  const inwardQuantity = inward.quantityKg || 0;
  const totalOutward = outwards.reduce((sum: number, out: any) => sum + (out.quantityKg || 0), 0);
  const currentBalance = Math.max(0, inwardQuantity - totalOutward);

  const displayDate = inward.date ? new Date(inward.date).toLocaleDateString('en-GB') : '-';
  const displayCommodity = inward.commodityId?.name || '-';
  const displayCommodityType = inward.commodityId?.type || '-';

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <h1 className="text-2xl font-bold text-slate-800 flex items-center">
            <FileTextIcon className="w-6 h-6 mr-2 text-indigo-600" />
            Inward Transaction Details
          </h1>
          <span className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-sm font-bold">
            Public View
          </span>
        </div>

        {/* Core Info */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
          <h2 className="text-lg font-bold border-b pb-2 text-slate-800 flex items-center">
            <InfoIcon className="w-5 h-5 mr-2 text-slate-500" /> Information
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-slate-500 text-xs font-bold uppercase tracking-wider block">Client Name</span>
              <span className="font-semibold text-slate-800">{inward.clientId?.name || '-'}</span>
            </div>
            <div>
              <span className="text-slate-500 text-xs font-bold uppercase tracking-wider block">Farmer Name</span>
              <span className="font-semibold text-slate-800">{inward.farmerName || '-'}</span>
            </div>
            <div>
              <span className="text-slate-500 text-xs font-bold uppercase tracking-wider block">Receipt No.</span>
              <span className="font-semibold text-slate-800">
                {inward.receiptNo || inward._id.toString().slice(-4).toUpperCase()}
              </span>
            </div>
            <div>
              <span className="text-slate-500 text-xs font-bold uppercase tracking-wider block">Inward Date</span>
              <span className="font-semibold text-slate-800 flex items-center">
                <CalendarIcon className="w-3 h-3 mr-1 text-slate-400" />
                {displayDate}
              </span>
            </div>
          </div>
        </div>

        {/* Warehouse Info */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
          <h2 className="text-lg font-bold border-b pb-2 text-slate-800 flex items-center">
            <MapPinIcon className="w-5 h-5 mr-2 text-slate-500" /> Location Details
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <span className="text-slate-500 text-xs font-bold uppercase tracking-wider block">Warehouse Name</span>
              <span className="font-semibold text-slate-800">{inward.warehouseId?.name || '-'}</span>
            </div>
            {inward.stackAllocations && inward.stackAllocations.length > 0 ? (
              inward.stackAllocations.map((alloc: any, i: number) => (
                <div key={i} className="col-span-2 grid grid-cols-3 gap-2 p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <div>
                    <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">Chamber</span>
                    <span className="font-medium text-slate-800">{alloc.chamberName || alloc.chamberNo || '-'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">Floor</span>
                    <span className="font-medium text-slate-800">{alloc.floorName || alloc.floorNo || '-'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">Stack</span>
                    <span className="font-medium text-slate-800">{alloc.stackName || alloc.stackNo || '-'}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-2">
                <span className="text-slate-500 text-xs font-bold uppercase tracking-wider block">Allocation</span>
                <span className="font-semibold text-slate-800">-</span>
              </div>
            )}
          </div>
        </div>

        {/* Stock Details */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
          <h2 className="text-lg font-bold border-b pb-2 text-slate-800 flex items-center">
            <PackageIcon className="w-5 h-5 mr-2 text-slate-500" /> Commodity Details
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-slate-500 text-xs font-bold uppercase tracking-wider block">Commodity</span>
              <span className="font-semibold text-slate-800">{displayCommodity}</span>
            </div>
            <div>
              <span className="text-slate-500 text-xs font-bold uppercase tracking-wider block">Commodity Type</span>
              <span className="font-semibold text-slate-800">{displayCommodityType}</span>
            </div>
            <div className="col-span-2">
              <span className="text-slate-500 text-xs font-bold uppercase tracking-wider block">No. of Bags</span>
              <span className="font-semibold text-slate-800">{inward.totalBags || ((inward.bagsCount || 0) + (inward.jin || 0) + (inward.mixed || 0)) || '-'}</span>
            </div>
          </div>
        </div>

        {/* Weight & Quantity */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
          <h2 className="text-lg font-bold border-b pb-2 text-slate-800 flex items-center">
            <ScaleIcon className="w-5 h-5 mr-2 text-slate-500" /> Stock Status
          </h2>
          <div className="grid grid-cols-1 gap-4">
            <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
              <span className="text-slate-600 font-medium">Inward Quantity</span>
              <span className="font-bold text-slate-800">{inwardQuantity} {inward.unit || 'Kg'}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
              <span className="text-slate-600 font-medium">Outward Quantity</span>
              <span className="font-bold text-rose-600">{totalOutward > 0 ? `${totalOutward} ${inward.unit || 'Kg'}` : '-'}</span>
            </div>
            <div className="flex justify-between items-center p-4 bg-indigo-50 border border-indigo-100 rounded-lg">
              <span className="text-indigo-900 font-bold">Remaining Stock</span>
              <span className="font-bold text-indigo-700 text-lg">{currentBalance} {inward.unit || 'Kg'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
