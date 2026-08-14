import { notFound } from 'next/navigation';
import { CalendarIcon, MapPinIcon, PackageIcon, ScaleIcon, FileTextIcon, InfoIcon } from 'lucide-react';
import connectToDatabase from '@/lib/mongoose';
import ColdInward from '@/lib/models/ColdInward';
import ColdOutward from '@/lib/models/ColdOutward';
import ColdTransfer from '@/lib/models/ColdTransfer';
import mongoose from 'mongoose';
import '@/lib/models/Client';
import '@/lib/models/ColdCommodity';
import '@/lib/models/ColdWarehouse';

function isSameStack(a: any, b: any): boolean {
  if (!a || !b) return false;
  const cA = a.chamberNo ?? a.chamberName;
  const cB = b.chamberNo ?? b.chamberName;
  if (cA !== undefined && cA !== null && cB !== undefined && cB !== null) {
    if (String(cA).replace(/^Chamber\s+/i, '').trim() !== String(cB).replace(/^Chamber\s+/i, '').trim()) return false;
  }
  const fA = a.floorNo ?? a.floorName;
  const fB = b.floorNo ?? b.floorName;
  if (fA !== undefined && fA !== null && fB !== undefined && fB !== null) {
    if (String(fA).trim() !== String(fB).trim()) return false;
  }
  const sA = a.stackNo ?? a.stackName;
  const sB = b.stackNo ?? b.stackName;
  if (sA !== undefined && sA !== null && sB !== undefined && sB !== null) {
    if (String(sA).trim() !== String(sB).trim()) return false;
  } else {
    return false;
  }
  return true;
}

export default async function PublicInwardQRDetailsPage({ params }: { params: Promise<{ qrId: string }> }) {
  const resolvedParams = await params;
  
  await connectToDatabase();

  let inward = await ColdInward.findOne({ qrId: resolvedParams.qrId })
    .populate('clientId', 'name')
    .populate('commodityId', 'name type')
    .populate('warehouseId', 'name warehouseId')
    .lean() as any;

  if (!inward && mongoose.Types.ObjectId.isValid(resolvedParams.qrId)) {
    inward = await ColdInward.findOne({ _id: resolvedParams.qrId })
      .populate('clientId', 'name')
      .populate('commodityId', 'name type')
      .populate('warehouseId', 'name warehouseId')
      .lean() as any;
  }
  
  if (!inward) {
    return notFound();
  }

  // Fetch outwards and transfers for calculation
  await connectToDatabase();
  const outwards = await ColdOutward.find({ inwardId: inward._id }).lean();
  const transfersForOwnership = await ColdTransfer.find({ originalInwardId: inward._id }).lean();
  
  const inwardQuantity = inward.quantityKg || 0;
  
  const regularOutwards = outwards.filter((o: any) => o.remarks !== 'Ownership Transfer Out' && o.remarks !== 'Ownership Transfer Purchase');
  
  const actualOutwardKg = regularOutwards.reduce((sum: number, out: any) => sum + (out.quantityKg || 0), 0);
  const ownershipTransferKg = transfersForOwnership.reduce((sum: number, t: any) => sum + (t.quantityKg || 0), 0);
  
  const currentBalance = Math.max(0, inwardQuantity - actualOutwardKg - ownershipTransferKg);

  const computedStackAllocations = (inward.stackAllocations || []).reduce((acc: any[], alloc: any) => {
    const key = `${alloc.chamberName || alloc.chamberNo}-${alloc.floorName || alloc.floorNo}-${alloc.stackName || alloc.stackNo}`;
    if (!acc.some(a => `${a.chamberName || a.chamberNo}-${a.floorName || a.floorNo}-${a.stackName || a.stackNo}` === key)) {
      let outwardedWeight = 0;
      let transferredWeight = 0;

      regularOutwards.forEach((out: any) => {
        if (isSameStack(out, alloc)) {
          outwardedWeight += (Number(out.quantityKg) || 0);
        }
      });

      transfersForOwnership.forEach((t: any) => {
        (t.stackAllocations || []).forEach((s: any) => {
          if (isSameStack(s, alloc)) {
            transferredWeight += (Number(s.allocatedWeight) || 0);
          }
        });
      });

      const originalWeight = Number(alloc.allocatedWeight) || 0;
      const remainingWeight = Math.max(0, originalWeight - outwardedWeight - transferredWeight);

      acc.push({
        ...alloc,
        remainingWeight,
        transferredWeight,
        outwardedWeight
      });
    }
    return acc;
  }, []);

  // Fetch transfers to determine current owners
  const transfers = await ColdTransfer.find({ originalInwardId: inward._id }).populate('toClientId', 'name').lean();
  let currentOwners: string[] = [];
  if (currentBalance > 0 && inward.clientId?.name) {
    currentOwners.push(inward.clientId.name);
  }
  transfers.forEach((t: any) => {
    if (t.toClientId?.name && !currentOwners.includes(t.toClientId.name)) {
      currentOwners.push(t.toClientId.name);
    }
  });
  if (currentOwners.length === 0) {
    currentOwners.push(inward.clientId?.name || '-');
  }
  const currentOwnerDisplay = currentOwners.join(', ');

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
              <span className="text-slate-500 text-xs font-bold uppercase tracking-wider block">Original Client</span>
              <span className="font-semibold text-slate-800">{inward.clientId?.name || '-'}</span>
            </div>
            <div>
              <span className="text-slate-500 text-xs font-bold uppercase tracking-wider block">Current Owner(s)</span>
              <span className="font-semibold text-indigo-700">{currentOwnerDisplay}</span>
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
            {computedStackAllocations && computedStackAllocations.length > 0 ? (
              computedStackAllocations.map((alloc: any, i: number) => (
                <div key={i} className="col-span-2 flex flex-col gap-2 p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="grid grid-cols-3 gap-2">
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
                  <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-slate-200">
                    <div>
                      <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">Remaining Stock</span>
                      <span className="font-bold text-indigo-700">{alloc.remainingWeight} {inward.unit || 'Kg'}</span>
                    </div>
                    {alloc.transferredWeight > 0 && (
                      <div>
                        <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">Ownership Transfer</span>
                        <span className="font-bold text-blue-600">{alloc.transferredWeight} {inward.unit || 'Kg'}</span>
                      </div>
                    )}
                    {alloc.outwardedWeight > 0 && (
                      <div>
                        <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">Outwarded</span>
                        <span className="font-bold text-rose-600">{alloc.outwardedWeight} {inward.unit || 'Kg'}</span>
                      </div>
                    )}
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
              <span className="font-bold text-rose-600">{actualOutwardKg > 0 ? `${actualOutwardKg} ${inward.unit || 'Kg'}` : '-'}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
              <span className="text-slate-600 font-medium">Ownership Transfer</span>
              <span className="font-bold text-blue-600">{ownershipTransferKg > 0 ? `${ownershipTransferKg} ${inward.unit || 'Kg'}` : '-'}</span>
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
