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

const inwardSchema = z.object({
  clientId: z.string().min(1, 'Client is required'),
  commodityId: z.string().min(1, 'Commodity is required'),
  warehouseId: z.string().min(1, 'Warehouse is required'),
  quantityMT: z.coerce.number().positive('Weight must be greater than 0'),
  bagsCount: z.coerce.number().positive('Bags count is required'),
  stackNo: z.string().optional(),
  lotNo: z.string().optional(),
  gatePass: z.string().optional(),
  inwardDate: z.string().min(1, 'Inward date is required'),
  outwardDate: z.string().min(1, 'Outward date is required'),
}).refine((data) => {
  return new Date(data.outwardDate) > new Date(data.inwardDate);
}, {
  message: "Outward date must be after inward date",
  path: ["outwardDate"],
});

type InwardFormValues = z.infer<typeof inwardSchema>;

interface InwardFormProps {
  clients: any[];
  commodities: any[];
  warehouses: any[];
  onSuccess?: () => void;
}

export default function InwardForm({ clients, commodities, warehouses, onSuccess }: InwardFormProps) {
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
    formState: { errors },
    reset,
  } = useForm<InwardFormValues>({
    resolver: zodResolver(inwardSchema) as Resolver<InwardFormValues>,
    defaultValues: {
      clientId: searchParams.get('clientId') || '',
      commodityId: searchParams.get('commodityId') || '',
      warehouseId: searchParams.get('warehouseId') || '',
      inwardDate: searchParams.get('date') || new Date().toISOString().split('T')[0],
      outwardDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      quantityMT: 0,
      bagsCount: 0,
      stackNo: '',
      lotNo: '',
      gatePass: '',
    },
  });

  const watchedValues = useWatch({ control });

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
          date: data.inwardDate, // ISO string
          outwardDate: data.outwardDate, // ISO string
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
            quantityMT: 0,
            bagsCount: 0,
            stackNo: '',
            lotNo: '',
            gatePass: '',
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
            <label htmlFor={clientIdId} className="text-sm font-semibold text-slate-700">Client Name</label>
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
                      clients.filter(c => c && c._id && c.name).map(c => <SelectItem key={c._id.toString()} value={c._id.toString()}>{c.name}</SelectItem>)
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
            <label htmlFor={commodityIdId} className="text-sm font-semibold text-slate-700">Commodity</label>
            <Controller
              name="commodityId"
              control={control}
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger id={commodityIdId} name="commodityId" className={errors.commodityId ? 'border-red-500' : ''}>
                    <SelectValue placeholder="Search Commodity..." />
                  </SelectTrigger>
                  <SelectContent>
                    {commodities && commodities.length > 0 ? (
                      commodities.filter(c => c && c._id && c.name).map(c => <SelectItem key={c._id.toString()} value={c._id.toString()}>{c.name}</SelectItem>)
                    ) : (
                      <SelectItem value="none" disabled>No commodities available</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.commodityId && <p className="text-xs text-red-500">{errors.commodityId.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label htmlFor={warehouseIdId} className="text-sm font-semibold text-slate-700">Warehouse Name</label>
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
                        .filter(w => w && w._id && w.name && w.status === 'ACTIVE')
                        .map(w => {
                          const availableCapacity = typeof w.totalCapacity === 'number' && typeof w.occupiedCapacity === 'number'
                            ? w.totalCapacity - w.occupiedCapacity
                            : undefined;

                          return (
                            <SelectItem key={w._id.toString()} value={w._id.toString()} disabled={w.status === 'FULL'}>
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
              <label htmlFor={weightId} className="text-sm font-semibold text-slate-700">Weight (MT)</label>
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
                    value={isNaN(field.value) ? '' : field.value}
                    onChange={(e) => field.onChange(isNaN(e.target.valueAsNumber) ? 0 : e.target.valueAsNumber)}
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
                    placeholder="0"
                    className={errors.bagsCount ? 'border-red-500' : ''}
                    value={isNaN(field.value) ? '' : field.value}
                    onChange={(e) => field.onChange(isNaN(e.target.valueAsNumber) ? 0 : e.target.valueAsNumber)}
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
                <label htmlFor={inwardDateId} className="text-sm font-semibold text-slate-700">Inward Date</label>
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
