import { getStackDetails } from '@/app/actions/cold-stack-actions';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { PackageIcon, LayersIcon, MapPinIcon, InfoIcon, TrendingDownIcon, LogInIcon, History, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';

export default async function StackDetailsPage({ params }: { params: Promise<{ warehouseId: string, chamber: string, floor: string, stack: string }> }) {
  const { warehouseId, chamber, floor, stack } = await params;
  
  const res = await getStackDetails(warehouseId, decodeURIComponent(chamber), parseInt(floor), parseInt(stack));
  
  if (!res.success || !res.data) {
    return notFound();
  }

  const data = res.data;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center">
            <LayersIcon className="w-6 h-6 mr-2 text-indigo-600" />
            Stack Details
          </h1>
          <p className="text-slate-500 mt-1 flex items-center">
            <MapPinIcon className="w-4 h-4 mr-1" />
            {data.warehouseName} / {data.chamberName} / Floor {data.floorNo} / Stack {data.stackNo}
          </p>
        </div>
        
        <div className="flex space-x-2">
          <Button variant="outline" asChild className="border-emerald-200 text-emerald-700 hover:bg-emerald-50">
            <Link href={`/cold/inward?warehouseId=${data.warehouseId}&chamberName=${encodeURIComponent(data.chamberName)}&floorNo=${data.floorNo}&stackNo=${data.stackNo}`}>
              <LogInIcon className="w-4 h-4 mr-2" /> Add Inward
            </Link>
          </Button>
          <Button asChild className="bg-indigo-600 hover:bg-indigo-700 text-white">
            <Link href={`/cold/outward?warehouseId=${data.warehouseId}&chamberName=${encodeURIComponent(data.chamberName)}&floorNo=${data.floorNo}&stackNo=${data.stackNo}`}>
              <TrendingDownIcon className="w-4 h-4 mr-2" /> Add Outward
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 text-center">
          <p className="text-sm font-medium text-slate-500">Total Capacity</p>
          <p className="text-3xl font-bold text-slate-800 mt-2">{data.totalCapacity}</p>
        </div>
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 text-center">
          <p className="text-sm font-medium text-slate-500">Occupied Capacity</p>
          <p className="text-3xl font-bold text-amber-600 mt-2">{data.occupied}</p>
        </div>
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 text-center relative overflow-hidden">
          <div className="relative z-10">
            <p className="text-sm font-medium text-slate-500">Available Capacity</p>
            <p className="text-3xl font-bold text-emerald-600 mt-2">{data.availableCapacity}</p>
          </div>
          <div className="absolute top-0 right-0 p-2">
            <span className={`text-xs font-bold px-2 py-1 rounded-full ${
              data.status === 'Full' ? 'bg-red-100 text-red-700' :
              data.status === 'Partial' ? 'bg-amber-100 text-amber-700' :
              'bg-emerald-100 text-emerald-700'
            }`}>
              {data.status}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
        <h2 className="text-lg font-semibold border-b pb-2 flex items-center">
          <PackageIcon className="w-5 h-5 mr-2 text-indigo-500" /> Current Stock Distribution
        </h2>
        
        {data.currentStock && data.currentStock.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Client / Owner</th>
                  <th className="px-4 py-3 font-medium">Commodity</th>
                  <th className="px-4 py-3 font-medium">Stock Type</th>
                  <th className="px-4 py-3 font-medium text-right">Quantity</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.currentStock.map((stock: any, i: number) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium">{stock.clientName}</td>
                    <td className="px-4 py-3">{stock.commodityName}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs ${stock.stockType === 'Purchase' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-700'}`}>
                        {stock.stockType}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-700">{stock.quantity} {stock.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-slate-400">
            <InfoIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No stock currently available in this stack.</p>
          </div>
        )}
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
        <h2 className="text-lg font-semibold border-b pb-2 text-slate-800">Active Stock Details</h2>
        
        {data.activeStocks && data.activeStocks.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Client Name</th>
                  <th className="px-4 py-3 font-medium">Farmer Name</th>
                  <th className="px-4 py-3 font-medium">Ref Persons</th>
                  <th className="px-4 py-3 font-medium">Commodity</th>
                  <th className="px-4 py-3 font-medium text-right">Quantity</th>
                  <th className="px-4 py-3 font-medium">L/B</th>
                  <th className="px-4 py-3 font-medium">S/B</th>
                  <th className="px-4 py-3 font-medium">M/B</th>
                  <th className="px-4 py-3 font-medium">T/B</th>
                  <th className="px-4 py-3 font-medium">Truck No</th>
                  <th className="px-4 py-3 font-medium text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.activeStocks.map((stock: any) => (
                  <tr key={stock.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">{new Date(stock.date).toLocaleDateString()}</td>
                    <td className="px-4 py-3">{stock.client}</td>
                    <td className="px-4 py-3">{stock.farmer}</td>
                    <td className="px-4 py-3 text-slate-600 max-w-[150px] truncate" title={stock.referencePersons}>{stock.referencePersons}</td>
                    <td className="px-4 py-3">{stock.commodity}</td>
                    <td className="px-4 py-3 text-right font-bold text-blue-700">{stock.quantity.toLocaleString()}</td>
                    <td className="px-4 py-3 font-medium text-slate-700">{stock.largeBags}</td>
                    <td className="px-4 py-3 font-medium text-slate-700">{stock.smallBags}</td>
                    <td className="px-4 py-3 font-medium text-slate-700">{stock.mixedBags}</td>
                    <td className="px-4 py-3 font-bold text-slate-900">{stock.totalBags}</td>
                    <td className="px-4 py-3 text-slate-500">{stock.truckNo}</td>
                    <td className="px-4 py-3 text-center">
                      <Link href={`/cold/inward/details/${stock.id}`} className="text-indigo-600 hover:underline text-xs">
                        View Details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-center py-6 text-slate-500">No active stock details found.</p>
        )}
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
        <h2 className="text-lg font-semibold border-b pb-2 text-slate-800 flex items-center">
          <History className="w-5 h-5 mr-2 text-indigo-500" /> Transaction History
        </h2>
        
        {data.transactions && data.transactions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Receipt No</th>
                  <th className="px-4 py-3 font-medium text-right">Quantity</th>
                  <th className="px-4 py-3 font-medium">Client / Owner</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.transactions.map((tItem: any, i: number) => (
                  <tr key={`${tItem.id}-${i}`} className="hover:bg-slate-50">
                    <td className="px-4 py-3">{new Date(tItem.date).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
                        tItem.type === 'INWARD' ? 'bg-emerald-100 text-emerald-900' : 'bg-rose-100 text-rose-900'
                      }`}>
                        {tItem.type === 'INWARD' ? <ArrowDownToLine className="w-3 h-3 mr-1" /> : <ArrowUpFromLine className="w-3 h-3 mr-1" />}
                        {tItem.type}
                      </span>
                    </td>
                    <td className="px-4 py-3">{tItem.receiptNo}</td>
                    <td className="px-4 py-3 text-right font-semibold">{tItem.quantity.toLocaleString()}</td>
                    <td className="px-4 py-3">{tItem.client}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-center py-6 text-slate-500">No transactions found for this stack.</p>
        )}
      </div>
    </div>
  );
}
