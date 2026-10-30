'use client';

export interface StorageRentTableRow {
  commodity: string;
  rate: number;
  fromDate: string;
  toDate: string;
  qty: number;
  days: number;
  rent: number;
  status: string;
  calculation: string;
}

interface StorageRentTableProps {
  rows: StorageRentTableRow[];
}

export function StorageRentTable({ rows }: StorageRentTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-100">
          <tr>
            <th className="px-4 py-2 text-left font-semibold text-slate-700">Commodity</th>
            <th className="px-4 py-2 text-left font-semibold text-slate-700">From Date</th>
            <th className="px-4 py-2 text-left font-semibold text-slate-700">To Date</th>
            <th className="px-4 py-2 text-center font-semibold text-slate-700">Qty (MT)</th>
            <th className="px-4 py-2 text-center font-semibold text-slate-700">Days</th>
            <th className="px-4 py-2 text-right font-semibold text-slate-700">Rent (₹)</th>
            <th className="px-4 py-2 text-center font-semibold text-slate-700">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row, index) => (
            <tr key={`${row.commodity}-${row.fromDate}-${index}`} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
              <td className="px-4 py-3 font-medium text-slate-900">
                <>{row.commodity} <span className="text-xs text-slate-500">({Number(row.rate || 0).toFixed(0)} PER MT)</span></>
              </td>
              <td className="px-4 py-3">{row.fromDate}</td>
              <td className="px-4 py-3">{row.toDate}</td>
              <td className="px-4 py-3 text-center font-medium">{Number(row.qty || 0).toFixed(2)}</td>
              <td className="px-4 py-3 text-center">{row.days}</td>
              <td className="px-4 py-3 text-right font-semibold">₹{Number(row.rent || 0).toLocaleString('en-IN')}</td>
              <td className="px-4 py-3 text-center">
                <span className="inline-flex rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                  {row.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
