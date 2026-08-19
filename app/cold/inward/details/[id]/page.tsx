import { getColdInwardByQrId, getColdInwardById } from '@/app/actions/cold-inward-actions';
import { notFound } from 'next/navigation';
import { CalendarIcon, MapPinIcon, PackageIcon, TruckIcon, UserIcon, ScaleIcon, FileTextIcon, InfoIcon, HistoryIcon } from 'lucide-react';
import connectToDatabase from '@/lib/mongoose';
import ColdOutward from '@/lib/models/ColdOutward';
import ColdTransfer from '@/lib/models/ColdTransfer';
import ColdStockShifting from '@/lib/models/ColdStockShifting';

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
export default async function TransactionDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  
  // Try fetching by qrId first, then by _id
  let res = await getColdInwardByQrId(resolvedParams.id);
  if (!res.success) {
    res = await getColdInwardById(resolvedParams.id);
  }
  
  if (!res.success || !res.data) {
    return notFound();
  }

  const inward = res.data;

  // Fetch Outwards and Transfers
  await connectToDatabase();
  const outwards = await ColdOutward.find({ inwardId: inward._id }).sort({ date: -1, createdAt: -1 }).lean();
  const transfersForOwnership = await ColdTransfer.find({ originalInwardId: inward._id }).lean();
  
  const totalOutward = outwards.reduce((sum: number, out: any) => sum + (out.quantityKg || 0), 0);
  const currentBalance = Math.max(0, (inward.quantityKg || 0) - totalOutward);
  const isFullyOutwarded = totalOutward >= (inward.quantityKg || 0);

  const regularOutwards = outwards.filter((o: any) => o.remarks !== 'Ownership Transfer Out' && o.remarks !== 'Ownership Transfer Purchase');

  const shiftings = await ColdStockShifting.find({ inwardId: inward._id }).lean();
  const cleanStr = (val: any) => String(val || '').toLowerCase().replace(/^(chamber|floor|stack|c|f|s)\s*/i, '').trim();

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
      const cClean = cleanStr(alloc.chamberName || alloc.chamberNo);
      const isShifted = alloc.isStockShifting === true || shiftings.some((sh: any) =>
        (sh.destAllocations || []).some((dest: any) => cleanStr(dest.chamberName || dest.chamberNo) === cClean && dest.floorNo === alloc.floorNo && dest.stackNo === alloc.stackNo)
      );

      acc.push({
        ...alloc,
        remainingWeight,
        transferredWeight,
        outwardedWeight,
        isStockShifting: isShifted,
      });
    }
    return acc;
  }, []);

  const displayDate = inward.date ? new Date(inward.date).toLocaleDateString('en-GB') : 'N/A';
  const displayCommodity = `${inward.commodityId?.name || 'N/A'} ${inward.commodityId?.type ? `(${inward.commodityId.type})` : ''}`;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center">
          <FileTextIcon className="w-6 h-6 mr-2 text-indigo-600" />
          Transaction Details (Read-Only)
        </h1>
        <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-bold ${
          isFullyOutwarded ? 'bg-slate-100 text-slate-700' : 'bg-emerald-100 text-emerald-700'
        }`}>
          {isFullyOutwarded ? 'Completed' : 'Active'}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Core Info */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
          <h2 className="text-lg font-bold border-b pb-2 text-slate-800 flex items-center">
            <InfoIcon className="w-5 h-5 mr-2 text-slate-500" /> Core Information
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-slate-500 text-xs font-bold uppercase tracking-wider block">Receipt No.</span>
              <span className="font-semibold text-slate-800">{inward.receiptNo || 'N/A'}</span>
            </div>
            <div>
              <span className="text-slate-500 text-xs font-bold uppercase tracking-wider block">Inward Date</span>
              <span className="font-semibold text-slate-800 flex items-center">
                <CalendarIcon className="w-3 h-3 mr-1 text-slate-400" />
                {displayDate}
              </span>
            </div>
            <div>
              <span className="text-slate-500 text-xs font-bold uppercase tracking-wider block">Client Name</span>
              <span className="font-semibold text-slate-800">{inward.clientId?.name || 'N/A'}</span>
            </div>
            <div>
              <span className="text-slate-500 text-xs font-bold uppercase tracking-wider block">Farmer Name</span>
              <span className="font-semibold text-slate-800">{inward.farmerName || 'N/A'}</span>
            </div>
            <div className="col-span-2">
              <span className="text-slate-500 text-xs font-bold uppercase tracking-wider block">Reference Person(s)</span>
              <span className="font-medium text-slate-800">
                {inward.referencePersons && inward.referencePersons.length > 0 
                  ? inward.referencePersons.map((rp: any) => rp.name).join(', ') 
                  : 'N/A'}
              </span>
            </div>
          </div>
        </div>

        {/* Stock & Grading */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
          <h2 className="text-lg font-bold border-b pb-2 text-slate-800 flex items-center">
            <PackageIcon className="w-5 h-5 mr-2 text-slate-500" /> Stock Details
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <span className="text-slate-500 text-xs font-bold uppercase tracking-wider block">Commodity (Variety)</span>
              <span className="font-semibold text-slate-800">{displayCommodity}</span>
            </div>
            <div>
              <span className="text-slate-500 text-xs font-bold uppercase tracking-wider block">Stock Type</span>
              <span className="font-semibold text-slate-800">{inward.stockType || 'N/A'}</span>
            </div>
            <div>
              <span className="text-slate-500 text-xs font-bold uppercase tracking-wider block">Grading Details</span>
              <span className="font-semibold text-slate-800">
                {inward.grade ? inward.grade : inward.gradingType && inward.gradingType !== 'Grading' ? inward.gradingType : 'N/A'}
              </span>
            </div>
            <div className="col-span-2">
              <span className="text-slate-500 text-xs font-bold uppercase tracking-wider block">Remark</span>
              <span className="font-medium text-slate-800">{inward.remarks || inward.note || 'N/A'}</span>
            </div>
          </div>
        </div>
        
        {/* Weight & Quantity */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
          <h2 className="text-lg font-bold border-b pb-2 text-slate-800 flex items-center">
            <ScaleIcon className="w-5 h-5 mr-2 text-slate-500" /> Weight & Quantity
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-slate-500 text-xs font-bold uppercase tracking-wider block">Gross Weight</span>
              <span className="font-semibold text-slate-800">{inward.grossWeight || 0} Kg</span>
            </div>
            <div>
              <span className="text-slate-500 text-xs font-bold uppercase tracking-wider block">Empty Weight</span>
              <span className="font-semibold text-slate-800">{inward.emptyWeight || 0} Kg</span>
            </div>
            <div className="pt-2 border-t">
              <span className="text-slate-500 text-xs font-bold uppercase tracking-wider block">Net Quantity</span>
              <span className="font-bold text-blue-700">{inward.quantityKg || 0} {inward.unit || 'Kg'}</span>
            </div>
            <div className="pt-2 border-t">
              <span className="text-slate-500 text-xs font-bold uppercase tracking-wider block">Current Balance</span>
              <span className="font-bold text-emerald-700">{currentBalance} {inward.unit || 'Kg'}</span>
            </div>
            <div className="col-span-2 pt-2 border-t grid grid-cols-4 gap-2">
              <div>
                <span className="text-slate-500 text-xs font-bold uppercase tracking-wider block">L/B</span>
                <span className="font-semibold text-slate-800">{inward.bagsCount || 0}</span>
              </div>
              <div>
                <span className="text-slate-500 text-xs font-bold uppercase tracking-wider block">S/B</span>
                <span className="font-semibold text-slate-800">{inward.jin || 0}</span>
              </div>
              <div>
                <span className="text-slate-500 text-xs font-bold uppercase tracking-wider block">M/B</span>
                <span className="font-semibold text-slate-800">{inward.mixed || 0}</span>
              </div>
              <div>
                <span className="text-slate-500 text-xs font-bold uppercase tracking-wider block">Total</span>
                <span className="font-bold text-slate-900">{inward.totalBags || ((inward.bagsCount || 0) + (inward.jin || 0) + (inward.mixed || 0))}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Transport */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
          <h2 className="text-lg font-bold border-b pb-2 text-slate-800 flex items-center">
            <TruckIcon className="w-5 h-5 mr-2 text-slate-500" /> Transport
          </h2>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <span className="text-slate-500 text-xs font-bold uppercase tracking-wider block">Truck / Tractor No.</span>
              <span className="font-semibold text-slate-800 bg-slate-100 px-3 py-1 rounded inline-block mt-1">{inward.truckNo || 'N/A'}</span>
            </div>
            <div>
              <span className="text-slate-500 text-xs font-bold uppercase tracking-wider block">Weighbridge Slip No.</span>
              <span className="font-semibold text-slate-800">{inward.weighbridgeSlipNo || 'N/A'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Location / Allocations */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h2 className="text-lg font-bold border-b pb-2 mb-4 text-slate-800 flex items-center">
          <MapPinIcon className="w-5 h-5 mr-2 text-indigo-500" /> Location: {inward.warehouseId?.name || 'N/A'}
        </h2>
        
        {inward.stackAllocations && inward.stackAllocations.length > 0 ? (
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-bold uppercase tracking-wider text-xs">Chamber</th>
                  <th className="px-4 py-3 font-bold uppercase tracking-wider text-xs">Floor</th>
                  <th className="px-4 py-3 font-bold uppercase tracking-wider text-xs">Stack</th>
                  <th className="px-4 py-3 font-bold uppercase tracking-wider text-xs text-right">Bags (L/B)</th>
                  <th className="px-4 py-3 font-bold uppercase tracking-wider text-xs text-right">Remaining</th>
                  <th className="px-4 py-3 font-bold uppercase tracking-wider text-xs text-right">Transferred</th>
                  <th className="px-4 py-3 font-bold uppercase tracking-wider text-xs text-right">Outwarded</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {computedStackAllocations.map((alloc: any, i: number) => (
                  <tr key={i} className="bg-white hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium">{alloc.chamberName || alloc.chamberNo}</td>
                    <td className="px-4 py-3 font-medium">{alloc.floorName || alloc.floorNo}</td>
                    <td className="px-4 py-3 font-bold text-indigo-600">
                      {alloc.stackName || alloc.stackNo}
                      {alloc.isStockShifting && (
                        <span className="ml-2 text-amber-800 bg-amber-100 text-[10px] px-1.5 py-0.5 rounded font-bold">
                          (Stock Shifting)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-right">{alloc.bagsCount || 0}</td>
                    <td className="px-4 py-3 font-bold text-right text-indigo-700">{alloc.remainingWeight} {inward.unit || 'Kg'}</td>
                    <td className="px-4 py-3 font-bold text-right text-blue-600">{alloc.transferredWeight > 0 ? `${alloc.transferredWeight} ${inward.unit || 'Kg'}` : '-'}</td>
                    <td className="px-4 py-3 font-bold text-right text-rose-600">{alloc.outwardedWeight > 0 ? `${alloc.outwardedWeight} ${inward.unit || 'Kg'}` : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-6 text-slate-500 bg-slate-50 rounded-lg border border-dashed">No stack allocations found.</div>
        )}
      </div>

      {/* Outward History */}
      {outwards.length > 0 && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-bold border-b pb-2 mb-4 text-slate-800 flex items-center">
            <HistoryIcon className="w-5 h-5 mr-2 text-rose-500" /> Outward History
          </h2>
          
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-bold uppercase tracking-wider text-xs">Date</th>
                  <th className="px-4 py-3 font-bold uppercase tracking-wider text-xs">Receipt No.</th>
                  <th className="px-4 py-3 font-bold uppercase tracking-wider text-xs text-right">Outward Qty</th>
                  <th className="px-4 py-3 font-bold uppercase tracking-wider text-xs text-right">Remaining Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {outwards.map((out: any, i: number) => {
                  // Calculate historical remaining balance for this row
                  // Since we are mapping over backwards-sorted outwards (newest first), 
                  // we can calculate the balance at that moment by summing older outwards.
                  // Wait, simpler way: we'll just show the quantity for the outward row. 
                  // Recalculating exact historical balance per row requires reversing the array or taking slice.
                  const pastOutwards = outwards.slice(i, outwards.length);
                  const historicalOutwardTotal = pastOutwards.reduce((sum: number, o: any) => sum + (o.quantityKg || 0), 0);
                  const balanceAtTime = Math.max(0, (inward.quantityKg || 0) - historicalOutwardTotal);
                  
                  return (
                    <tr key={out._id?.toString() || i} className="bg-white hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium">{out.date ? new Date(out.date).toLocaleDateString('en-GB') : new Date(out.createdAt).toLocaleDateString('en-GB')}</td>
                      <td className="px-4 py-3 font-bold text-rose-600">{out.weighbridgeSlipNo || `OUT-${out._id.toString().slice(-6).toUpperCase()}`}</td>
                      <td className="px-4 py-3 font-bold text-right text-slate-800">{out.quantityKg || 0} {inward.unit || 'Kg'}</td>
                      <td className="px-4 py-3 font-bold text-right text-emerald-700">{balanceAtTime} {inward.unit || 'Kg'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
