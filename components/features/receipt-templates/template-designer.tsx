'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { toast } from 'react-hot-toast';
import { getReceiptTemplate, saveReceiptTemplate } from '@/app/actions/receipt-template-actions';
import { Loader2, Save, UploadCloud, Trash2, Printer } from 'lucide-react';

interface TemplateDesignerProps {
  warehouses: any[];
}

const COMMON_FIELDS = [
  { key: 'receiptNo', label: 'Receipt/Invoice No' },
  { key: 'date', label: 'Date' },
  { key: 'time', label: 'Time' },
  { key: 'clientName', label: 'Client Name' },
  { key: 'farmerName', label: 'Farmer Name' },
  { key: 'farmerId', label: 'Farmer ID' },
  { key: 'address', label: 'Address' },
  { key: 'village', label: 'Village' },
  { key: 'mobile', label: 'Mobile' },
  { key: 'remarks', label: 'Remarks' },
];

const INWARD_OUTWARD_FIELDS = [
  ...COMMON_FIELDS,
  { key: 'marko', label: 'Marko' },
  { key: 'commodity', label: 'Commodity' },
  { key: 'variety', label: 'Variety' },
  { key: 'grade', label: 'Grade' },
  { key: 'bags', label: 'Total Bags' },
  { key: 'largeBags', label: 'Large Bags' },
  { key: 'smallBags', label: 'Small Bags' },
  { key: 'grossWeight', label: 'Gross Weight' },
  { key: 'emptyWeight', label: 'Empty Weight' },
  { key: 'netWeight', label: 'Net Weight' },
  { key: 'vehicleNo', label: 'Vehicle No' },
  { key: 'slipNo', label: 'Weighbridge Slip No' },
  { key: 'chamberNo', label: 'Chamber No' },
  { key: 'floorNo', label: 'Floor No' },
  { key: 'rackNo', label: 'Stack/Rack No' },
  { key: 'allocatedBags', label: 'Allocated Bags' },
];

const INVOICE_FIELDS = [
  ...COMMON_FIELDS,
  { key: 'storagePeriod', label: 'Storage Period' },
  { key: 'rentAmount', label: 'Rent Amount' },
  { key: 'additionalCharges', label: 'Additional Charges' },
  { key: 'basicTotal', label: 'Basic Total' },
  { key: 'cgstAmount', label: 'CGST Amount' },
  { key: 'sgstAmount', label: 'SGST Amount' },
  { key: 'igstAmount', label: 'IGST Amount' },
  { key: 'adjustment', label: 'Adjustment' },
  { key: 'roundOff', label: 'Round Off' },
  { key: 'netAmount', label: 'Net Amount' },
  { key: 'netAmountWords', label: 'Amount in Words' },
  { key: 'companyGstin', label: 'Company GSTIN' },
  { key: 'companyPan', label: 'Company PAN' },
  { key: 'clientGstin', label: 'Client GSTIN' },
  { key: 'clientPan', label: 'Client PAN' },
];

export default function TemplateDesigner({ warehouses }: TemplateDesignerProps) {
  const [warehouseId, setWarehouseId] = useState<string>('');
  const [receiptType, setReceiptType] = useState<'inward' | 'outward' | 'invoice'>('inward');
  
  const currentAvailableFields = receiptType === 'invoice' ? INVOICE_FIELDS : INWARD_OUTWARD_FIELDS;
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState('My Receipt Template');
  const [paperWidth, setPaperWidth] = useState(210); // A4 Width in mm
  const [paperHeight, setPaperHeight] = useState(297); // A4 Height in mm
  const [backgroundImage, setBackgroundImage] = useState('');
  const [imagePixelWidth, setImagePixelWidth] = useState<number | undefined>();
  const [imagePixelHeight, setImagePixelHeight] = useState<number | undefined>();
  const [imageAspectRatio, setImageAspectRatio] = useState<number | undefined>();
  const [autoFit, setAutoFit] = useState<boolean>(true);
  
  const [fields, setFields] = useState<any[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  
  // Ref for the canvas wrapper to calculate relative coordinates
  const canvasRef = useRef<HTMLDivElement>(null);

  // Load template when warehouse/type changes
  useEffect(() => {
    if (!warehouseId || !receiptType) return;
    
    const loadTemplate = async () => {
      setLoading(true);
      try {
        const res = await getReceiptTemplate(warehouseId, receiptType);
        if (res.success && res.data) {
          const t = res.data;
          setTemplateId(t._id);
          setTemplateName(t.templateName || 'My Template');
          setPaperWidth(t.paperWidth || 210);
          setPaperHeight(t.paperHeight || 297);
          setBackgroundImage(t.backgroundImage || '');
          setImagePixelWidth(t.imagePixelWidth);
          setImagePixelHeight(t.imagePixelHeight);
          setImageAspectRatio(t.imageAspectRatio);
          setFields(t.fields || []);
        } else {
          // Reset to defaults
          setTemplateId(null);
          setTemplateName('New Template');
          setPaperWidth(210);
          setPaperHeight(297);
          setBackgroundImage('');
          setImagePixelWidth(undefined);
          setImagePixelHeight(undefined);
          setImageAspectRatio(undefined);
          setFields([]);
        }
      } catch (err) {
        toast.error('Failed to load template');
      } finally {
        setLoading(false);
      }
    };
    
    loadTemplate();
  }, [warehouseId, receiptType]);

  const handleAddField = (key: string) => {
    if (fields.some(f => f.key === key)) {
      toast.error('Field already added');
      return;
    }
    
    const newField = {
      _id: Date.now().toString(),
      key,
      x: 10, // Default 10mm from left
      y: 10, // Default 10mm from top
      fontSize: 12,
      fontWeight: 'normal',
      align: 'left',
      visible: true
    };
    
    setFields([...fields, newField]);
    setSelectedFieldId(newField._id);
  };

  const handleRemoveField = (id: string) => {
    setFields(fields.filter(f => f._id !== id && f.key !== id));
    if (selectedFieldId === id) setSelectedFieldId(null);
  };

  const updateSelectedField = (updates: any) => {
    if (!selectedFieldId) return;
    setFields(fields.map(f => (f._id === selectedFieldId || f.key === selectedFieldId) ? { ...f, ...updates } : f));
  };

  const handleSave = async () => {
    if (!warehouseId) {
      toast.error('Please select a warehouse');
      return;
    }
    
    setSaving(true);
    try {
      const data = {
        warehouseId,
        receiptType,
        templateName,
        paperWidth,
        paperHeight,
        orientation: paperWidth > paperHeight ? 'landscape' : 'portrait',
        backgroundImage,
        imagePixelWidth,
        imagePixelHeight,
        imageAspectRatio,
        fields: fields.map(f => ({
          key: f.key,
          x: f.x,
          y: f.y,
          fontSize: f.fontSize,
          fontWeight: f.fontWeight,
          align: f.align,
          visible: f.visible,
          width: f.width
        }))
      };
      
      const res = await saveReceiptTemplate(data);
      if (res.success) {
        toast.success('Template saved successfully');
        if (res.data?._id) setTemplateId(res.data._id);
      } else {
        toast.error(res.error || 'Failed to save template');
      }
    } catch (err) {
      toast.error('An error occurred');
    } finally {
      setSaving(false);
    }
  };
  
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        const src = event.target.result as string;
        setBackgroundImage(src);
        
        // Detect image dimensions
        const img = new Image();
        img.onload = () => {
          const w = img.width;
          const h = img.height;
          const ratio = w / h;
          setImagePixelWidth(w);
          setImagePixelHeight(h);
          setImageAspectRatio(ratio);
          
          if (autoFit && paperWidth) {
            setPaperHeight(Number((paperWidth / ratio).toFixed(2)));
          }
        };
        img.src = src;
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    let offsetX = 0;
    let offsetY = 0;
    
    // Calculate grab offset to prevent jumping
    if (canvasRef.current) {
      const canvasRect = canvasRef.current.getBoundingClientRect();
      const targetRect = (e.target as HTMLElement).getBoundingClientRect();
      
      const scaleX = paperWidth / (canvasRect.width || 1);
      const scaleY = paperHeight / (canvasRect.height || 1);
      
      offsetX = (e.clientX - targetRect.left) * scaleX;
      offsetY = (e.clientY - targetRect.top) * scaleY;
    }
    
    // Store as JSON in text/plain for maximum browser compatibility
    e.dataTransfer.setData('text/plain', JSON.stringify({ id, offsetX, offsetY }));
    
    setSelectedFieldId(id);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!canvasRef.current) return;
    
    let dragData;
    try {
      const raw = e.dataTransfer.getData('text/plain');
      if (!raw) return;
      dragData = JSON.parse(raw);
    } catch (err) {
      console.error('Failed to parse drag data', err);
      return;
    }
    
    const { id, offsetX = 0, offsetY = 0 } = dragData;
    if (!id) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = paperWidth / (rect.width || 1);
    const scaleY = paperHeight / (rect.height || 1);
    
    // Calculate new position in mm, subtracting the grab offset
    let xMm = ((e.clientX - rect.left) * scaleX) - offsetX;
    let yMm = ((e.clientY - rect.top) * scaleY) - offsetY;
    
    // Clamp to canvas bounds (0 to paper dimensions)
    xMm = isNaN(xMm) ? 0 : Math.max(0, Math.min(xMm, paperWidth));
    yMm = isNaN(yMm) ? 0 : Math.max(0, Math.min(yMm, paperHeight));
    
    // Only update if it's already in the fields array
    const existingIndex = fields.findIndex(f => f._id === id || f.key === id);
    
    if (existingIndex >= 0) {
      setFields(fields.map(f => (f._id === id || f.key === id) ? { ...f, x: xMm, y: yMm } : f));
    } else {
      // Allow dropping from sidebar directly!
      const newField = {
        _id: Date.now().toString(),
        key: id,
        x: xMm,
        y: yMm,
        fontSize: 12,
        fontWeight: 'normal',
        align: 'left',
        visible: true
      };
      setFields([...fields, newField]);
      setSelectedFieldId(newField._id);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const selectedField = fields.find(f => (f._id === selectedFieldId || f.key === selectedFieldId));
  
  // Calculate rendering scale for the preview canvas to fit on screen
  // If A4 is 210x297mm, let's scale it so 1mm = some pixels. 
  // Let's force the canvas width to 100% of container and scale height proportionally.
  const canvasRatio = paperHeight / paperWidth;

  const handleTestPrint = () => {
    toast('Test Print feature coming soon. Please use actual inward list to test print.');
  };

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] overflow-hidden">
      <div className="flex gap-4 p-4 border-b bg-slate-50 items-center justify-between shrink-0">
        <div className="flex gap-4 items-center flex-wrap">
          <Select value={warehouseId} onValueChange={setWarehouseId}>
            <SelectTrigger className="w-[200px] bg-white">
              <SelectValue placeholder="Select Warehouse" />
            </SelectTrigger>
            <SelectContent>
              {warehouses.map(w => (
                <SelectItem key={w._id} value={w._id}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <div className="flex bg-slate-200 p-1 rounded-md mx-2">
            <button
              onClick={() => setReceiptType('inward')}
              className={`px-4 py-1.5 text-sm font-medium rounded-sm transition-colors ${receiptType === 'inward' ? 'bg-white text-slate-900 shadow' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Inward
            </button>
            <button
              onClick={() => setReceiptType('outward')}
              className={`px-4 py-1.5 text-sm font-medium rounded-sm transition-colors ${receiptType === 'outward' ? 'bg-white text-slate-900 shadow' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Outward
            </button>
            <button
              onClick={() => setReceiptType('invoice')}
              className={`px-4 py-1.5 text-sm font-medium rounded-sm transition-colors ${receiptType === 'invoice' ? 'bg-white text-slate-900 shadow' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Invoice
            </button>
          </div>
          
          <div className="h-6 w-px bg-slate-300 mx-2"></div>
          
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Width (mm):</span>
              <Input type="number" value={paperWidth} onChange={(e) => {
                const val = Number(e.target.value);
                setPaperWidth(val);
                if (autoFit && imageAspectRatio) {
                  setPaperHeight(Number((val / imageAspectRatio).toFixed(2)));
                }
              }} className="w-20 bg-white" />
            </div>
            {backgroundImage && (
              <label className="flex items-center gap-1 text-[10px] text-slate-500 cursor-pointer">
                <input type="checkbox" checked={autoFit} onChange={(e) => {
                  setAutoFit(e.target.checked);
                  if (e.target.checked && imageAspectRatio && paperWidth) {
                    setPaperHeight(Number((paperWidth / imageAspectRatio).toFixed(2)));
                  }
                }} />
                Auto-fit Ratio
              </label>
            )}
          </div>
          
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Height (mm):</span>
              <Input type="number" value={paperHeight} onChange={(e) => {
                const val = Number(e.target.value);
                setPaperHeight(val);
                setAutoFit(false);
              }} className="w-20 bg-white" />
            </div>
          </div>
          
          {!autoFit && imageAspectRatio && Math.abs((paperWidth / paperHeight) - imageAspectRatio) > 0.05 && (
            <div className="text-xs text-amber-600 font-medium px-2 py-1 bg-amber-50 rounded border border-amber-200">
              Ratio Mismatch
            </div>
          )}
        </div>
        
        <div className="flex gap-2 items-center">
          <Button variant="outline" onClick={handleTestPrint}>
            <Printer className="w-4 h-4 mr-2" />
            Test Print
          </Button>
          <Button onClick={handleSave} disabled={saving || !warehouseId || fields.length === 0}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Template
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Available Fields */}
        <div className="w-64 border-r bg-white p-4 overflow-y-auto shrink-0 flex flex-col gap-2 relative z-10">
          <h3 className="font-semibold text-sm text-slate-500 mb-2 uppercase">Available Fields</h3>
          <div className="space-y-1">
            {currentAvailableFields.map(field => {
              const isAdded = fields.some(f => f.key === field.key);
              return (
                <button
                  key={field.key}
                  onClick={() => handleAddField(field.key)}
                  disabled={isAdded}
                  className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
                    isAdded ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'hover:bg-indigo-50 hover:text-indigo-700 bg-white border border-slate-200 shadow-sm'
                  }`}
                >
                  {field.label}
                </button>
              );
            })}
          </div>
        </div>

          {/* Center - Canvas */}
        <div className="flex-1 bg-slate-200 overflow-auto p-4 md:p-8 relative">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
            </div>
          ) : (
            <div className="w-max mx-auto min-w-full flex justify-center items-start">
              <div 
                style={{
                  // The layout wrapper takes the exact scaled dimensions
                  width: `calc(${paperWidth}mm * ${Math.max(0.2, Math.min(1, 800 / ((paperWidth || 210) * 3.78)))})`,
                  height: `calc(${paperHeight}mm * ${Math.max(0.2, Math.min(1, 800 / ((paperWidth || 210) * 3.78)))})`,
                  flexShrink: 0,
                  position: 'relative'
                }}
              >
                <div 
                  style={{
                    // The inner element is unscaled in layout but visually scaled
                    transform: `scale(${Math.max(0.2, Math.min(1, 800 / ((paperWidth || 210) * 3.78)))})`,
                    transformOrigin: 'top left',
                    width: `${paperWidth}mm`,
                    height: `${paperHeight}mm`,
                    position: 'absolute',
                    top: 0,
                    left: 0
                  }}
                >
                  <div 
                    ref={canvasRef}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    className="bg-white shadow-xl relative w-full h-full"
                    style={{
                      backgroundImage: backgroundImage ? `url(${backgroundImage})` : 'none',
                      backgroundSize: '100% 100%',
                      backgroundPosition: 'center',
                      backgroundRepeat: 'no-repeat',
                    }}
                  >
                {fields.map((field) => (
                  <div
                    key={field._id || field.key}
                    draggable
                    onDragStart={(e) => handleDragStart(e, field._id || field.key)}
                    onClick={(e) => { e.stopPropagation(); setSelectedFieldId(field._id || field.key); }}
                    className={`absolute cursor-move border px-1 ${
                      selectedFieldId === (field._id || field.key) ? 'border-blue-500 bg-blue-50/80 ring-2 ring-blue-500' : 'border-dashed border-slate-400 bg-white/80 hover:border-slate-600'
                    }`}
                    style={{
                      left: `${field.x}mm`,
                      top: `${field.y}mm`,
                      fontSize: `${Math.max(8, field.fontSize)}pt`,
                      fontWeight: field.fontWeight,
                      textAlign: field.align as any,
                      width: field.width ? `${field.width}mm` : 'auto',
                      minWidth: '20mm',
                      display: field.visible ? 'block' : 'none',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    [{currentAvailableFields.find(f => f.key === field.key)?.label || field.key}]
                  </div>
                ))}
                
                {!backgroundImage && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
                    <span className="text-4xl font-bold text-slate-400 transform -rotate-45">PAPER CANVAS</span>
                  </div>
                )}
              </div>
            </div>
            </div>
            </div>
          )}
        </div>

        {/* Right Sidebar - Properties */}
        <div className="w-80 border-l bg-white p-4 overflow-y-auto shrink-0 flex flex-col gap-6 relative z-10">
          
          <div className="space-y-4">
            <h3 className="font-semibold text-sm text-slate-500 uppercase">Background Image</h3>
            <div className="space-y-2">
              {backgroundImage ? (
                <div className="relative border rounded-md p-1 bg-slate-50">
                  <img src={backgroundImage} alt="Background" className="w-full h-auto object-contain max-h-32" />
                  
                  {imagePixelWidth && imagePixelHeight && (
                    <div className="mt-2 text-xs text-slate-600 bg-white p-2 rounded border border-slate-200">
                      <div className="font-medium text-slate-700 mb-1">Detected Dimensions:</div>
                      <div>Pixels: {imagePixelWidth}px × {imagePixelHeight}px</div>
                      <div>Aspect Ratio: {imageAspectRatio?.toFixed(3)}</div>
                    </div>
                  )}
                  
                  <Button variant="destructive" size="sm" className="w-full mt-2" onClick={() => {
                    setBackgroundImage('');
                    setImagePixelWidth(undefined);
                    setImagePixelHeight(undefined);
                    setImageAspectRatio(undefined);
                  }}>
                    Remove Image
                  </Button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer bg-slate-50 hover:bg-slate-100">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <UploadCloud className="w-8 h-8 text-slate-400 mb-2" />
                    <p className="text-sm text-slate-500">Upload Pre-printed Receipt</p>
                  </div>
                  <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                </label>
              )}
              <p className="text-xs text-slate-500">Image is used as a reference for dragging fields and will not be printed.</p>
            </div>
          </div>

          <hr />

          <div className="space-y-4">
            <h3 className="font-semibold text-sm text-slate-500 uppercase">Field Properties</h3>
            {selectedField ? (
              <div className="space-y-4">
                <div className="font-medium px-3 py-2 bg-indigo-50 text-indigo-700 rounded-md">
                  {currentAvailableFields.find(f => f.key === selectedField.key)?.label || selectedField.key}
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">X (mm)</label>
                    <Input type="number" value={selectedField.x.toFixed(1)} onChange={(e) => updateSelectedField({ x: Number(e.target.value) })} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Y (mm)</label>
                    <Input type="number" value={selectedField.y.toFixed(1)} onChange={(e) => updateSelectedField({ y: Number(e.target.value) })} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Width (mm)</label>
                    <Input type="number" value={selectedField.width || ''} placeholder="Auto" onChange={(e) => updateSelectedField({ width: e.target.value ? Number(e.target.value) : undefined })} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Font Size (pt)</label>
                    <Input type="number" value={selectedField.fontSize} onChange={(e) => updateSelectedField({ fontSize: Number(e.target.value) })} />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium">Alignment</label>
                  <Select value={selectedField.align} onValueChange={(v) => updateSelectedField({ align: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="left">Left</SelectItem>
                      <SelectItem value="center">Center</SelectItem>
                      <SelectItem value="right">Right</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium">Font Weight</label>
                  <Select value={selectedField.fontWeight} onValueChange={(v) => updateSelectedField({ fontWeight: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="bold">Bold</SelectItem>
                      <SelectItem value="bolder">Bolder</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button variant="destructive" className="w-full" onClick={() => handleRemoveField(selectedField._id || selectedField.key)}>
                  <Trash2 className="w-4 h-4 mr-2" /> Remove Field
                </Button>
              </div>
            ) : (
              <div className="p-4 border border-dashed rounded-md text-center text-sm text-slate-500">
                Click a field on the canvas to edit its properties.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
