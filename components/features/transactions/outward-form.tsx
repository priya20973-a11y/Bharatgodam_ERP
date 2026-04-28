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
import { Loader2, ArrowUpFromLine, RefreshCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

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
  date: z.string().min(1, 'Date is required'),
});

type OutwardFormValues = z.infer<typeof outwardSchema>;

interface OutwardFormProps {
  clients: any[];
  commodities: any[];
  warehouses: any[];
  onSuccess?: () => void;
}

export default function OutwardForm({ clients, commodities, warehouses, onSuccess }: OutwardFormProps) {
  const [isPending, startTransition] = useTransition();
  const submittingRef = useRef(false);
  const [checkingStock, setCheckingStock] = useState(false);
  const [currentStock, setCurrentStock] = useState<number | null>(null);
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
  const dateId = useId();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    reset,
  } = useForm<OutwardFormValues>({
    resolver: zodResolver(outwardSchema) as Resolver<OutwardFormValues>,
    defaultValues: {
      clientId: searchParams.get('clientId') || '',
      commodityId: searchParams.get('commodityId') || '',
      warehouseId: searchParams.get('warehouseId') || '',
      quantityMT: 0,
      bagsCount: undefined,
      stackNo: '',
      lotNo: '',
      gatePass: '',
      date: searchParams.get('date') || new Date().toISOString().split('T')[0],
    },
  });

  const watchedValues = useWatch({ control });

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

  const onSubmit = async (data: OutwardFormValues) => {
    if (data.quantityMT <= 0) {
      toast.error('Withdrawal quantity must be greater than zero');
      return;
    }

    if (currentStock !== null && data.quantityMT > currentStock) {
      toast.error(`Insufficient stock. Max available: ${currentStock} MT`);
      return;
    }

    if (submittingRef.current) return;
    submittingRef.current = true;

    startTransition(async () => {
      try {
        const res = await processOutward({
          clientId: data.clientId,
          commodityId: data.commodityId,
          warehouseId: data.warehouseId,
          quantityMT: data.quantityMT,
          bagsCount: data.bagsCount,
          stackNo: data.stackNo,
          lotNo: data.lotNo,
          gatePass: data.gatePass,
          date: data.date,
        });

        if (res.success) {
          toast.success('Stock withdrawal recorded');
          
          reset({
            clientId: '',
            commodityId: '',
            warehouseId: '',
            quantityMT: 0,
            bagsCount: undefined,
            stackNo: '',
            lotNo: '',
            gatePass: '',
            date: new Date().toISOString().split('T')[0],
          });
          
          router.refresh();
          onSuccess?.();
          setTimeout(() => { submittingRef.current = false; }, 1000);
        } else {
          toast.error(res.error || 'Failed to process outward');
          submittingRef.current = false;
        }
      } catch (err: any) {
        console.error('Outward Error:', err);
        toast.error('Internal Server Error: ' + err.message);
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
                    clients.filter(c => c && c._id && c.name).map(c => (
                      <SelectItem key={c._id.toString()} value={c._id.toString()}>
                        {c.name}
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
                    commodities.filter(c => c && c._id && c.name).map(c => (
                      <SelectItem key={c._id.toString()} value={c._id.toString()}>
                        {c.name}
                      </SelectItem>
                    ))
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-2">
          <label htmlFor={warehouseIdId} className="text-sm font-semibold text-slate-700">Warehouse</label>
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
                    warehouses.filter(w => w && w._id && w.name && w.status === 'ACTIVE').map(w => (
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
            Quantity (MT)
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
                value={isNaN(field.value) ? '' : field.value}
                onChange={(e) => field.onChange(isNaN(e.target.valueAsNumber) ? 0 : e.target.valueAsNumber)}
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
          <label htmlFor={dateId} className="text-sm font-semibold text-slate-700">Withdrawal Date</label>
          <Input 
            id={dateId}
            {...register('date')}
            type="date" 
          />
          {errors.date && <p className="text-xs text-red-500">{errors.date.message}</p>}
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
          disabled={isPending || checkingStock || (currentStock !== null && currentStock <= 0)}
        >
          {isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing Withdrawal...</> : 'Confirm Withdrawal'}
        </Button>
      </div>
    </form>
  );
}
