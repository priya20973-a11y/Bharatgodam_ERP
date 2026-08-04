'use client';

import React, { useEffect } from 'react';

interface StackData {
  stackNo: number;
  capacity: number;
  usedCapacity: number;
  availableCapacity: number;
  clients: string[];
  commodities: string[];
  status: string;
  bags: number;
  receiptNos: string[];
}

export default function PrintFloorGrid({ floorData }: { floorData: any }) {
  const { warehouseId, chamberNo, chamberName, floorNo, stackLayout, gridRows, gridCols, customLayout, noOfStacks, stacks } = floorData;

  useEffect(() => {
    // Automatically trigger print when loaded
    setTimeout(() => {
      window.print();
    }, 500);
  }, []);

  const rows = gridRows || Math.ceil(Math.sqrt(noOfStacks));
  const cols = gridCols || Math.ceil(noOfStacks / rows);

  const gridCells: (StackData | null)[][] = Array.from({ length: rows }).map(() => Array(cols).fill(null));

  if (stackLayout === 'CUSTOM' && customLayout && customLayout.length > 0) {
    customLayout.forEach((mapping: any) => {
      const s = stacks.find((st: any) => st.stackNo === mapping.stackNo);
      if (s && mapping.rowIndex < rows && mapping.colIndex < cols) {
        gridCells[mapping.rowIndex][mapping.colIndex] = s;
      }
    });
  } else {
    let sNo = 1;
    if (stackLayout === 'ROW_WISE') {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (sNo <= noOfStacks) {
            gridCells[r][c] = stacks.find((s: any) => s.stackNo === sNo) || null;
            sNo++;
          }
        }
      }
    } else if (stackLayout === 'REVERSE_ROW_WISE') {
      for (let r = 0; r < rows; r++) {
        for (let c = cols - 1; c >= 0; c--) {
          if (sNo <= noOfStacks) {
            gridCells[r][c] = stacks.find((s: any) => s.stackNo === sNo) || null;
            sNo++;
          }
        }
      }
    } else if (stackLayout === 'COLUMN_WISE') {
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          if (sNo <= noOfStacks) {
            gridCells[r][c] = stacks.find((s: any) => s.stackNo === sNo) || null;
            sNo++;
          }
        }
      }
    } else if (stackLayout === 'REVERSE_COLUMN_WISE') {
      for (let c = cols - 1; c >= 0; c--) {
        for (let r = 0; r < rows; r++) {
          if (sNo <= noOfStacks) {
            gridCells[r][c] = stacks.find((s: any) => s.stackNo === sNo) || null;
            sNo++;
          }
        }
      }
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Empty': return 'bg-slate-100 border-slate-200 text-slate-500';
      case 'Partial': return 'bg-amber-50 border-amber-300 text-amber-800';
      case 'Full': return 'bg-red-50 border-red-300 text-red-800';
      case 'Blocked': return 'bg-slate-800 border-slate-900 text-slate-300';
      default: return 'bg-slate-100 border-slate-200 text-slate-500';
    }
  };

  return (
    <div className="w-full bg-white print:bg-white p-4">
      <style dangerouslySetInnerHTML={{ __html: `
        @page {
          size: A3 landscape;
          margin: 10mm;
        }
        @media print {
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            background: white !important;
          }
          /* Hide everything else when printing, just show this component */
          body * {
            visibility: hidden;
          }
          #print-area, #print-area * {
            visibility: visible;
          }
          #print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}} />
      <div id="print-area">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl font-bold">Floor Layout</h1>
            <p className="text-sm text-slate-600 mt-1">
              Chamber: {chamberName || chamberNo} | Floor: {floorNo}
            </p>
            <p className="text-xs text-slate-500 mt-1">Date: {new Date().toLocaleDateString()}</p>
          </div>
          
          <div className="flex gap-4 text-xs">
            <div className="flex items-center gap-1"><div className="w-4 h-4 rounded bg-slate-100 border border-slate-200"></div> Empty</div>
            <div className="flex items-center gap-1"><div className="w-4 h-4 rounded bg-amber-50 border border-amber-300"></div> Partial</div>
            <div className="flex items-center gap-1"><div className="w-4 h-4 rounded bg-red-50 border border-red-300"></div> Full</div>
            <div className="flex items-center gap-1"><div className="w-4 h-4 rounded bg-slate-800 border border-slate-900"></div> Blocked</div>
          </div>
        </div>

        <div
          className="inline-grid gap-2 mx-auto w-full"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(180px, 1fr))` }}
        >
          {gridCells.map((row, rIdx) =>
            row.map((cell, cIdx) => {
              if (!cell) {
                return (
                  <div key={`${rIdx}-${cIdx}`} className="aspect-square border border-transparent rounded-lg bg-slate-50 flex items-center justify-center relative overflow-hidden min-h-[160px]">
                    <svg className="absolute inset-0 w-full h-full text-slate-200 opacity-50" viewBox="0 0 100 100" preserveAspectRatio="none">
                      <line x1="0" y1="0" x2="100" y2="100" stroke="currentColor" strokeWidth="1" />
                    </svg>
                  </div>
                );
              }

              return (
                <div
                  key={`${rIdx}-${cIdx}`}
                  className={`flex flex-col p-2 rounded-lg border ${getStatusColor(cell.status)} min-h-[160px] text-xs break-inside-avoid`}
                >
                  <div className="flex justify-between items-center mb-1 border-b border-black/10 pb-1">
                    <span className="font-bold text-lg">#{cell.stackNo}</span>
                    <span className="font-semibold uppercase px-1.5 py-0.5 rounded text-[10px] bg-black/5">{cell.status}</span>
                  </div>

                  <div className="flex-1 space-y-1 mt-1">
                    <p className="line-clamp-1"><span className="font-medium">Client:</span> {cell.clients.length > 0 ? cell.clients.join(', ') : '-'}</p>
                    <p className="line-clamp-1"><span className="font-medium">Cmdty:</span> {cell.commodities.length > 0 ? cell.commodities.join(', ') : '-'}</p>
                    <p><span className="font-medium">Qty:</span> {cell.usedCapacity.toLocaleString()} / {cell.capacity.toLocaleString()} kg</p>
                    <p><span className="font-medium">Bags:</span> {cell.bags}</p>
                    <p className="line-clamp-1" title={cell.receiptNos && cell.receiptNos.length > 0 ? cell.receiptNos.join(', ') : ''}><span className="font-medium">Receipt:</span> {cell.receiptNos && cell.receiptNos.length > 0 ? cell.receiptNos.join(', ') : '-'}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
