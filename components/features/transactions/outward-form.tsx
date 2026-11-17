'use client';

import React, { useEffect, useState, useTransition, useRef, useId } from 'react';
import { useForm, useWatch, Controller, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { processOutward, getStockBalance } from '@/app/actions/transaction-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'react-hot-toast';
import { Loader2, ArrowUpFromLine, RefreshCcw, ChevronDown, ChevronUp, FileText, Scale, Camera, Trash2, Upload, ImageIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useSession } from 'next-auth/react';
import { getDropdownDisplayName } from '@/lib/utils';
import OutwardReceiptSuccessDialog, { OutwardReceiptDialogData } from './outward-receipt-success-dialog';

const compressImageFile = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Selected file must be an image'));
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_DIM = 1000;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_DIM) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          }
        } else {
          if (height > MAX_DIM) {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('Failed to load image for compression'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
};

const outwardSchema = z.object({
  clientId: z.string().min(1, 'Client is required'),
  commodityId: z.string().min(1, 'Commodity is required'),
  warehouseId: z.string().min(1, 'Warehouse is required'),
  quantityMT: z.coerce.number().positive('Withdrawal quantity must be greater than 0'),
  bagsCount: z.preprocess((value) => {
    if (value === '' || value === undefined || value === null) return undefined;
    return Number(value);
  }, z.number().min(0, 'Bags count cannot be negative')).optional(),
  stackNo: z.string().optional(),
  lotNo: z.string().optional(),
  gatePass: z.string().optional(),
  partyName: z.string().optional(),
  packagingMaterial: z.string().optional(),
  packagingSize: z.string().optional(),
  gslNo: z.string().optional(),
  actualWeight: z.preprocess((value) => {
    if (value === '' || value === undefined || value === null) return undefined;
    return Number(value);
  }, z.number().min(0, 'Actual weight cannot be negative')).optional(),
  date: z.string().min(1, 'Date is required'),
  vehicleNumber: z.string().optional(),
  agentName: z.string().optional(),
  authorityPerson: z.string().optional(),
  variety: z.string().optional(),
  rsnNo: z.string().optional(),
  weighbridgeNameAddress: z.string().optional(),
  inTime: z.string().optional(),
  outTime: z.string().optional(),
  transportCharges: z.coerce.number().min(0, 'Cannot be negative').optional(),
  grossWeight: z.coerce.number().optional(),
  tareWeight: z.coerce.number().optional(),
  netWeight: z.coerce.number().optional(),
  grossWeightDate: z.string().optional(),
  tareWeightDate: z.string().optional(),
  grossWeightImages: z.array(z.string()).optional(),
  tareWeightImages: z.array(z.string()).optional(),
  moisture: z.string().optional(),
  deliveryOrderNo: z.string().optional(),
  idProofNo: z.string().optional(),
  notes: z.string().optional(),
});

type OutwardFormValues = z.infer<typeof outwardSchema>;

interface OutwardFormProps {
  clients: any[];
  commodities: any[];
  warehouses: any[];
  onSuccess?: () => void;
}

export default function OutwardForm({ clients, commodities, warehouses, onSuccess }: OutwardFormProps) {
  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.role === 'ADMIN';
  const [isPending, startTransition] = useTransition();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [checkingStock, setCheckingStock] = useState(false);
  const [currentStock, setCurrentStock] = useState<number | null>(null);
  const [showReceiptDetails, setShowReceiptDetails] = useState(false);
  const [showWeighmentDetails, setShowWeighmentDetails] = useState(false);
  const [grossImages, setGrossImages] = useState<string[]>(['', '']);
  const [tareImages, setTareImages] = useState<string[]>(['', '']);
  const [successReceiptData, setSuccessReceiptData] = useState<OutwardReceiptDialogData | null>(null);
  const [showReceiptDialog, setShowReceiptDialog] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Hydration-safe IDs
  const clientIdId = useId();
  const commodityIdId = useId();
  const warehouseIdId = useId();
  const quantityId = useId();
  const bagsCountId = useId();
  const stackNoId = useId();
  const lotNoId = useId();
  const gatePassId = useId();
  const partyNameId = useId();
  const actualWeightId = useId();
  const dateId = useId();

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
    reset,
  } = useForm<OutwardFormValues>({
    resolver: zodResolver(outwardSchema) as Resolver<OutwardFormValues>,
    defaultValues: {
      clientId: searchParams.get('clientId') || '',
      commodityId: searchParams.get('commodityId') || '',
      warehouseId: searchParams.get('warehouseId') || '',
      quantityMT: undefined,
      bagsCount: undefined,
      stackNo: '',
      lotNo: '',
      gatePass: '',
      partyName: '',
      packagingMaterial: '',
      packagingSize: '',
      gslNo: '',
      actualWeight: undefined,
      date: searchParams.get('date') || new Date().toISOString().split('T')[0],
      vehicleNumber: '',
      agentName: 'SELF',
      authorityPerson: '',
      variety: '',
      rsnNo: '',
      weighbridgeNameAddress: '',
      inTime: '',
      outTime: '',
      transportCharges: undefined,
      grossWeight: undefined,
      tareWeight: undefined,
      netWeight: undefined,
      grossWeightDate: '',
      tareWeightDate: '',
      grossWeightImages: [],
      tareWeightImages: [],
      moisture: '',
      deliveryOrderNo: '',
      idProofNo: '',
      notes: '',
    },
  });

  const watchedValues = useWatch({ control });

  const selectedClient = clients.find(client => client._id?.toString() === watchedValues.clientId);
  const allowedCommodities = selectedClient?.commodityIds?.length
    ? commodities.filter(commodity => selectedClient.commodityIds?.includes(commodity._id?.toString?.() || commodity._id))
    : commodities;

  useEffect(() => {
    if (!watchedValues.clientId || !watchedValues.commodityId || !selectedClient?.commodityIds?.length) {
      return;
    }

    if (!selectedClient.commodityIds.includes(watchedValues.commodityId)) {
      setValue('commodityId', '');
    }
  }, [watchedValues.clientId, watchedValues.commodityId, selectedClient?.commodityIds, setValue]);

  useEffect(() => {
    if (watchedValues.commodityId) {
      const selectedCommodity = commodities.find(
        (c) => (c._id?.toString?.() || c._id) === watchedValues.commodityId
      );
      if (selectedCommodity) {
        setValue('variety', selectedCommodity.variety || '');
      }
    }
  }, [watchedValues.commodityId, commodities, setValue]);

  const reportUrl = React.useMemo(() => {
    const clientName = clients.find(c => c._id === watchedValues.clientId)?.name;
    const commodityName = commodities.find(c => c._id === watchedValues.commodityId)?.name;
    const warehouseName = warehouses.find(w => w._id === watchedValues.warehouseId)?.name;
    const date = watchedValues.date;

    if (!clientName || !commodityName || !warehouseName || !date) return null;

    const params = new URLSearchParams();
    params.set('direction', 'OUTWARD');
    params.set('clientName', clientName);
    params.set('commodity', commodityName);
    params.set('warehouse', warehouseName);
    params.set('startDate', date);
    params.set('endDate', date);

    return `/dashboard/reports?${params.toString()}`;
  }, [watchedValues.clientId, watchedValues.commodityId, watchedValues.warehouseId, watchedValues.date, clients, commodities, warehouses]);


  // Automatically check stock when client/commodity/warehouse changes
  useEffect(() => {
    const { clientId, commodityId, warehouseId } = watchedValues;
    if (clientId && commodityId && warehouseId) {
      handleCheckStock(clientId, commodityId, warehouseId);
    } else {
      setCurrentStock(null);
    }
  }, [watchedValues.clientId, watchedValues.commodityId, watchedValues.warehouseId]);

  const handleCheckStock = async (cId: string, cmId: string, wId: string) => {
    setCheckingStock(true);
    try {
      const balance = await getStockBalance(cId, cmId, wId);
      setCurrentStock(balance);
    } catch (err) {
      toast.error('Failed to check stock balance');
    } finally {
      setCheckingStock(false);
    }
  };

  // Auto-calculate Net Weight (Gross - Tare)
  useEffect(() => {
    const gw = watchedValues.grossWeight;
    const tw = watchedValues.tareWeight;
    if (gw !== undefined && tw !== undefined && !isNaN(gw) && !isNaN(tw)) {
      setValue('netWeight', Math.max(0, gw - tw));
    }
  }, [watchedValues.grossWeight, watchedValues.tareWeight, setValue]);

  const handleImageUpload = async (type: 'gross' | 'tare', index: 0 | 1, file: File) => {
    try {
      const compressed = await compressImageFile(file);
      if (type === 'gross') {
        const next = [...grossImages];
        next[index] = compressed;
        setGrossImages(next);
        setValue('grossWeightImages', next);
      } else {
        const next = [...tareImages];
        next[index] = compressed;
        setTareImages(next);
        setValue('tareWeightImages', next);
      }
      toast.success(`${type === 'gross' ? '1st' : '2nd'} Weightment Image ${index + 1} uploaded`);
    } catch (err: any) {
      toast.error(err?.message || 'Error uploading image');
    }
  };

  const handleRemoveImage = (type: 'gross' | 'tare', index: 0 | 1) => {
    if (type === 'gross') {
      const next = [...grossImages];
      next[index] = '';
      setGrossImages(next);
      setValue('grossWeightImages', next.filter(Boolean));
    } else {
      const next = [...tareImages];
      next[index] = '';
      setTareImages(next);
      setValue('tareWeightImages', next.filter(Boolean));
    }
  };

  const onSubmit = async (data: OutwardFormValues) => {
    if (data.quantityMT <= 0) {
      toast.error('Withdrawal quantity must be greater than zero');
      return;
    }

    if (currentStock !== null && data.quantityMT > currentStock) {
      toast.error(`Insufficient stock. Max available: ${currentStock} MT`);
      return;
    }

    if (submittingRef.current || isSubmitting) return;
    submittingRef.current = true;
    setIsSubmitting(true);

    startTransition(async () => {
      try {
        const res = await processOutward({
          clientId: data.clientId,
          commodityId: data.commodityId,
          warehouseId: data.warehouseId,
          quantityMT: data.quantityMT,
          actualWeight: data.actualWeight,
          netWeightLoss: data.actualWeight !== undefined && data.actualWeight !== null ? Number((data.quantityMT - data.actualWeight).toFixed(2)) : undefined,
          bagsCount: data.bagsCount,
          stackNo: data.stackNo,
          lotNo: data.lotNo,
          gatePass: data.gatePass,
          partyName: data.partyName,
          packagingMaterial: data.packagingMaterial,
          packagingSize: data.packagingSize,
          gslNo: data.gslNo,
          date: data.date,
          vehicleNumber: data.vehicleNumber,
          agentName: data.agentName,
          authorityPerson: data.authorityPerson,
          variety: data.variety,
          rsnNo: data.rsnNo,
          weighbridgeNameAddress: data.weighbridgeNameAddress,
          inTime: data.inTime,
          outTime: data.outTime,
          transportCharges: data.transportCharges,
          grossWeight: data.grossWeight,
          tareWeight: data.tareWeight,
          netWeight: data.netWeight,
          grossWeightDate: data.grossWeightDate || data.date,
          tareWeightDate: data.tareWeightDate || data.date,
          grossWeightImages: grossImages.filter(Boolean),
          tareWeightImages: tareImages.filter(Boolean),
          moisture: data.moisture,
          deliveryOrderNo: data.deliveryOrderNo,
          idProofNo: data.idProofNo,
          notes: data.notes,
        });

        console.log('[OutwardForm] processOutward response', res);

        if (res.success) {
          toast.success('Outward Transaction Recorded');

          if (res.receipts) {
            const selectedCommodity = commodities.find(c => (c._id?.toString?.() || c._id) === data.commodityId);
            const selectedWarehouse = warehouses.find(w => (w._id?.toString?.() || w._id) === data.warehouseId);

            setSuccessReceiptData({
              outwardId: res.data._id,
              dailyReportSrNo: res.receipts.dailyReportSrNo,
              gatePassNo: res.receipts.gatePassNo,
              clientName: selectedClient?.name,
              commodityName: selectedCommodity?.name,
              warehouseName: selectedWarehouse?.name,
              bagsCount: data.bagsCount,
              quantityMT: data.quantityMT,
              vehicleNumber: data.vehicleNumber,
              transportCharges: data.transportCharges,
              netWeight: data.netWeight,
            });
            setShowReceiptDialog(true);
          }

          reset({
            clientId: '',
            commodityId: '',
            warehouseId: '',
            quantityMT: undefined,
            bagsCount: undefined,
            stackNo: '',
            lotNo: '',
            gatePass: '',
            partyName: '',
            packagingMaterial: '',
            packagingSize: '',
            gslNo: '',
            actualWeight: undefined,
            date: new Date().toISOString().split('T')[0],
            vehicleNumber: '',
            agentName: 'SELF',
            authorityPerson: '',
            variety: '',
            rsnNo: '',
            weighbridgeNameAddress: '',
            inTime: '',
            outTime: '',
            transportCharges: undefined,
            grossWeight: undefined,
            tareWeight: undefined,
            netWeight: undefined,
            grossWeightDate: '',
            tareWeightDate: '',
            grossWeightImages: [],
            tareWeightImages: [],
            moisture: '',
            deliveryOrderNo: '',
            idProofNo: '',
            notes: '',
          });

          setGrossImages(['', '']);
          setTareImages(['', '']);

          router.refresh();
          onSuccess?.();
        } else {
          console.warn('Outward form server response error:', res.error);
          toast.error(res.error || 'Failed to process outward');
        }
      } catch (err: any) {
        console.error('Outward Error:', err);
        toast.error('Internal Server Error: ' + err.message);
      } finally {
        setIsSubmitting(false);
        submittingRef.current = false;
      }
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 bg-white p-6 border rounded-xl shadow-sm">
      <div className="flex items-center gap-2 border-b pb-4">
        <ArrowUpFromLine className="h-5 w-5 text-orange-600" />
        <h3 className="font-bold text-lg text-slate-900">Stock Withdrawal (Outward)</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label htmlFor={clientIdId} className="text-sm font-semibold text-slate-700">Client Name *</label>
          <Controller
            name="clientId"
            control={control}
            render={({ field }) => (
              <Select onValueChange={field.onChange} value={field.value}>
                <SelectTrigger id={clientIdId} name="clientId" className={errors.clientId ? 'border-red-500' : ''}>
                  <SelectValue placeholder="Search Client..." />
                </SelectTrigger>
                <SelectContent>
                  {clients && clients.length > 0 ? (
                    clients.filter(c => c && c._id && c.name).map(c => (
                      <SelectItem key={c._id.toString()} value={c._id.toString()}>
                        {getDropdownDisplayName(c, clients, isAdmin)}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="none" disabled>No clients available</SelectItem>
                  )}
                </SelectContent>
              </Select>
            )}
          />
          {errors.clientId && <p className="text-xs text-red-500">{errors.clientId.message}</p>}
        </div>

        <div className="space-y-2">
          <label htmlFor={commodityIdId} className="text-sm font-semibold text-slate-700">Commodity *</label>
          <Controller
            name="commodityId"
            control={control}
            render={({ field }) => (
              <Select onValueChange={field.onChange} value={field.value}>
                <SelectTrigger id={commodityIdId} name="commodityId" className={errors.commodityId ? 'border-red-500' : ''}>
                  <SelectValue placeholder="Search Commodity..." />
                </SelectTrigger>
                <SelectContent>
                  {allowedCommodities && allowedCommodities.length > 0 ? (
                    allowedCommodities.filter(c => c && c._id && c.name).map(c => (
                      <SelectItem key={c._id.toString()} value={c._id.toString()}>
                        {getDropdownDisplayName(c, allowedCommodities, isAdmin)}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="none" disabled>No commodities available</SelectItem>
                  )}
                </SelectContent>
              </Select>
            )}
          />
          {selectedClient?.commodityIds?.length ? (
            <p className="text-xs text-slate-500 mt-1">Showing commodities assigned to {selectedClient.name}.</p>
          ) : null}
          {errors.commodityId && <p className="text-xs text-red-500">{errors.commodityId.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-2">
          <label htmlFor={warehouseIdId} className="text-sm font-semibold text-slate-700">Warehouse *</label>
          <Controller
            name="warehouseId"
            control={control}
            render={({ field }) => (
              <Select onValueChange={field.onChange} value={field.value}>
                <SelectTrigger id={warehouseIdId} name="warehouseId" className={errors.warehouseId ? 'border-red-500' : ''}>
                  <SelectValue placeholder="Select Warehouse..." />
                </SelectTrigger>
                <SelectContent>
                  {warehouses && warehouses.length > 0 ? (
                    warehouses.filter(w => w && w._id && w.name && (w.status === 'ACTIVE' || w.status === 'FULL')).map(w => (
                      <SelectItem key={w._id.toString()} value={w._id.toString()}>
                        {w.name}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="none" disabled>No warehouses available</SelectItem>
                  )}
                </SelectContent>
              </Select>
            )}
          />
          {errors.warehouseId && <p className="text-xs text-red-500">{errors.warehouseId.message}</p>}
        </div>

        <div className="space-y-2">
          <label htmlFor={quantityId} className="text-sm font-semibold text-slate-700 flex justify-between items-center">
            Withdrawal Quantity (MT) *
            <div className="flex items-center gap-2">
              {checkingStock && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
              {currentStock !== null && (
                <Badge variant={currentStock > 0 ? 'secondary' : 'destructive'} className="text-[10px] py-0">
                  Max: {currentStock.toFixed(2)} MT
                </Badge>
              )}
            </div>
          </label>
          <Controller
            name="quantityMT"
            control={control}
            render={({ field }) => (
              <Input
                id={quantityId}
                name="quantityMT"
                type="number"
                step="0.01"
                placeholder="0.00"
                className={errors.quantityMT ? 'border-red-500' : ''}
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))}
              />
            )}
          />
          {errors.quantityMT && <p className="text-xs text-red-500">{errors.quantityMT.message}</p>}
        </div>

        <div className="space-y-2">
          <label htmlFor={bagsCountId} className="text-sm font-semibold text-slate-700">No. of Bags</label>
          <Controller
            name="bagsCount"
            control={control}
            render={({ field }) => (
              <Input
                id={bagsCountId}
                name="bagsCount"
                type="number"
                step="1"
                placeholder="Enter number of bags"
                className={errors.bagsCount ? 'border-red-500' : ''}
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))}
              />
            )}
          />
          {errors.bagsCount && <p className="text-xs text-red-500">{errors.bagsCount.message}</p>}
        </div>

        <div className="space-y-2">
          <label htmlFor={dateId} className="text-sm font-semibold text-slate-700">Withdrawal Date *</label>
          <Input
            id={dateId}
            {...register('date')}
            type="date"
          />
          {errors.date && <p className="text-xs text-red-500">{errors.date.message}</p>}
        </div>

        <div className="space-y-2">
          <label htmlFor={partyNameId} className="text-sm font-semibold text-slate-700">Party Name</label>
          <Input
            id={partyNameId}
            {...register('partyName')}
            type="text"
            placeholder="Enter party name"
          />
          {errors.partyName && <p className="text-xs text-red-500">{errors.partyName.message}</p>}
        </div>

        <div className="space-y-2">
          <label htmlFor="vehicleNumber" className="text-sm font-semibold text-slate-700">Vehicle Number</label>
          <Input
            id="vehicleNumber"
            {...register('vehicleNumber')}
            type="text"
            placeholder="e.g., GJ-03-AB-1234"
          />
          {errors.vehicleNumber && <p className="text-xs text-red-500">{errors.vehicleNumber.message}</p>}
        </div>

        <div className="space-y-2">
          <label htmlFor="transportCharges" className="text-sm font-semibold text-slate-700">Transport Charges (₹)</label>
          <Controller
            name="transportCharges"
            control={control}
            render={({ field }) => (
              <Input
                id="transportCharges"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))}
              />
            )}
          />
          {errors.transportCharges && <p className="text-xs text-red-500">{errors.transportCharges.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label htmlFor={actualWeightId} className="text-sm font-semibold text-slate-700">Actual Weight (MT)</label>
          <Controller
            name="actualWeight"
            control={control}
            render={({ field }) => (
              <Input
                id={actualWeightId}
                name="actualWeight"
                type="number"
                step="0.01"
                placeholder="0.00"
                className={errors.actualWeight ? 'border-red-500' : ''}
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))}
              />
            )}
          />
          {errors.actualWeight && <p className="text-xs text-red-500">{errors.actualWeight.message}</p>}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700">Net Weight Loss/Gain (MT)</label>
          <Input
            type="text"
            readOnly
            disabled
            value={watchedValues.quantityMT !== undefined && watchedValues.actualWeight !== undefined ? (watchedValues.quantityMT - watchedValues.actualWeight).toFixed(2) : ''}
            placeholder="Auto-calculated"
            className="bg-slate-50 text-slate-600"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-2">
          <label htmlFor={stackNoId} className="text-sm font-semibold text-slate-700">Stack No</label>
          <Input
            id={stackNoId}
            {...register('stackNo')}
            type="text"
            placeholder="Enter stack number"
          />
          {errors.stackNo && <p className="text-xs text-red-500">{errors.stackNo.message}</p>}
        </div>

        <div className="space-y-2">
          <label htmlFor={lotNoId} className="text-sm font-semibold text-slate-700">Lot No</label>
          <Input
            id={lotNoId}
            {...register('lotNo')}
            type="text"
            placeholder="Enter lot number"
          />
          {errors.lotNo && <p className="text-xs text-red-500">{errors.lotNo.message}</p>}
        </div>

        <div className="space-y-2">
          <label htmlFor={gatePassId} className="text-sm font-semibold text-slate-700">Gate Pass</label>
          <Input
            id={gatePassId}
            {...register('gatePass')}
            type="text"
            placeholder="Enter gate pass"
          />
          {errors.gatePass && <p className="text-xs text-red-500">{errors.gatePass.message}</p>}
        </div>

      </div>

      {/* Collapsible Weighment & Weight Slip Section */}
      <div className="border-t pt-4">
        <button
          type="button"
          className="flex items-center justify-between w-full py-2 text-left group"
          onClick={() => setShowWeighmentDetails(!showWeighmentDetails)}
        >
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-emerald-600" />
            <div>
              <span className="text-sm font-bold text-slate-900 group-hover:text-emerald-600 transition-colors">
                Weighment Slip Details &amp; Images (Optional)
              </span>
              <span className="text-xs text-slate-500 ml-2">
                1st &amp; 2nd weighment truck weights, dates, and exactly 2 scale photos each
              </span>
            </div>
          </div>
          {showWeighmentDetails ? (
            <ChevronUp className="w-4 h-4 text-slate-400 group-hover:text-slate-600" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-slate-600" />
          )}
        </button>

        {showWeighmentDetails && (
          <div className="mt-4 p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* 1st Weightment (Gross Truck Weight) */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">1</span>
                    <h5 className="font-bold text-sm text-slate-900">1st Weightment (Gross Weight)</h5>
                  </div>
                  <span className="text-xs font-semibold text-slate-500">Gross Truck Weight</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label htmlFor="grossWeight" className="text-xs font-semibold text-slate-700">Gross Weight (KG)</label>
                    <Controller
                      name="grossWeight"
                      control={control}
                      render={({ field }) => (
                        <Input 
                          id="grossWeight"
                          type="number"
                          placeholder="e.g., 26955"
                          className="bg-white text-xs h-9"
                          value={field.value ?? ''}
                          onChange={(e) => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))}
                        />
                      )}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="grossWeightDate" className="text-xs font-semibold text-slate-700">1st Weightment Date</label>
                    <Input 
                      id="grossWeightDate"
                      type="date"
                      className="bg-white text-xs h-9"
                      {...register('grossWeightDate')}
                    />
                  </div>
                </div>

                {/* Exactly 2 Gross Weight Images */}
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-slate-700 block">Gross Weight Photos (2 Images)</span>
                  <div className="grid grid-cols-2 gap-3">
                    {[0, 1].map((idx) => {
                      const img = grossImages[idx];
                      return (
                        <div key={idx} className="relative">
                          {img ? (
                            <div className="relative group rounded-lg overflow-hidden border border-slate-200 bg-slate-100 h-24 flex items-center justify-center">
                              <img src={img} alt={`Gross ${idx + 1}`} className="w-full h-full object-cover" />
                              <button
                                type="button"
                                onClick={() => handleRemoveImage('gross', idx as 0 | 1)}
                                className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded-full opacity-90 hover:opacity-100 transition-opacity"
                                title="Remove image"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                              <span className="absolute bottom-1 left-1 bg-slate-900/80 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                                Image {idx + 1}
                              </span>
                            </div>
                          ) : (
                            <label className="border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-lg h-24 flex flex-col items-center justify-center cursor-pointer bg-white hover:bg-emerald-50/40 transition-colors p-2 text-center">
                              <Camera className="w-5 h-5 text-slate-400 mb-1" />
                              <span className="text-[11px] font-bold text-slate-700">Upload Image {idx + 1}</span>
                              <span className="text-[9px] text-slate-400">Scale photo</span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleImageUpload('gross', idx as 0 | 1, file);
                                }}
                              />
                            </label>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* 2nd Weightment (Tare Truck Weight) */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-700 text-xs font-bold">2</span>
                    <h5 className="font-bold text-sm text-slate-900">2nd Weightment (Tare Weight)</h5>
                  </div>
                  <span className="text-xs font-semibold text-slate-500">Tare Truck Weight</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label htmlFor="tareWeight" className="text-xs font-semibold text-slate-700">Tare Weight (KG)</label>
                    <Controller
                      name="tareWeight"
                      control={control}
                      render={({ field }) => (
                        <Input 
                          id="tareWeight"
                          type="number"
                          placeholder="e.g., 7480"
                          className="bg-white text-xs h-9"
                          value={field.value ?? ''}
                          onChange={(e) => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))}
                        />
                      )}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="tareWeightDate" className="text-xs font-semibold text-slate-700">2nd Weightment Date</label>
                    <Input 
                      id="tareWeightDate"
                      type="date"
                      className="bg-white text-xs h-9"
                      {...register('tareWeightDate')}
                    />
                  </div>
                </div>

                {/* Exactly 2 Tare Weight Images */}
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-slate-700 block">Tare Weight Photos (2 Images)</span>
                  <div className="grid grid-cols-2 gap-3">
                    {[0, 1].map((idx) => {
                      const img = tareImages[idx];
                      return (
                        <div key={idx} className="relative">
                          {img ? (
                            <div className="relative group rounded-lg overflow-hidden border border-slate-200 bg-slate-100 h-24 flex items-center justify-center">
                              <img src={img} alt={`Tare ${idx + 1}`} className="w-full h-full object-cover" />
                              <button
                                type="button"
                                onClick={() => handleRemoveImage('tare', idx as 0 | 1)}
                                className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded-full opacity-90 hover:opacity-100 transition-opacity"
                                title="Remove image"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                              <span className="absolute bottom-1 left-1 bg-slate-900/80 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                                Image {idx + 1}
                              </span>
                            </div>
                          ) : (
                            <label className="border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-lg h-24 flex flex-col items-center justify-center cursor-pointer bg-white hover:bg-emerald-50/40 transition-colors p-2 text-center">
                              <Camera className="w-5 h-5 text-slate-400 mb-1" />
                              <span className="text-[11px] font-bold text-slate-700">Upload Image {idx + 1}</span>
                              <span className="text-[9px] text-slate-400">Scale photo</span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleImageUpload('tare', idx as 0 | 1, file);
                                }}
                              />
                            </label>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Net Weight Auto-Calculated Banner */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-black text-emerald-900 uppercase tracking-wider block">
                  Calculated Net Weight (Gross − Tare)
                </span>
                <span className="text-xs text-emerald-700">
                  {watchedValues.grossWeight && watchedValues.tareWeight
                    ? `${watchedValues.grossWeight} KG − ${watchedValues.tareWeight} KG`
                    : 'Automatically calculated when Gross Weight and Tare Weight are entered.'}
                </span>
              </div>
              <div className="text-right">
                <span className="text-2xl font-black text-emerald-800 block">
                  {watchedValues.grossWeight && watchedValues.tareWeight
                    ? `${Math.max(0, watchedValues.grossWeight - watchedValues.tareWeight).toLocaleString('en-IN')} KG`
                    : '0 KG'}
                </span>
                {watchedValues.grossWeight && watchedValues.tareWeight ? (
                  <span className="text-xs font-bold text-emerald-600">
                    ({(Math.max(0, watchedValues.grossWeight - watchedValues.tareWeight) / 1000).toFixed(2)} MT)
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Collapsible Receipt Details Section */}
      <div className="border-t pt-4">
        <button
          type="button"
          className="flex items-center justify-between w-full py-2 text-left group"
          onClick={() => setShowReceiptDetails(!showReceiptDetails)}
        >
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-orange-600" />
            <div>
              <span className="text-sm font-bold text-slate-900 group-hover:text-orange-600 transition-colors">
                Receipt &amp; Gate Pass Details (Optional)
              </span>
              <span className="text-xs text-slate-500 ml-2">
                Add truck number, packaging, weighbridge, and timing details for withdrawal receipts
              </span>
            </div>
          </div>
          {showReceiptDetails ? (
            <ChevronUp className="w-4 h-4 text-slate-400 group-hover:text-slate-600" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-slate-600" />
          )}
        </button>

        {showReceiptDetails && (
          <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="vehicleNumber" className="text-xs font-semibold text-slate-700">Truck / Vehicle No.</label>
                <Input 
                  id="vehicleNumber"
                  {...register('vehicleNumber')}
                  placeholder="e.g., GJ-03-AB-1234"
                  className="bg-white text-xs h-9"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="agentName" className="text-xs font-semibold text-slate-700">Agent Name</label>
                <Input 
                  id="agentName"
                  {...register('agentName')}
                  placeholder="e.g., SELF"
                  className="bg-white text-xs h-9"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="authorityPerson" className="text-xs font-semibold text-slate-700">Authority Person</label>
                <Input 
                  id="authorityPerson"
                  {...register('authorityPerson')}
                  placeholder="e.g., Ashwinbhai"
                  className="bg-white text-xs h-9"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="variety" className="text-xs font-semibold text-slate-700">Variety</label>
                <Input 
                  id="variety"
                  {...register('variety')}
                  placeholder="e.g., Lokwan"
                  className="bg-white text-xs h-9"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="packagingMaterial" className="text-xs font-semibold text-slate-700">Packaging Material</label>
                <Input 
                  id="packagingMaterial"
                  {...register('packagingMaterial')}
                  placeholder="e.g., PP Bag, Jute Bag"
                  className="bg-white text-xs h-9"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="packagingSize" className="text-xs font-semibold text-slate-700">Packaging Size</label>
                <Input 
                  id="packagingSize"
                  {...register('packagingSize')}
                  placeholder="e.g., 50 kg"
                  className="bg-white text-xs h-9"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="inTime" className="text-xs font-semibold text-slate-700">In Time</label>
                <Input 
                  id="inTime"
                  {...register('inTime')}
                  placeholder="e.g., 1:56 PM"
                  className="bg-white text-xs h-9"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="outTime" className="text-xs font-semibold text-slate-700">Out Time</label>
                <Input 
                  id="outTime"
                  {...register('outTime')}
                  placeholder="e.g., 4:56 PM"
                  className="bg-white text-xs h-9"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="moisture" className="text-xs font-semibold text-slate-700">Moisture (%)</label>
                <Input 
                  id="moisture"
                  {...register('moisture')}
                  placeholder="e.g., 11.2%"
                  className="bg-white text-xs h-9"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="gslNo" className="text-xs font-semibold text-slate-700">GSL Number</label>
                <Input 
                  id="gslNo"
                  {...register('gslNo')}
                  placeholder="e.g., 51211"
                  className="bg-white text-xs h-9"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="rsnNo" className="text-xs font-semibold text-slate-700">RSN / RST Number</label>
                <Input 
                  id="rsnNo"
                  {...register('rsnNo')}
                  placeholder="e.g., 13082"
                  className="bg-white text-xs h-9"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="idProofNo" className="text-xs font-semibold text-slate-700">ID Proof Number / Mobile</label>
                <Input 
                  id="idProofNo"
                  {...register('idProofNo')}
                  placeholder="e.g., 9638253590"
                  className="bg-white text-xs h-9"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="weighbridgeNameAddress" className="text-xs font-semibold text-slate-700">Weighbridge Name / Address</label>
                <Input 
                  id="weighbridgeNameAddress"
                  {...register('weighbridgeNameAddress')}
                  placeholder="e.g., Aum Shiv W/B, Gondal"
                  className="bg-white text-xs h-9"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="deliveryOrderNo" className="text-xs font-semibold text-slate-700">Delivery Order No. &amp; Date</label>
                <Input 
                  id="deliveryOrderNo"
                  {...register('deliveryOrderNo')}
                  placeholder="e.g., DO-1002 / 16-03-2026"
                  className="bg-white text-xs h-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="notes" className="text-xs font-semibold text-slate-700">Remarks / Notes</label>
              <Input 
                id="notes"
                {...register('notes')}
                placeholder="Additional notes for receipts"
                className="bg-white text-xs h-9"
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-4 pt-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1 border-slate-200"
          onClick={() => {
            const { clientId, commodityId, warehouseId } = watchedValues;
            if (clientId && commodityId && warehouseId) handleCheckStock(clientId, commodityId, warehouseId);
          }}
          disabled={checkingStock}
        >
          <RefreshCcw className={`mr-2 h-4 w-4 ${checkingStock ? 'animate-spin' : ''}`} /> Sync Balance
        </Button>
        <Button
          type="submit"
          className="flex-[2] bg-orange-600 hover:bg-orange-700 text-white font-bold h-10"
          disabled={isPending || isSubmitting || checkingStock || (currentStock !== null && currentStock <= 0)}
        >
          {isSubmitting || isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing Withdrawal...</> : 'Confirm Withdrawal'}
        </Button>
      </div>

      <OutwardReceiptSuccessDialog
        isOpen={showReceiptDialog}
        onClose={() => setShowReceiptDialog(false)}
        data={successReceiptData}
      />
    </form>
  );
}
