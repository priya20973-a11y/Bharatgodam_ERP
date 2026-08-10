'use client';

import { useEffect, useRef, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { getColdInwardByQrId } from '@/app/actions/cold-inward-actions';
import { toast } from 'react-hot-toast';

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (inwardData: any) => void;
}

export default function QRScannerModal({ isOpen, onClose, onScanSuccess }: QRScannerModalProps) {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(console.error);
        scannerRef.current = null;
      }
      return;
    }

    const timer = setTimeout(() => {
      if (!scannerRef.current) {
        scannerRef.current = new Html5QrcodeScanner(
          'qr-reader',
          { fps: 10, qrbox: { width: 250, height: 250 } },
          /* verbose= */ false
        );

        scannerRef.current.render(async (decodedText) => {
          if (scannerRef.current) {
            scannerRef.current.clear().catch(console.error);
            scannerRef.current = null;
          }
          
          setLoading(true);
          try {
            // If the scanned text is a URL, extract the last part (the UUID)
            const extractedId = decodedText.split('/').pop() || decodedText;
            
            const res = await getColdInwardByQrId(extractedId);
            if (res.success && res.data) {
              if (res.data.status === 'Completed' || res.data.remainingQuantityKg === 0) {
                toast.error('This inward is already fully outwarded/completed.');
                onClose();
              } else {
                toast.success('Inward scanned successfully!');
                onScanSuccess(res.data);
              }
            } else {
              toast.error(res.error || 'Invalid QR Code or Inward not found.');
              onClose();
            }
          } catch (err: any) {
            toast.error('Error fetching inward details');
            onClose();
          } finally {
            setLoading(false);
          }
        }, (err) => {
          // ignore continuous scan errors
        });
      }
    }, 100);

    return () => {
      clearTimeout(timer);
      if (scannerRef.current) {
        scannerRef.current.clear().catch(console.error);
        scannerRef.current = null;
      }
    };
  }, [isOpen, onClose, onScanSuccess]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Scan Inward Receipt QR</DialogTitle>
        </DialogHeader>
        
        {/* Hidden input for USB Hardware Scanners */}
        <form onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          const scannedText = formData.get('usb-scan') as string;
          if (scannedText) {
            // Trigger the exact same flow as the webcam
            if (scannerRef.current) {
              scannerRef.current.clear().catch(console.error);
              scannerRef.current = null;
            }
            setLoading(true);
            const extractedId = scannedText.split('/').pop() || scannedText;
            getColdInwardByQrId(extractedId).then((res) => {
              if (res.success && res.data) {
                if (res.data.status === 'Completed' || res.data.remainingQuantityKg === 0) {
                  toast.error('This inward is already fully outwarded/completed.');
                  onClose();
                } else {
                  toast.success('Inward scanned successfully!');
                  onScanSuccess(res.data);
                }
              } else {
                toast.error(res.error || 'Invalid QR Code or Inward not found.');
                onClose();
              }
            }).catch(() => {
              toast.error('Error fetching inward details');
              onClose();
            }).finally(() => {
              setLoading(false);
            });
          }
        }}>
          <input 
            type="text" 
            name="usb-scan" 
            autoFocus 
            className="absolute opacity-0 -z-10" 
            autoComplete="off" 
          />
        </form>

        <div className="flex flex-col items-center justify-center p-4">
          {loading ? (
            <div className="flex flex-col items-center gap-2 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p>Fetching Inward Details...</p>
            </div>
          ) : (
            <div id="qr-reader" className="w-full max-w-sm" />
          )}
        </div>
        
        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
