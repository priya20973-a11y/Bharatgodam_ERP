'use client';

import React, { useState } from 'react';
import { Package, Users, Info, Download, QrCode } from 'lucide-react';
import StackDetailsModal from './stack-details-modal';

interface StackData {
  stackNo: number;
  capacity: number;
  usedCapacity: number;
  availableCapacity: number;
  clients: string[];
  commodities: string[];
  status: string; // 'Empty' | 'Partial' | 'Full' | 'Blocked'
}

export default function FloorGrid({ floorData, highlightStackNo }: { floorData: any, highlightStackNo?: number | null }) {
  const { warehouseId, chamberNo, chamberName, floorNo, stackLayout, gridRows, gridCols, customLayout, noOfStacks, stacks } = floorData;
  const actualChamberNo = chamberNo || chamberName;

  const [selectedStackNo, setSelectedStackNo] = useState<number | null>(highlightStackNo || null);

  // Initialize a grid layout
  const rows = gridRows || Math.ceil(Math.sqrt(noOfStacks));
  const cols = gridCols || Math.ceil(noOfStacks / rows);

  // Build the cell mapping based on layout type
  const gridCells: (StackData | null)[][] = Array.from({ length: rows }).map(() => Array(cols).fill(null));

  if (stackLayout === 'CUSTOM' && customLayout && customLayout.length > 0) {
    customLayout.forEach((mapping: any) => {
      const s = stacks.find((st: any) => st.stackNo === mapping.stackNo);
      if (s && mapping.rowIndex < rows && mapping.colIndex < cols) {
        gridCells[mapping.rowIndex][mapping.colIndex] = s;
      }
    });
  } else {
    // Automated layouts
    let currentStackNo = 1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (currentStackNo > noOfStacks) break;

        let targetR = r;
        let targetC = c;

        if (stackLayout === 'COLUMN_WISE') {
          // c is the outer loop theoretically, so we swap index assignment
        } else if (stackLayout === 'REVERSE_ROW_WISE') {
          targetC = cols - 1 - c;
        } else if (stackLayout === 'REVERSE_COLUMN_WISE') {
          // reverse logic
        }

        // For automated, just simplify if needed based on the type.
        // Re-implementing loops for precise matching:
      }
    }

    // Accurate loops based on type
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

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'Empty': return 'bg-slate-200 text-slate-700';
      case 'Partial': return 'bg-amber-200 text-amber-900';
      case 'Full': return 'bg-red-200 text-red-900';
      case 'Blocked': return 'bg-slate-700 text-slate-200';
      default: return 'bg-slate-200 text-slate-700';
    }
  };

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-6">
        <button
          onClick={() => window.open(`/cold/floor-mapping/print?warehouseId=${warehouseId}&chamberNo=${actualChamberNo}&floorNo=${floorNo}`, '_blank')}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium shadow-sm"
        >
          <Download className="w-4 h-4" />
          Download Floor Layout
        </button>

        <div className="flex gap-4 text-sm justify-end">
          <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-slate-100 border border-slate-300"></div> Empty</div>
          <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-amber-50 border border-amber-300"></div> Partial</div>
          <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-red-50 border border-red-300"></div> Full</div>
        </div>
      </div>

      <div
        className="inline-grid gap-3 mx-auto w-full"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(110px, 1fr))` }}
      >
        {gridCells.map((row, rIdx) =>
          row.map((cell, cIdx) => {
            if (!cell) {
              return (
                <div key={`${rIdx}-${cIdx}`} className="aspect-square border-2 border-transparent rounded-xl bg-slate-100 flex items-center justify-center relative overflow-hidden">
                  <svg className="absolute inset-0 w-full h-full text-slate-300 opacity-50" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <line x1="0" y1="0" x2="100" y2="100" stroke="currentColor" strokeWidth="2" />
                  </svg>
                </div>
              );
            }

            return (
              <div
                key={`${rIdx}-${cIdx}`}
                onClick={() => setSelectedStackNo(cell.stackNo)}
                className={`flex flex-col p-2 rounded-xl border-2 transition-all hover:shadow-md cursor-pointer ${getStatusColor(cell.status)} aspect-square justify-center items-center relative`}
              >
                <div 
                  className="absolute top-2 left-2 text-slate-400 hover:text-indigo-600 transition-colors z-10"
                  onClick={(e) => {
                    e.stopPropagation();
                    const stacksParam = JSON.stringify([{ stackNo: cell.stackNo, name: `C${actualChamberNo}/F${floorNo}/S${cell.stackNo}` }]);
                    window.open(`/print/stack-qr?warehouseId=${warehouseId}&chamberName=${actualChamberNo}&floorNo=${floorNo}&stacks=${encodeURIComponent(stacksParam)}`, '_blank');
                  }}
                  title="View / Print QR"
                >
                  <QrCode className="w-4 h-4" />
                </div>

                <div className="absolute top-2 right-2 text-slate-400 hover:text-blue-600 transition-colors">
                  <Info className="w-4 h-4" />
                </div>

                <div className="text-center">
                  <span className="text-[10px] font-semibold opacity-60 uppercase tracking-wider block mb-0.5">Stack</span>
                  <span className="text-2xl font-bold block mb-1">{cell.stackNo}</span>
                </div>

                <span className={`text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${getStatusBadgeColor(cell.status)}`}>
                  {cell.status}
                </span>
              </div>
            );
          })
        )}
      </div>

      {selectedStackNo !== null && (
        <StackDetailsModal
          isOpen={true}
          onClose={() => setSelectedStackNo(null)}
          warehouseId={warehouseId}
          chamberNo={actualChamberNo}
          floorNo={floorNo}
          stackNo={selectedStackNo}
        />
      )}
    </div>
  );
}
