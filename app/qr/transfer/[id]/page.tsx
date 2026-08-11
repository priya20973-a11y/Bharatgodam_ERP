import { notFound } from 'next/navigation';
import { CalendarIcon, MapPinIcon, PackageIcon, ScaleIcon, FileTextIcon, InfoIcon, RefreshCcwIcon } from 'lucide-react';
import connectToDatabase from '@/lib/mongoose';
import ColdTransfer from '@/lib/models/ColdTransfer';
import ColdOutward from '@/lib/models/ColdOutward';
import '@/lib/models/Client';
import '@/lib/models/ColdCommodity';
import '@/lib/models/ColdWarehouse';
import '@/lib/models/ColdInward';

export default async function PublicTransferQRDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  
  await connectToDatabase();
  
  const transfer = await ColdTransfer.findOne({ _id: resolvedParams.id })
    .populate('fromClientId', 'name')
    .populate('toClientId', 'name')
    .populate('originalInwardId', 'farmerName referencePersons unit')
    .populate('commodityId', 'name type')
    .populate('warehouseId', 'name')
    .lean() as any;
    
  if (!transfer) {
    return notFound();
  }

  const netWeight = transfer.quantityKg || 0;
  
  // Calculate outward and remaining weight strictly for the transferred stock
  let totalOutwardKg = 0;
  if (transfer.transferType === 'Purchase') {
    // For Purchase transfers, the stock is physically outwarded immediately
    totalOutwardKg = netWeight;
  } else if (transfer.newInwardId) {
    const newInwardOutwards = await ColdOutward.find({ inwardId: transfer.newInwardId }).lean();
    totalOutwardKg = newInwardOutwards.reduce((sum, out) => sum + (out.quantityKg || 0), 0);
  }
  
  const remainingWeight = Math.max(0, netWeight - totalOutwardKg);
  const bags = transfer.bagsCount || 0;

  const previousOwner = transfer.fromClientId?.name || '-';
  const newOwner = transfer.toClientId?.name || '-';
  const farmerName = transfer.originalInwardId?.farmerName || '-';
  const referencePerson = transfer.originalInwardId?.referencePersons?.[0]?.name || '-';
  const commodityName = transfer.commodityId ? `${transfer.commodityId.name} (${transfer.commodityId.type || '-'})` : '-';
  const unitStr = transfer.originalInwardId?.unit || 'KG';
  
  const warehouse = transfer.warehouseId?.name || '-';
  const chambers = transfer.stackAllocations?.length ? Array.from(new Set(transfer.stackAllocations.map((a: any) => a.chamberName || a.chamberNo))).join(', ') : '-';
  const floors = transfer.stackAllocations?.length ? Array.from(new Set(transfer.stackAllocations.map((a: any) => a.floorNo))).join(', ') : '-';
  const stacks = transfer.stackAllocations?.length ? Array.from(new Set(transfer.stackAllocations.map((a: any) => a.stackNo))).join(', ') : '-';

  const displayDate = transfer.date ? new Date(transfer.date).toLocaleDateString('en-GB') : '-';

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <h1 className="text-2xl font-bold text-slate-800 flex items-center">
            <RefreshCcwIcon className="w-6 h-6 mr-2 text-indigo-600" />
            Ownership Transfer Details
          </h1>
          <span className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-sm font-bold">
            Public View
          </span>
        </div>

        {/* Core Info */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
          <h2 className="text-lg font-bold border-b pb-2 text-slate-800 flex items-center">
            <InfoIcon className="w-5 h-5 mr-2 text-slate-500" /> Transfer Information
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 md:col-span-1">
              <span className="text-slate-500 text-xs font-bold uppercase tracking-wider block">Previous Owner</span>
              <span className="font-semibold text-slate-800">{previousOwner}</span>
            </div>
            <div className="col-span-2 md:col-span-1">
              <span className="text-slate-500 text-xs font-bold uppercase tracking-wider block">New Owner</span>
              <span className="font-semibold text-indigo-700">{newOwner}</span>
            </div>
            <div>
              <span className="text-slate-500 text-xs font-bold uppercase tracking-wider block">Farmer Name</span>
              <span className="font-semibold text-slate-800">{farmerName}</span>
            </div>
            <div>
              <span className="text-slate-500 text-xs font-bold uppercase tracking-wider block">Reference Person</span>
              <span className="font-semibold text-slate-800">{referencePerson}</span>
            </div>
            <div className="col-span-2">
              <span className="text-slate-500 text-xs font-bold uppercase tracking-wider block">Commodity Name (Type)</span>
              <span className="font-semibold text-slate-800">{commodityName}</span>
            </div>
            <div>
              <span className="text-slate-500 text-xs font-bold uppercase tracking-wider block">Transfer Date</span>
              <span className="font-semibold text-slate-800 flex items-center">
                <CalendarIcon className="w-3 h-3 mr-1 text-slate-400" />
                {displayDate}
              </span>
            </div>
          </div>
        </div>

        {/* Location Info */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
          <h2 className="text-lg font-bold border-b pb-2 text-slate-800 flex items-center">
            <MapPinIcon className="w-5 h-5 mr-2 text-slate-500" /> Storage Location
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <span className="text-slate-500 text-xs font-bold uppercase tracking-wider block">Warehouse</span>
              <span className="font-semibold text-slate-800">{warehouse}</span>
            </div>
            <div>
              <span className="text-slate-500 text-xs font-bold uppercase tracking-wider block">Chamber</span>
              <span className="font-semibold text-slate-800">{chambers}</span>
            </div>
            <div>
              <span className="text-slate-500 text-xs font-bold uppercase tracking-wider block">Floor No.</span>
              <span className="font-semibold text-slate-800">{floors}</span>
            </div>
            <div>
              <span className="text-slate-500 text-xs font-bold uppercase tracking-wider block">Stack No.</span>
              <span className="font-semibold text-slate-800">{stacks}</span>
            </div>
          </div>
        </div>

        {/* Weight & Quantity */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
          <h2 className="text-lg font-bold border-b pb-2 text-slate-800 flex items-center">
            <ScaleIcon className="w-5 h-5 mr-2 text-slate-500" /> Quantity Details
          </h2>
          <div className="grid grid-cols-1 gap-4">
            <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
              <span className="text-slate-600 font-medium">Net Weight</span>
              <span className="font-bold text-slate-800">{netWeight} {unitStr}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
              <span className="text-slate-600 font-medium">Bags</span>
              <span className="font-bold text-slate-800">{bags}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
              <span className="text-slate-600 font-medium">Outward Weight</span>
              <span className="font-bold text-rose-600">{totalOutwardKg > 0 ? `${totalOutwardKg} ${unitStr}` : '-'}</span>
            </div>
            <div className="flex justify-between items-center p-4 bg-indigo-50 border border-indigo-100 rounded-lg">
              <span className="text-indigo-900 font-medium">Remaining Weight</span>
              <span className="font-bold text-indigo-700 text-lg">{remainingWeight} {unitStr}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
