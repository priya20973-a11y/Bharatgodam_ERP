'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { getWarehouseQRs } from '@/app/actions/floor-mapping-actions';
import { Printer, ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface StackQRItem {
  chamberName: string;
  chamberDisplay: string;
  floorNo: number;
  floorName: string;
  floorDisplay: string;
  stackNo: number;
  locationId: string;
  dataUrl?: string;
}

function PrintWarehouseQRsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const warehouseId = searchParams.get('warehouseId');
  const autoAction = searchParams.get('autoAction');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warehouseName, setWarehouseName] = useState<string>('');
  const [qrItems, setQrItems] = useState<StackQRItem[]>([]);

  useEffect(() => {
    if (!warehouseId) {
      setError('Warehouse ID is required.');
      setLoading(false);
      return;
    }

    let isMounted = true;

    async function loadData() {
      try {
        setLoading(true);
        setError(null);

        const res = await getWarehouseQRs(warehouseId!);
        if (!res.success || !res.data) {
          if (isMounted) setError(res.error || 'Failed to fetch warehouse QR codes.');
          return;
        }

        if (res.data.stacks.length === 0) {
          if (isMounted) setError('No mapped floors or stacks found for this warehouse.');
          return;
        }

        if (isMounted) setWarehouseName(res.data.warehouseName);

        // Generate high-res QR codes for all stacks
        const itemsWithQRs = await Promise.all(
          res.data.stacks.map(async (stk) => {
            const url = `${window.location.origin}/cold/stack/${res.data.warehouseId}/${encodeURIComponent(stk.chamberName)}/${stk.floorNo}/${stk.stackNo}`;
            const dataUrl = await QRCode.toDataURL(url, {
              width: 300,
              margin: 2,
              errorCorrectionLevel: 'M',
              color: { dark: '#000000', light: '#ffffff' },
            });
            return {
              ...stk,
              dataUrl,
            };
          })
        );

        if (isMounted) {
          setQrItems(itemsWithQRs);
        }
      } catch (err: any) {
        console.error('Failed to load QR codes:', err);
        if (isMounted) setError(err.message || 'An unexpected error occurred while generating QR codes.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [warehouseId]);

  // Handle autoAction === 'print'
  useEffect(() => {
    if (autoAction === 'print' && qrItems.length > 0 && !loading) {
      const timer = setTimeout(() => {
        window.print();
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [autoAction, qrItems, loading]);


  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 text-slate-700">
        <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" />
        <h2 className="text-lg font-semibold">Generating Warehouse QR Codes...</h2>
        <p className="text-sm text-slate-500 mt-1">Please wait while all locations and QR codes are being generated.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-6 text-center">
        <div className="bg-white p-8 rounded-xl shadow-sm border max-w-md w-full">
          <div className="text-rose-500 text-4xl mb-3">⚠️</div>
          <h2 className="text-lg font-bold text-slate-800 mb-2">Notice</h2>
          <p className="text-slate-600 mb-6 text-sm">{error}</p>
          <Button onClick={() => router.back()} variant="outline" className="w-full">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Floor Mapping
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-100 min-h-screen print:bg-white print:min-h-0">
      {/* Explicit A4 Page Size CSS */}
      <style jsx global>{`
        @page {
          size: A4 portrait;
          margin: 8mm;
        }
        @media print {
          html, body {
            width: 210mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          header {
            display: none !important;
          }
          .qr-card {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      `}</style>

      {/* Top Action Toolbar (Hidden during print) */}
      <header className="print:hidden sticky top-0 z-40 bg-white border-b shadow-sm px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button onClick={() => router.back()} variant="ghost" size="sm" className="text-slate-600">
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
          </Button>
          <div className="h-4 w-px bg-slate-200" />
          <div>
            <h1 className="text-sm font-bold text-slate-900">{warehouseName}</h1>
            <p className="text-xs text-slate-500">{qrItems.length} Mapped Locations / Stacks • A4 Print Layout</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={() => window.print()}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm"
            size="sm"
          >
            <Printer className="w-4 h-4 mr-2" /> Print (A4)
          </Button>
        </div>
      </header>

      {/* Main Printable Document */}
      <main className="p-8 max-w-5xl mx-auto print:p-0 print:max-w-none">
        <div className="bg-white p-6 rounded-lg shadow-sm border print:border-none print:shadow-none print:p-0">
          {/* Screen-only Title Header (Hidden during print to maximize A4 page space) */}
          <div className="print:hidden border-b pb-3 mb-6 flex justify-between items-end">
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                {warehouseName} - Stack QR Codes
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Total Locations: {qrItems.length} • Formatted for A4 Sheet Printing
              </p>
            </div>
            <div className="text-right text-xs text-slate-400">
              Date: {new Date().toLocaleDateString('en-GB')}
            </div>
          </div>

          {/* Grid of Location QR Cards (A4 3-Column Layout) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 print:grid-cols-3 gap-4 print:gap-3">
            {qrItems.map((item, idx) => (
              <div
                key={`${item.chamberName}-${item.floorNo}-${item.stackNo}-${idx}`}
                className="qr-card flex flex-col items-center justify-center border-2 border-dashed border-slate-400 rounded-xl p-3 bg-white print:border-slate-800 break-inside-avoid print:break-inside-avoid"
                style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
              >
                {/* Scannable QR Code */}
                {item.dataUrl ? (
                  <img
                    src={item.dataUrl}
                    alt={`QR Code for ${item.locationId}`}
                    className="w-36 h-36 print:w-32 print:h-32 object-contain block mx-auto my-1"
                  />
                ) : (
                  <div className="w-36 h-36 print:w-32 print:h-32 flex items-center justify-center bg-slate-100 text-xs text-slate-400">
                    Generating...
                  </div>
                )}

                {/* Location Identifier (e.g. C1/F1/S1) */}
                <div className="text-center font-black text-slate-900 text-lg print:text-base tracking-wider mt-1">
                  {item.locationId}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function PrintWarehouseQRsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen text-slate-500">
          Loading QR Codes...
        </div>
      }
    >
      <PrintWarehouseQRsContent />
    </Suspense>
  );
}
