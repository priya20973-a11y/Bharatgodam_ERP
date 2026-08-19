'use client';

import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Html5Qrcode } from 'html5-qrcode';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { QrCode, Camera, Upload, Keyboard, Loader2, Image as ImageIcon, AlertTriangle, RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface OutwardQRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (scannedText: string) => void;
  initialTab?: 'camera' | 'upload';
}

export default function OutwardQRScannerModal({
  isOpen,
  onClose,
  onScanSuccess,
  initialTab = 'camera',
}: OutwardQRScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const isScanningRef = useRef<boolean>(false);
  const scanTimerRef = useRef<any>(null);

  const [activeTab, setActiveTab] = useState<'camera' | 'upload'>(initialTab);
  const [manualInput, setManualInput] = useState('');
  const [processingFile, setProcessingFile] = useState(false);
  const [uploadedPreview, setUploadedPreview] = useState<string | null>(null);

  const [isCameraStarting, setIsCameraStarting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setUploadedPreview(null);
      setManualInput('');
      setCameraError(null);
    }
  }, [isOpen, initialTab]);

  const stopCamera = () => {
    isScanningRef.current = false;
    if (scanTimerRef.current) {
      clearTimeout(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {
          console.error('Track stop error:', e);
        }
      });
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    if (!isOpen || activeTab !== 'camera') {
      stopCamera();
      return;
    }

    let isMounted = true;
    setCameraError(null);
    setIsCameraStarting(true);

    const startNativeCamera = async () => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (isMounted) {
          setIsCameraStarting(false);
          setCameraError('Camera access is not supported by your browser or connection (HTTPS is required).');
        }
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 150));
      if (!isMounted) return;

      let stream: MediaStream | null = null;

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (envErr: any) {
        if (envErr.name === 'NotAllowedError' || envErr.name === 'PermissionDeniedError') {
          if (isMounted) {
            setIsCameraStarting(false);
            setCameraError('Camera permission was denied. Please allow camera access in browser site settings and click Retry.');
          }
          return;
        }

        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        } catch (fallbackErr: any) {
          if (isMounted) {
            setIsCameraStarting(false);
            if (fallbackErr.name === 'NotAllowedError' || fallbackErr.name === 'PermissionDeniedError') {
              setCameraError('Camera permission was denied. Please allow camera access in browser site settings and click Retry.');
            } else if (fallbackErr.name === 'NotFoundError' || fallbackErr.name === 'DevicesNotFoundError') {
              setCameraError('No camera device found. Please connect a webcam or use Upload QR Image.');
            } else {
              setCameraError(`Unable to start camera: ${fallbackErr.message || 'Unknown error'}`);
            }
          }
          return;
        }
      }

      if (!isMounted || !stream) {
        if (stream) stream.getTracks().forEach((t) => t.stop());
        return;
      }

      mediaStreamRef.current = stream;

      if (videoRef.current) {
        const video = videoRef.current;
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        video.setAttribute('autoplay', 'true');
        video.muted = true;

        try {
          await video.play();
        } catch (e) {
          console.error('Video play error:', e);
        }
      }

      if (isMounted) {
        setIsCameraStarting(false);
        isScanningRef.current = true;
        scanFrameLoop();
      }
    };

    const scanFrameLoop = () => {
      if (!isScanningRef.current) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && canvas && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert',
          });

          if (code && code.data && code.data.trim()) {
            isScanningRef.current = false;
            stopCamera();
            onScanSuccess(code.data.trim());
            onClose();
            return;
          }
        }
      }

      if (isScanningRef.current) {
        scanTimerRef.current = setTimeout(scanFrameLoop, 150);
      }
    };

    startNativeCamera();

    return () => {
      isMounted = false;
      stopCamera();
    };
  }, [isOpen, activeTab, retryKey]);

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    stopCamera();
    onScanSuccess(manualInput.trim());
    setManualInput('');
    onClose();
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => setUploadedPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    setProcessingFile(true);
    try {
      stopCamera();

      let decodedText: string | null = null;
      try {
        const html5QrCode = new Html5Qrcode('outward-qr-file-temp');
        decodedText = await html5QrCode.scanFile(file, false);
        html5QrCode.clear();
      } catch (err) {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        await new Promise((res) => {
          img.onload = res;
          img.onerror = res;
        });

        if (img.width > 0 && img.height > 0) {
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = img.width;
          tempCanvas.height = img.height;
          const ctx = tempCanvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            const imgData = ctx.getImageData(0, 0, img.width, img.height);
            const code = jsQR(imgData.data, imgData.width, imgData.height);
            if (code && code.data) {
              decodedText = code.data;
            }
          }
        }
      }

      if (decodedText) {
        onScanSuccess(decodedText);
        onClose();
      } else {
        toast.error('Could not detect a valid QR code in the uploaded image. Please upload a clear receipt image.');
      }
    } catch (err: any) {
      console.error('File scan error:', err);
      toast.error('Could not detect a valid QR code in the uploaded image.');
    } finally {
      setProcessingFile(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-rose-900">
            <QrCode className="w-5 h-5 text-rose-600" />
            Scan Inward / Ownership Transfer QR
          </DialogTitle>
        </DialogHeader>

        {/* Hidden elements for canvas frame decoding & file scanner */}
        <canvas ref={canvasRef} className="hidden" />
        <div id="outward-qr-file-temp" className="hidden" />

        {/* Mode Tabs */}
        <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab('camera')}
            className={`flex-1 py-1.5 px-3 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'camera'
                ? 'bg-white text-rose-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            Scan with Camera
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`flex-1 py-1.5 px-3 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'upload'
                ? 'bg-white text-rose-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            Upload QR Image
          </button>
        </div>

        {/* Tab 1: Camera Scanner */}
        {activeTab === 'camera' && (
          <div className="space-y-3 pt-1">
            <div className="bg-slate-900 rounded-lg border text-center relative overflow-hidden min-h-[260px] flex flex-col items-center justify-center">
              {isCameraStarting && (
                <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center text-white space-y-2 z-10">
                  <Loader2 className="w-8 h-8 animate-spin text-rose-400" />
                  <p className="text-xs font-medium">Starting camera stream...</p>
                </div>
              )}

              {cameraError ? (
                <div className="p-4 text-center space-y-3 z-10">
                  <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
                  <p className="text-xs text-slate-200 leading-relaxed max-w-xs">{cameraError}</p>
                  <div className="flex justify-center gap-2 pt-1">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setCameraError(null);
                        setIsCameraStarting(true);
                        setRetryKey((prev) => prev + 1);
                      }}
                      className="h-8 text-xs bg-rose-600 hover:bg-rose-700 text-white font-medium"
                    >
                      <RefreshCw className="w-3.5 h-3.5 mr-1" />
                      Retry Camera
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setActiveTab('upload')}
                      className="h-8 text-xs bg-slate-800 text-white border-slate-700 hover:bg-slate-700"
                    >
                      Upload Image
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="relative w-full h-[260px] flex items-center justify-center bg-black">
                  <video
                    ref={videoRef}
                    playsInline
                    autoPlay
                    muted
                    className="w-full h-full object-cover"
                  />
                  {/* Scanner overlay guide */}
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-48 h-48 border-2 border-rose-400 rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.4)] relative">
                      <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-rose-300" />
                      <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-rose-300" />
                      <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-rose-300" />
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-rose-300" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <form onSubmit={handleManualSubmit} className="space-y-2 border-t pt-3">
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <Keyboard className="w-3.5 h-3.5 text-slate-500" />
                USB Barcode / QR Scanner Input
              </label>
              <div className="flex gap-2">
                <Input
                  autoFocus
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  placeholder="Scan or paste Receipt QR code text..."
                  className="text-xs h-9"
                />
                <Button type="submit" size="sm" className="h-9 text-xs bg-rose-600 hover:bg-rose-700 text-white">
                  Submit
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* Tab 2: Upload QR Image */}
        {activeTab === 'upload' && (
          <div className="space-y-4 pt-1">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-rose-300 bg-rose-50/50 hover:bg-rose-50 p-6 rounded-lg text-center cursor-pointer transition-all flex flex-col items-center justify-center space-y-2"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />

              {uploadedPreview ? (
                <div className="space-y-2">
                  <img
                    src={uploadedPreview}
                    alt="QR Code Preview"
                    className="max-h-36 mx-auto rounded border shadow-sm object-contain"
                  />
                  {processingFile && (
                    <div className="flex items-center justify-center gap-2 text-xs font-semibold text-rose-700">
                      <Loader2 className="w-4 h-4 animate-spin" /> Decoding Receipt QR image...
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="p-3 bg-white rounded-full border border-rose-200 text-rose-600 shadow-xs">
                    <ImageIcon className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-rose-900">Click to Select Receipt QR Code Image</p>
                    <p className="text-xs text-slate-500 mt-1">Supports PNG, JPG, JPEG, WEBP receipt images</p>
                  </div>
                  <Button type="button" size="sm" variant="outline" className="mt-2 text-xs">
                    Browse File
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
