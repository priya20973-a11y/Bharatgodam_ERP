'use client';

import React, { useEffect, useState, useTransition, useRef, useId } from 'react';
import { useForm, useWatch, Controller, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { differenceInDays, parseISO } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { processInward } from '@/app/actions/transaction-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'react-hot-toast';
import { Loader2, Calculator, Calendar, Info } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { getDropdownDisplayName } from '@/lib/utils';

const getGradingStatus = (observedValue: string | undefined, lowRange: number | undefined, highRange: number | undefined) => {
  if (!observedValue || observedValue.trim() === '') return '';
  const val = parseFloat(observedValue);
  if (isNaN(val)) return '';
  
  if (lowRange !== undefined && val < lowRange) return 'LOW';
  if (highRange !== undefined && val > highRange) return 'HIGH';
  if (lowRange !== undefined && highRange !== undefined) return 'OK';
  return '';
};

const inwardSchema = z.object({
  clientId: z.string().min(1, 'Client is required'),
  commodityId: z.string().min(1, 'Commodity is required'),
  warehouseId: z.string().min(1, 'Warehouse is required'),
  quantityMT: z.coerce.number().positive('Weight must be greater than 0'),
  bagsCount: z.coerce.number().positive('Bags count is required'),
  stackNo: z.string().optional(),
  lotNo: z.string().optional(),
  gatePass: z.string().optional(),
  vehicleNumber: z.string().optional(),
  transportationName: z.string().optional(),
  driverName: z.string().optional(),
  note: z.string().optional(),
  notes: z.string().optional(),
  inwardDate: z.string().min(1, 'Inward date is required'),
  outwardDate: z.string().min(1, 'Outward date is required'),
  isAssayingRequired: z.boolean().default(false),
  assayerId: z.string().optional(),
  assayingDate: z.string().optional(),
  assayingExpiryDate: z.string().optional(),
  marketValuePerMT: z.coerce.number().min(0, 'Cannot be negative').optional(),
  gradingResults: z.any().optional(),
}).refine((data) => {
  return new Date(data.outwardDate) > new Date(data.inwardDate);
}, {
  message: "Outward date must be after inward date",
  path: ["outwardDate"],
}).refine((data) => {
  if (data.isAssayingRequired && data.assayingDate && data.inwardDate) {
    // Strip time portions for fair date comparison
    const assaying = new Date(data.assayingDate).setHours(0,0,0,0);
    const inward = new Date(data.inwardDate).setHours(0,0,0,0);
    return assaying >= inward;
  }
  return true;
}, {
  message: "Assaying Date must be on or after the Inward Date",
  path: ["assayingDate"],
}).refine((data) => {
  if (data.isAssayingRequired && data.assayingDate && data.assayingExpiryDate) {
    return new Date(data.assayingExpiryDate) >= new Date(data.assayingDate);
  }
  return true;
}, {
  message: "Expiry Date must not be earlier than Assaying Date",
  path: ["assayingExpiryDate"],
});

type InwardFormValues = z.infer<typeof inwardSchema>;

interface InwardFormProps {
  clients: any[];
  commodities: any[];
  warehouses: any[];
  assayers?: any[];
  onSuccess?: () => void;
}

export default function InwardForm({ clients, commodities, warehouses, assayers = [], onSuccess }: InwardFormProps) {
  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.role === 'ADMIN';
  const [isPending, startTransition] = useTransition();
  const submittingRef = useRef(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [calculations, setCalculations] = useState<{
    days: number;
    rate: number;
    total: number;
  } | null>(null);

  // Use unique IDs for hydration safety
  const clientIdId = useId();
  const commodityIdId = useId();
  const warehouseIdId = useId();
  const weightId = useId();
  const bagsId = useId();
  const stackNoId = useId();
  const lotNoId = useId();
  const gatePassId = useId();
  const inwardDateId = useId();

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
    reset,
  } = useForm<InwardFormValues>({
    mode: 'onChange',
    resolver: zodResolver(inwardSchema) as Resolver<InwardFormValues>,
    defaultValues: {
      clientId: searchParams.get('clientId') || '',
      commodityId: searchParams.get('commodityId') || '',
      warehouseId: searchParams.get('warehouseId') || '',
      inwardDate: searchParams.get('date') || new Date().toISOString().split('T')[0],
      outwardDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      quantityMT: undefined,
      bagsCount: undefined,
      stackNo: '',
      lotNo: '',
      gatePass: '',
      vehicleNumber: '',
      transportationName: '',
      driverName: '',
      note: '',
      notes: '',
      isAssayingRequired: false,
      assayerId: '',
      assayingDate: '',
      assayingExpiryDate: '',
      marketValuePerMT: undefined,
      gradingResults: [],
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

  const reportUrl = React.useMemo(() => {
    const clientName = clients.find(c => c._id === watchedValues.clientId)?.name;
    const commodityName = commodities.find(c => c._id === watchedValues.commodityId)?.name;
    const warehouseName = warehouses.find(w => w._id === watchedValues.warehouseId)?.name;
    const date = watchedValues.inwardDate;

    if (!clientName || !commodityName || !warehouseName || !date) return null;

    const params = new URLSearchParams();
    params.set('direction', 'INWARD');
    params.set('clientName', clientName);
    params.set('commodity', commodityName);
    params.set('warehouse', warehouseName);
    params.set('startDate', date);
    params.set('endDate', date);

    return `/dashboard/reports?${params.toString()}`;
  }, [watchedValues.clientId, watchedValues.commodityId, watchedValues.warehouseId, watchedValues.inwardDate, clients, commodities, warehouses]);


  useEffect(() => {
    const { inwardDate, outwardDate, quantityMT, commodityId } = watchedValues;

    if (inwardDate && outwardDate && quantityMT && commodityId) {
      const start = parseISO(inwardDate);
      const end = parseISO(outwardDate);
      const days = Math.max(differenceInDays(end, start), 0);
      
      const commodity = commodities.find(c => c._id === commodityId);
      const ratePerDay = commodity?.ratePerMtPerDay || 0;
      
      const total = Number(quantityMT) * ratePerDay * days;
      
      setCalculations({
        days,
        rate: ratePerDay,
        total: Math.max(total, 0)
      });
    } else {
      setCalculations(null);
    }
  }, [watchedValues, commodities]);

  const onSubmit = async (data: InwardFormValues) => {
    // 1. Strict numeric validation before even trying to submit
    if (data.quantityMT <= 0 || data.bagsCount <= 0) {
      toast.error('Weight and Bags count must be greater than zero');
      return;
    }

    if (submittingRef.current) return;
    submittingRef.current = true;

    startTransition(async () => {
      try {
        const res = await processInward({
          clientId: data.clientId,
          commodityId: data.commodityId,
          warehouseId: data.warehouseId,
          quantityMT: data.quantityMT,
          bagsCount: data.bagsCount,
          stackNo: data.stackNo,
          lotNo: data.lotNo,
          gatePass: data.gatePass,
          vehicleNumber: data.vehicleNumber,
          transportationName: data.transportationName,
          driverName: data.driverName,
          note: (data.notes !== undefined && data.notes !== '') ? data.notes : (data.note || ''),
          notes: (data.notes !== undefined && data.notes !== '') ? data.notes : (data.note || ''),
          date: data.inwardDate, // ISO string
          outwardDate: data.outwardDate, // ISO string
          isAssayingRequired: data.isAssayingRequired,
          assayerId: data.assayerId || undefined,
          assayingDate: data.assayingDate || undefined,
          assayingExpiryDate: data.assayingExpiryDate || undefined,
          marketValuePerMT: data.marketValuePerMT,
          totalMarketValue: data.marketValuePerMT && data.quantityMT ? data.marketValuePerMT * data.quantityMT : 0,
          gradingResults: data.gradingResults,
        });

        if (res.success) {
          toast.success('Inward transaction recorded');

          setCalculations(null); // Explicitly clear live charges display
          
          reset({
            clientId: '',
            commodityId: '',
            warehouseId: '',
            inwardDate: new Date().toISOString().split('T')[0],
            outwardDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            quantityMT: undefined,
            bagsCount: undefined,
            stackNo: '',
            lotNo: '',
            gatePass: '',
            vehicleNumber: '',
            transportationName: '',
            driverName: '',
            note: '',
            notes: '',
            isAssayingRequired: false,
            assayerId: '',
            assayingDate: '',
            assayingExpiryDate: '',
            marketValuePerMT: undefined,
            gradingResults: [],
          });
          
          router.refresh();
          onSuccess?.();
          setTimeout(() => { submittingRef.current = false; }, 1000);
        } else {
          toast.error(res.error || 'Failed to process inward');
          submittingRef.current = false;
        }
      } catch (err: any) {
        console.error('Submission Error:', err);
        toast.error('Internal Server Error: ' + err.message);
        submittingRef.current = false;
      }
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="bg-white p-6 border rounded-xl shadow-sm space-y-6">
        <div className="flex items-center gap-2 border-b pb-4">
            <Calendar className="h-5 w-5 text-indigo-600" />
            <h3 className="font-bold text-lg text-slate-900">New Inward Entry</h3>
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
                      clients.filter(c => c && c._id && c.name).map(c => <SelectItem key={c._id.toString()} value={c._id.toString()}>{getDropdownDisplayName(c, clients, isAdmin)}</SelectItem>)
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label htmlFor={warehouseIdId} className="text-sm font-semibold text-slate-700">Warehouse Name *</label>
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
                      warehouses
                        .filter(w => w && w._id && w.name && (w.status === 'ACTIVE' || w.status === 'FULL'))
                        .map(w => {
                          const availableCapacity = typeof w.totalCapacity === 'number' && typeof w.occupiedCapacity === 'number'
                            ? (w.status === 'FULL' ? 0 : w.totalCapacity - w.occupiedCapacity)
                            : undefined;

                          return (
                            <SelectItem key={w._id.toString()} value={w._id.toString()}>
                              {w.name}
                              {availableCapacity !== undefined ? ` (${availableCapacity} MT left)` : ''}
                            </SelectItem>
                          );
                        })
                    ) : (
                      <SelectItem value="none" disabled>No warehouses available</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.warehouseId && <p className="text-xs text-red-500">{errors.warehouseId.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor={weightId} className="text-sm font-semibold text-slate-700">Weight (MT) *</label>
              <Controller
                name="quantityMT"
                control={control}
                render={({ field }) => (
                  <Input 
                    id={weightId}
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
              <label htmlFor={bagsId} className="text-sm font-semibold text-slate-700">No. of Bags</label>
              <Controller
                name="bagsCount"
                control={control}
                render={({ field }) => (
                  <Input 
                    id={bagsId}
                    name="bagsCount"
                    type="number" 
                    placeholder="Enter number of bags"
                    className={errors.bagsCount ? 'border-red-500' : ''}
                    value={field.value ?? ''}
                    onChange={(e) => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))}
                  />
                )}
              />
              {errors.bagsCount && <p className="text-xs text-red-500">{errors.bagsCount.message}</p>}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <label htmlFor={stackNoId} className="text-sm font-semibold text-slate-700">Stack No</label>
            <Input 
              id={stackNoId}
              {...register('stackNo')}
              type="text" 
              placeholder="e.g., STK-001"
            />
            {errors.stackNo && <p className="text-xs text-red-500">{errors.stackNo.message}</p>}
          </div>
          <div className="space-y-2">
            <label htmlFor={lotNoId} className="text-sm font-semibold text-slate-700">Lot No</label>
            <Input 
              id={lotNoId}
              {...register('lotNo')}
              type="text" 
              placeholder="e.g., LOT-001"
            />
            {errors.lotNo && <p className="text-xs text-red-500">{errors.lotNo.message}</p>}
          </div>
          <div className="space-y-2">
            <label htmlFor={gatePassId} className="text-sm font-semibold text-slate-700">Gate Pass</label>
            <Input 
              id={gatePassId}
              {...register('gatePass')}
              type="text" 
              placeholder="e.g., GP-001"
            />
            {errors.gatePass && <p className="text-xs text-red-500">{errors.gatePass.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t pt-6">
          <div className="space-y-2">
            <label htmlFor="marketValuePerMT" className="text-sm font-semibold text-slate-700">Market Value per MT (₹)</label>
            <Controller
              name="marketValuePerMT"
              control={control}
              render={({ field }) => (
                <Input 
                  id="marketValuePerMT"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  className={errors.marketValuePerMT ? 'border-red-500 bg-white' : 'bg-white'}
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))}
                />
              )}
            />
            {errors.marketValuePerMT && <p className="text-xs text-red-500">{errors.marketValuePerMT.message}</p>}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">Total Market Value</label>
            <div className="h-10 px-3 py-2 bg-slate-100 border border-slate-200 rounded-md text-slate-700 flex items-center font-medium">
              {watchedValues.quantityMT && watchedValues.marketValuePerMT 
                ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(watchedValues.quantityMT * watchedValues.marketValuePerMT)
                : '₹0.00'
              }
            </div>
          </div>
        </div>


        <div className="border-t pt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold text-slate-900">Assaying & Grading</h4>
              <p className="text-xs text-slate-500">Record quality parameters for this inward stock</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-slate-700">Assaying Required?</span>
              <Controller
                name="isAssayingRequired"
                control={control}
                render={({ field }) => (
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="radio" 
                        name="assayingRequired" 
                        checked={field.value === true} 
                        onChange={() => field.onChange(true)} 
                        className="text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-slate-700">Yes</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="radio" 
                        name="assayingRequired" 
                        checked={field.value === false} 
                        onChange={() => {
                          field.onChange(false);
                          // Clear values when changing to No to ensure validation passes and old values aren't submitted
                          setValue('assayerId', '');
                          setValue('assayingDate', '');
                          setValue('assayingExpiryDate', '');
                          setValue('gradingResults', []);
                        }} 
                        className="text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-slate-700">No</span>
                    </label>
                  </div>
                )}
              />

            </div>
          </div>

          {watchedValues.isAssayingRequired && (
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Select Assayer *</label>
                <Controller
                  name="assayerId"
                  control={control}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger className="bg-white">
                        <SelectValue placeholder="Choose an active assayer..." />
                      </SelectTrigger>
                      <SelectContent>
                        {assayers && assayers.length > 0 ? (
                          assayers.filter(a => a.status === 'Active').map(a => (
                            <SelectItem key={a._id.toString()} value={a._id.toString()}>
                              {a.name} ({a.licenceNumber})
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="none" disabled>No active assayers found</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="assayingDate" className="text-sm font-semibold text-slate-700">Assaying Date</label>
                  <Input 
                    id="assayingDate"
                    type="date"
                    className={errors.assayingDate ? 'border-red-500 bg-white' : 'bg-white'}
                    {...register('assayingDate')}
                  />
                  {errors.assayingDate && <p className="text-xs text-red-500">{errors.assayingDate.message}</p>}
                </div>
                <div className="space-y-2">
                  <label htmlFor="assayingExpiryDate" className="text-sm font-semibold text-slate-700">Expiry Date</label>
                  <Input 
                    id="assayingExpiryDate"
                    type="date"
                    className={errors.assayingExpiryDate ? 'border-red-500 bg-white' : 'bg-white'}
                    {...register('assayingExpiryDate')}
                  />
                  {errors.assayingExpiryDate && <p className="text-xs text-red-500">{errors.assayingExpiryDate.message}</p>}
                </div>
              </div>


              {watchedValues.commodityId && commodities.find(c => c._id === watchedValues.commodityId)?.gradingParameters?.length > 0 ? (
                <div className="space-y-3 pt-2">
                  <label className="text-sm font-semibold text-slate-700">Grading Results</label>
                  <div className="grid grid-cols-1 gap-3">
                    {commodities.find(c => c._id === watchedValues.commodityId).gradingParameters.map((param: any, idx: number) => (
                      <div key={idx} className="flex flex-col md:flex-row md:items-center gap-3 bg-white p-3 rounded-lg border border-slate-200">
                        <div className="flex-1">
                          <span className="font-semibold text-sm text-slate-800 block">{param.name}</span>
                          <span className="text-xs text-slate-500">
                            {param.remarks ? `Std: ${param.remarks}` : ''}
                            {param.lowRange !== undefined && param.highRange !== undefined ? ` | Range: ${param.lowRange} - ${param.highRange}` : ''}
                          </span>
                        </div>
                        <div className="w-full md:w-1/3 flex items-center gap-2">
                          <Controller
                            name={`gradingResults.${idx}.observedValue`}
                            control={control}
                            render={({ field }) => (
                              <Input 
                                placeholder="Observed Value" 
                                value={field.value || ''}
                                onChange={e => {
                                  field.onChange(e.target.value);
                                  setValue(`gradingResults.${idx}.parameterName`, param.name);
                                  const status = getGradingStatus(e.target.value, param.lowRange, param.highRange);
                                  setValue(`gradingResults.${idx}.status`, status || '');
                                }}
                              />
                            )}
                          />
                          {(() => {
                            const currentVal = watchedValues.gradingResults?.[idx]?.observedValue;
                            const status = getGradingStatus(currentVal, param.lowRange, param.highRange);
                            if (!status) return null;
                            
                            let colorClass = "bg-slate-100 text-slate-800 border-slate-200";
                            if (status === 'OK') colorClass = "bg-emerald-50 text-emerald-700 border-emerald-200";
                            else if (status === 'LOW' || status === 'HIGH') colorClass = "bg-red-50 text-red-700 border-red-200";
                            
                            return (
                              <div className={`px-3 py-2 rounded-md border text-xs font-bold w-16 text-center ${colorClass}`}>
                                {status}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="pt-2">
                  <p className="text-sm text-amber-600 bg-amber-50 p-3 rounded-lg border border-amber-200">
                    No grading parameters defined for the selected commodity. You can add them in Commodity Master.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 border-t pt-6">
          <div className="space-y-2">
            <label htmlFor="vehicleNumber" className="text-sm font-semibold text-slate-700">Vehicle Number</label>
            <Input 
              id="vehicleNumber"
              {...register('vehicleNumber')}
              type="text" 
              placeholder="e.g., MH 12 AB 1234"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="transportationName" className="text-sm font-semibold text-slate-700">Transportation Name</label>
            <Input 
              id="transportationName"
              {...register('transportationName')}
              type="text" 
              placeholder="e.g., Fast Freight Inc."
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="driverName" className="text-sm font-semibold text-slate-700">Driver Name / Number</label>
            <Input 
              id="driverName"
              {...register('driverName')}
              type="text" 
              placeholder="e.g., John Doe - 9876543210"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t pt-6">
            <div className="space-y-2">
                <label htmlFor="notes" className="text-sm font-semibold text-slate-700">Notes</label>
                <textarea 
                    id="notes"
                    {...register('notes')}
                    onChange={(e) => {
                      register('notes').onChange(e);
                      setValue('note', e.target.value);
                    }}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 min-h-[40px]"
                    placeholder="Enter notes"
                />
            </div>
            <div className="space-y-2">
                <label htmlFor={inwardDateId} className="text-sm font-semibold text-slate-700">Inward Date *</label>
                <Input 
                    id={inwardDateId}
                    {...register('inwardDate')}
                    type="date" 
                />
            </div>
        </div>

        <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-12" disabled={isPending}>
          {isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Finalizing Entry...</> : 'Confirm Inward Entry'}
        </Button>
      </div>

      <AnimatePresence>
        {calculations && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="bg-indigo-900 text-white p-6 rounded-xl shadow-lg relative overflow-hidden"
          >
            <div className="absolute right-0 top-0 opacity-10">
                <Calculator size={120} />
            </div>
            
            <div className="relative z-10">
                <h4 className="flex items-center gap-2 text-indigo-200 text-sm font-bold uppercase tracking-wider mb-4">
                    <Info size={16} /> Live Financial Summary
                </h4>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 items-end">
                    <div>
                        <p className="text-indigo-300 text-xs font-medium mb-1">Total Duration</p>
                        <p className="text-2xl font-black">{calculations.days} <span className="text-sm font-normal text-indigo-200">Days</span></p>
                    </div>
                    <div>
                        <p className="text-indigo-300 text-xs font-medium mb-1">Applied Rate</p>
                        <p className="text-2xl font-black">₹{calculations.rate}<span className="text-sm font-normal text-indigo-200">/MT/Day</span></p>
                    </div>
                    <div className="col-span-2 text-right">
                        <p className="text-indigo-300 text-xs font-medium mb-1">Estimated Storage Charges</p>
                        <p className="text-4xl font-black text-emerald-400">
                            ₹{calculations.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                    </div>
                </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </form>
  );
}
