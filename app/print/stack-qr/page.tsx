'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, useRef } from 'react';
import QRCode from 'qrcode';

function PrintStackQRsContent() {
  const searchParams = useSearchParams();
  const warehouseId = searchParams.get('warehouseId');
  const warehouseName = searchParams.get('warehouseName');
  const chamberName = searchParams.get('chamberName');
  const floorNo = searchParams.get('floorNo');
  const stacks = searchParams.get('stacks');
  
  const [qrCodes, setQrCodes] = useState<{stackNo: number, dataUrl: string, name?: string}[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!warehouseId || !chamberName || !floorNo || !stacks) return;

    const generateQRs = async () => {
      try {
        const stackData = JSON.parse(stacks);
        const codes = [];
        
        for (const stack of stackData) {
          const url = `${window.location.origin}/cold/stack/${warehouseId}/${encodeURIComponent(chamberName)}/${floorNo}/${stack.stackNo}`;
          const dataUrl = await QRCode.toDataURL(url, {
            width: 150,
            margin: 1,
            color: {
              dark: '#0f172a',
              light: '#ffffff',
            },
          });
          codes.push({ stackNo: stack.stackNo, dataUrl, name: stack.name });
        }
        
        setQrCodes(codes);
      } catch (err) {
        console.error('Failed to parse or generate QRs:', err);
      }
    };

    generateQRs();
  }, [warehouseId, chamberName, floorNo, stacks]);

  useEffect(() => {
    if (qrCodes.length > 0) {
      // Small timeout to allow images to render in DOM
      const timer = setTimeout(() => {
        window.print();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [qrCodes]);



  if (!warehouseId || !chamberName || !floorNo || !stacks) {
    return <div className="p-10 text-center">Missing required parameters for printing QRs.</div>;
  }

  if (qrCodes.length === 0) {
    return <div className="p-10 text-center text-slate-500 font-medium text-lg">Loading QRs or No stacks found.</div>;
  }

  return (
    <div className="bg-white min-h-screen font-sans">
      <div ref={containerRef} className="p-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6 print:gap-4">
          {qrCodes.map((qr) => (
            <div key={qr.stackNo} className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl p-4 break-inside-avoid print:border-solid print:border-slate-800 print:rounded-lg">
              <div className="text-xs font-bold text-slate-500 mb-1 truncate w-full text-center">{warehouseName || 'Warehouse'}</div>
              <img src={qr.dataUrl} alt={`QR for Stack ${qr.stackNo}`} className="w-32 h-32 mb-2" />
              <div className="text-center font-bold text-slate-800 text-lg tracking-wide whitespace-nowrap">
                C{chamberName}/F{floorNo}/S{qr.stackNo}
              </div>
              {qr.name && <div className="text-xs text-slate-500 mt-1">{qr.name}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function PrintStackQRsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading QR Codes...</div>}>
      <PrintStackQRsContent />
    </Suspense>
  );
}
