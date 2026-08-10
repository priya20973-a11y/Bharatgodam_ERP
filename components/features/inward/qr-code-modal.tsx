'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { QRCodeSVG } from 'qrcode.react';
import { Printer, Download, X } from 'lucide-react';
import { useRef } from 'react';

interface QrCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  inwardData: any | null;
  qrId: string | null;
}

export default function QrCodeModal({ isOpen, onClose, inwardData, qrId }: QrCodeModalProps) {
  const qrRef = useRef<SVGSVGElement>(null);

  const handleDownload = () => {
    if (!qrRef.current || !qrId) return;
    const svg = qrRef.current;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    
    img.onload = () => {
      // Add some padding
      const padding = 20;
      canvas.width = img.width + padding * 2;
      canvas.height = img.height + padding * 2;
      
      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, padding, padding);
        
        const pngFile = canvas.toDataURL("image/png");
        const downloadLink = document.createElement("a");
        downloadLink.download = `QR_${inwardData?.clientId?.name || 'Inward'}_${new Date().toISOString().split('T')[0]}.png`;
        downloadLink.href = `${pngFile}`;
        downloadLink.click();
      }
    };
    
    img.src = `data:image/svg+xml;base64,${btoa(svgData)}`;
  };

  const handlePrint = () => {
    if (!qrRef.current || !inwardData) return;
    const svgData = new XMLSerializer().serializeToString(qrRef.current);
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    const clientName = inwardData.clientId?.name || 'Unknown Client';
    const commodity = inwardData.commodityId?.name || 'Unknown Commodity';
    const date = new Date(inwardData.date).toLocaleDateString('en-GB');
    
    printWindow.document.write(`
      <html>
        <head>
          <title>Print QR Code</title>
          <style>
            body { font-family: sans-serif; text-align: center; padding: 20px; }
            .card { border: 1px solid #ccc; padding: 20px; display: inline-block; border-radius: 8px; }
            .details { margin-top: 15px; font-size: 14px; text-align: left; }
            .details strong { display: inline-block; width: 80px; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2 style="margin-top: 0;">Inward QR Code</h2>
            ${svgData}
            <div class="details">
              <div><strong>Client:</strong> ${clientName}</div>
              <div><strong>Item:</strong> ${commodity}</div>
              <div><strong>Date:</strong> ${date}</div>
              <div><strong>Weight:</strong> ${inwardData.quantityKg} Kg</div>
            </div>
          </div>
          <script>
            setTimeout(() => {
              window.print();
              window.close();
            }, 300);
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  if (!inwardData || !qrId) return null;

  const clientName = inwardData.clientId?.name || 'Unknown Client';
  const commodity = inwardData.commodityId?.name || 'Unknown Commodity';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Inward QR Code</DialogTitle>
        </DialogHeader>
        
        <div className="flex flex-col items-center justify-center p-6 bg-slate-50 rounded-md border my-4">
          <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
            <QRCodeSVG 
              ref={qrRef}
              value={typeof window !== 'undefined' ? `${window.location.origin}/qr/inward/${qrId}` : qrId} 
              size={200}
              level="H"
              includeMargin={true}
            />
          </div>
          <div className="mt-6 text-center space-y-1">
            <h3 className="font-semibold text-lg text-slate-800">{clientName}</h3>
            <p className="text-slate-600 font-medium">{commodity}</p>
            <p className="text-slate-500 text-sm">{new Date(inwardData.date).toLocaleDateString('en-GB')} • {inwardData.quantityKg} Kg</p>
          </div>
        </div>
        
        <div className="flex justify-between items-center w-full">
          <Button variant="outline" onClick={onClose}>
            <X className="w-4 h-4 mr-2" /> Close
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleDownload}>
              <Download className="w-4 h-4 mr-2" /> Download
            </Button>
            <Button onClick={handlePrint}>
              <Printer className="w-4 h-4 mr-2" /> Print
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
