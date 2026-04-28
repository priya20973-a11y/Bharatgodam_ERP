'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { Truck, MapPin, Users, Tags, Calculator, ChevronRight, Scale, Lock } from 'lucide-react';
import { DetailedLogisticsSchema, DetailedLogisticsValues } from '@/lib/validations/booking';
import { calculateRent } from '@/lib/pricing-engine';
import { useWarehouse } from '@/contexts/WarehouseContext';
import { MongoCommodity } from '@/lib/validations/commodity';
import { differenceInDays } from 'date-fns';
import { formatCurrency } from '@/lib/utils/currency';
import { formatWeight } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createDetailedBooking } from '@/app/actions/billing';

// ── Static fallback list ──────────────────────────────────────────────────────
// Used when the Commodity Master DB collection is still empty or unreachable.
// To add a dynamic commodity, create it at /dashboard/commodities.
const STATIC_COMMODITIES: MongoCommodity[] = [
  { _id: 'static-wheat',    name: 'WHEAT',    baseRate: 85,  unit: 'MT', category: 'Grains',  createdAt: '', updatedAt: '' },
  { _id: 'static-rice',     name: 'RICE',     baseRate: 90,  unit: 'MT', category: 'Grains',  createdAt: '', updatedAt: '' },
  { _id: 'static-chana',    name: 'CHANA',    baseRate: 95,  unit: 'MT', category: 'Pulses',  createdAt: '', updatedAt: '' },
  { _id: 'static-soyabean', name: 'SOYABEAN', baseRate: 80,  unit: 'MT', category: 'Oilseeds',createdAt: '', updatedAt: '' },
  { _id: 'static-mustard',  name: 'MUSTARD',  baseRate: 88,  unit: 'MT', category: 'Oilseeds',createdAt: '', updatedAt: '' },
  { _id: 'static-corn',     name: 'CORN',     baseRate: 75,  unit: 'MT', category: 'Grains',  createdAt: '', updatedAt: '' },
  { _id: 'static-cotton',   name: 'COTTON',   baseRate: 120, unit: 'MT', category: 'Fibres',  createdAt: '', updatedAt: '' },
];

const WAREHOUSE_NAME_TO_ID: Record<string, string> = {
  'Warehouse 1': 'WH1',
  'Warehouse 2': 'WH2',
  'Warehouse 3': 'WH3',
  'Warehouse 4': 'WH4',
  'Warehouse 5': 'WH5',
};

interface BookingFormProps {
  commodities: MongoCommodity[];
}

export default function BookingForm({ commodities }: BookingFormProps) {
  const [isSubmittingEngine, setIsSubmittingEngine] = useState(false);
  // Synchronous guard — fires BEFORE React's async state batching can process,
  // preventing rapid-click double submissions from reaching the database.
  const isSubmittingRef = useRef(false);

  // State for dynamic warehouse mapping
  const [warehouseMapping, setWarehouseMapping] = useState<Record<string, string>>(WAREHOUSE_NAME_TO_ID);
  const [warehousesLoaded, setWarehousesLoaded] = useState(false);

  // Merge DB commodities with static fallbacks — DB commodities take priority.
  // Static items are ONLY shown when there is no matching DB entry with the same name.
  const dbNames = new Set(commodities.map(c => c.name));
  const mergedCommodities: MongoCommodity[] = [
    ...commodities,
    ...STATIC_COMMODITIES.filter(s => !dbNames.has(s.name)),
  ];

  const { register, handleSubmit, watch, reset, setValue, setError, clearErrors, control, formState: { errors } } = useForm<DetailedLogisticsValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(DetailedLogisticsSchema) as any,
    mode: 'onTouched',
    defaultValues: {
      storageDays: 1,  // Must be ≥1 to pass z.coerce.number().min(1)
      bags: 0,
      palaBags: 0,
      direction: 'INWARD'
    },
  });

  const router = useRouter();
  const { clients } = useWarehouse();
  const [direction, setDirection] = useState<'INWARD' | 'OUTWARD'>('INWARD');
  const [stockError, setStockError] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [availableStock, setAvailableStock] = useState<number | null>(null);
  const [isCheckingStock, setIsCheckingStock] = useState(false);

  // Watch fields strictly for the Live Invoice Estimator Preview
  const watchedMT = watch('mt') || 0;
  const watchedDays = watch('storageDays') || 1;
  const watchedDate = watch('date');
  const watchedCommodity = watch('commodityName');
  const watchedDirection = watch('direction');
  const watchedWarehouse = watch('warehouseName');
  const selectedRate = mergedCommodities.find(c => c.name === watchedCommodity)?.baseRate ?? 0;

  useEffect(() => {
    if (watchedDirection === 'INWARD') {
      setDirection('INWARD');
    } else if (watchedDirection === 'OUTWARD') {
      setDirection('OUTWARD');
    }
  }, [watchedDirection]);

  // Fetch warehouses and create dynamic mapping
  useEffect(() => {
    const fetchWarehouses = async () => {
      try {
        const response = await fetch('/api/warehouses');
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.warehouses) {
            // Create mapping from warehouse name to ID
            const mapping: Record<string, string> = {};
            data.warehouses.forEach((warehouse: any) => {
              mapping[warehouse.name] = warehouse.id;
            });
            setWarehouseMapping(mapping);
          }
        }
      } catch (error) {
        console.warn('Failed to fetch warehouses, using fallback mapping:', error);
        // Keep the hardcoded fallback
      } finally {
        setWarehousesLoaded(true);
      }
    };

    fetchWarehouses();
  }, []);

  useEffect(() => {
    const validateCommodityStock = async () => {
      if (watchedDirection !== 'OUTWARD' || !watchedCommodity || !watchedWarehouse) {
        setStockError(null);
        setAvailableStock(null);
        clearErrors('mt');
        return;
      }

      const warehouseId = warehouseMapping[watchedWarehouse];
      if (!warehouseId) {
        setStockError('Select a valid warehouse for outward movement.');
        setAvailableStock(null);
        return;
      }

      setIsCheckingStock(true);
      try {
        const response = await fetch(`/api/warehouse/inventory?warehouseId=${warehouseId}`);
        if (!response.ok) {
          throw new Error('Unable to validate stock availability');
        }

        const payload = await response.json();
        const commodity = payload.commodities.find((item: any) => item.commodityName === watchedCommodity);
        const available = commodity?.totalWeight ?? 0;
        setAvailableStock(available);

        if (watchedMT > available) {
          setStockError('Commodity not available');
          setIsError(true);
          setError('mt', { type: 'manual', message: 'Commodity not available' });
        } else {
          clearErrors('mt');
          setStockError(null);
          setIsError(false);
        }
      } catch (error) {
        setStockError('Unable to validate commodity stock');
        setIsError(true);
        setAvailableStock(null);
      } finally {
        setIsCheckingStock(false);
      }
    };

    validateCommodityStock();
  }, [watchedDirection, watchedCommodity, watchedWarehouse, watchedMT, setError, clearErrors]);

  // Live preview using the pro-rata engine — mirrors what billing.ts will calculate
  let rentPreview: ReturnType<typeof calculateRent> | null = null;
  if (watchedDate && watchedMT > 0 && selectedRate > 0) {
    try {
      const outwardForPreview = new Date(new Date(watchedDate).getTime() + watchedDays * 86400000)
        .toISOString()
        .slice(0, 10);
      rentPreview = calculateRent(watchedMT, selectedRate, watchedDate, outwardForPreview);
    } catch { } // Fails silently while dates are mid-entry
  }

  const onSubmit = async (data: DetailedLogisticsValues) => {
    if (watchedDirection === 'OUTWARD' && (stockError || isError)) {
      toast.error(stockError || 'Commodity not available');
      isSubmittingRef.current = false;
      setIsSubmittingEngine(false);
      return;
    }

    // 🔍 DEBUG: Verify the total amount matches UI preview before submission
    const debugRent = calculateRent(
      watchedMT,
      selectedRate,
      watchedDate,
      new Date(new Date(watchedDate).getTime() + watchedDays * 86400000).toISOString().slice(0, 10)
    );
    console.log('[Form] Pre-Submission Verification:');
    console.log('  Expected Total (UI): ' + formatCurrency(rentPreview?.totalAmount || 0));
    console.log('  Calculated Total: ' + formatCurrency(debugRent.totalAmount));
    console.log('  Match: ' + (rentPreview?.totalAmount === debugRent.totalAmount ? '✓ YES' : '✗ NO'));
    console.log('  Full Breakdown:', debugRent);
    
    console.log('[Form] Form data being submitted:', data);
    try {
      // Call the server action that inserts both booking AND generates invoice
      const result = await createDetailedBooking(data);
      
      if (!result.success) {
        toast.error(result.message || 'Server rejected the entry.');
        isSubmittingRef.current = false;
        setIsSubmittingEngine(false);
        return;
      }

      // Success! Show confirmation with invoice info
      toast.success(`✓ Booking S.No #${result.serialNo} saved! Invoice created.`);
      
      reset({ storageDays: 1, bags: 0, palaBags: 0, direction: 'INWARD' });
      setStockError(null);
      setAvailableStock(null);
      
      // Refresh to show updated bookings and allow viewing the new invoice
      router.refresh();
    } catch (error: any) {
      toast.error(error.message || 'Network error. Please retry.');
    } finally {
      isSubmittingRef.current = false;
      setIsSubmittingEngine(false);
    }
  };

  // Intercept the native form submit event BEFORE react-hook-form's handleSubmit
  // queues multiple async calls. This is the only reliable synchronous gate.
  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (isSubmittingRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    isSubmittingRef.current = true;
    setIsSubmittingEngine(true);

    // CRITICAL: Pass an onError handler — if Zod validation fails, onSubmit never runs,
    // so we must reset the lock here or the button becomes permanently dead.
    handleSubmit(onSubmit, (validationErrors) => {
      console.warn('[Form] Validation failed — fields with errors:', Object.keys(validationErrors));
      console.warn('[Form] Error details:', validationErrors);
      isSubmittingRef.current = false;
      setIsSubmittingEngine(false);
    })(e);
  };

  return (
    <div className="bg-slate-50 min-h-screen pb-12">
      <div className="bg-white border-b border-slate-200 px-8 py-5 mb-8">
        <h2 className="text-2xl font-bold text-slate-900 flex items-center">
          <Truck className="w-6 h-6 mr-3 text-indigo-600" />
          Logistics & Cargo Entry Ledger
        </h2>
        <p className="text-slate-500 text-sm mt-1">Deep structure mirroring EXACT Excel workflow (18 Headers).</p>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <form onSubmit={handleFormSubmit} className="space-y-8">
          
          {/* === CARD 1: Flow & Location === */}
          <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-6">
            <h3 className="text-md font-semibold text-slate-800 flex items-center mb-4 border-b pb-2">
              <MapPin className="w-4 h-4 mr-2" /> 1. Flow & Location
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Direction *</label>
                <div className="flex items-center gap-4">
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input type="radio" value="INWARD" {...register('direction')} className="h-4 w-4 text-indigo-600" />
                    Inward
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input type="radio" value="OUTWARD" {...register('direction')} className="h-4 w-4 text-indigo-600" />
                    Outward
                  </label>
                </div>
                {errors.direction && <p className="text-red-500 text-[10px] mt-1">{errors.direction.message}</p>}
              </div>
              <div>
                <label htmlFor="date" className="block text-xs font-bold text-slate-600 mb-1">Date *</label>
                <input id="date" type="date" {...register('date')} className="w-full rounded-md border border-slate-300 p-2 text-sm focus:ring-2 focus:ring-indigo-500" />
                {errors.date && <p className="text-red-500 text-[10px] mt-1">{errors.date.message}</p>}
              </div>
              <div>
                <label htmlFor="warehouseName" className="block text-xs font-bold text-slate-600 mb-1">Warehouse Name *</label>
                <Controller
                  name="warehouseName"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="warehouseName" className="w-full bg-slate-50 border-slate-300 focus:ring-2 focus:ring-indigo-500">
                        <SelectValue placeholder="Choose Warehouse" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Warehouse 1">Warehouse 1</SelectItem>
                        <SelectItem value="Warehouse 2">Warehouse 2</SelectItem>
                        <SelectItem value="Warehouse 3">Warehouse 3</SelectItem>
                        <SelectItem value="Warehouse 4">Warehouse 4</SelectItem>
                        <SelectItem value="Warehouse 5">Warehouse 5</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.warehouseName && <p className="text-red-500 text-[10px] mt-1">{errors.warehouseName.message}</p>}
              </div>
              <div>
                <label htmlFor="location" className="block text-xs font-bold text-slate-600 mb-1">LOCATION *</label>
                <input id="location" {...register('location')} className="w-full rounded-md border border-slate-300 p-2 text-sm focus:ring-2 focus:ring-indigo-500" placeholder="Zone C" />
                {errors.location && <p className="text-red-500 text-[10px] mt-1">{errors.location.message}</p>}
              </div>
            </div>
          </div>

          {/* === CARD 2: Stakeholders === */}
          <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-6">
            <h3 className="text-md font-semibold text-slate-800 flex items-center mb-4 border-b pb-2">
              <Users className="w-4 h-4 mr-2" /> 2. Key Stakeholders
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <label htmlFor="clientName" className="block text-xs font-bold text-slate-600 mb-1">CLIENT NAME *</label>
                <Controller
                  name="clientName"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="clientName" className="w-full bg-slate-50 border-slate-300 focus:ring-2 focus:ring-indigo-500">
                        <SelectValue placeholder="Select a client" />
                      </SelectTrigger>
                      <SelectContent>
                        {clients.map(client => (
                          <SelectItem key={client.id} value={client.name}>
                            {client.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.clientName && <p className="text-red-500 text-[10px] mt-1">{errors.clientName.message}</p>}
              </div>
              <div>
                <label htmlFor="clientLocation" className="block text-xs font-bold text-slate-600 mb-1">Client Location</label>
                <input id="clientLocation" {...register('clientLocation')} className="w-full rounded-md border border-slate-300 p-2 text-sm focus:ring-2 focus:ring-indigo-500" placeholder="Delhi HQ" />
              </div>
              <div>
                <label htmlFor="suppliers" className="block text-xs font-bold text-slate-600 mb-1">Suppliers</label>
                <input id="suppliers" {...register('suppliers')} className="w-full rounded-md border border-slate-300 p-2 text-sm focus:ring-2 focus:ring-indigo-500" placeholder="Supplier Firm Ltd" />
              </div>
            </div>
          </div>

          {/* === CARD 3: Tracking Specs === */}
          <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-6 ">
            <h3 className="text-md font-semibold text-slate-800 flex items-center mb-4 border-b pb-2">
              <Tags className="w-4 h-4 mr-2" /> 3. Deep Tracking & Specs
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-5">
              <div className="col-span-2">
                <label htmlFor="commodityName" className="block text-xs font-bold text-slate-600 mb-1">Commodity Name *</label>
                <select
                  id="commodityName"
                  {...register('commodityName', { required: 'Commodity is required' })}
                  className="w-full rounded-md border border-blue-300 p-2 text-sm focus:ring-2 focus:ring-blue-500 bg-blue-50 font-semibold uppercase"
                >
                  <option value="">— Select Commodity —</option>
                  {mergedCommodities.map(c => (
                    <option key={c._id} value={c.name}>
                      {c.name} — ₹{c.baseRate}/{c.unit}
                    </option>
                  ))}
                </select>
                {watchedCommodity && selectedRate > 0 && (
                  <p className="text-[10px] text-blue-600 font-bold mt-1">
                    ✓ Active rate: ₹{selectedRate}/MT — will be used for billing
                  </p>
                )}
                {errors.commodityName && <p className="text-red-500 text-[10px] mt-1">{errors.commodityName.message}</p>}
              </div>
              <div className="col-span-1">
                <label htmlFor="cadNo" className="block text-xs font-bold text-slate-600 mb-1">CAD No</label>
                <input id="cadNo" {...register('cadNo')} className="w-full rounded-md border border-slate-300 p-2 text-sm uppercase" placeholder="---" />
              </div>
              <div className="col-span-1">
                <label htmlFor="stackNo" className="block text-xs font-bold text-slate-600 mb-1">Stack No.</label>
                <input id="stackNo" {...register('stackNo')} className="w-full rounded-md border border-slate-300 p-2 text-sm uppercase" placeholder="---" />
              </div>
              <div className="col-span-1">
                <label htmlFor="lotNo" className="block text-xs font-bold text-slate-600 mb-1">LOT NO</label>
                <input id="lotNo" {...register('lotNo')} className="w-full rounded-md border border-slate-300 p-2 text-sm uppercase" placeholder="L-000" />
              </div>
              <div className="col-span-1">
                <label htmlFor="doNumber" className="block text-xs font-bold text-slate-600 mb-1">DO Number</label>
                <input id="doNumber" {...register('doNumber')} className="w-full rounded-md border border-slate-300 p-2 text-sm uppercase" placeholder="DO-000" />
              </div>
              <div className="col-span-1">
                <label htmlFor="cdfNo" className="block text-xs font-bold text-slate-600 mb-1">CDF No</label>
                <input id="cdfNo" {...register('cdfNo')} className="w-full rounded-md border border-slate-300 p-2 text-sm uppercase" placeholder="CDF-000" />
              </div>
              <div className="col-span-2">
                <label htmlFor="gatePass" className="block text-xs font-bold text-slate-600 mb-1">GATE PASS *</label>
                <input id="gatePass" {...register('gatePass')} className="w-full rounded-md border border-slate-300 p-2 text-sm uppercase border-blue-200 bg-blue-50" placeholder="GP-123456" />
                {errors.gatePass && <p className="text-red-500 text-[10px] mt-1">{errors.gatePass.message}</p>}
              </div>
              <div className="col-span-1">
                <label htmlFor="pass" className="block text-xs font-bold text-slate-600 mb-1">Pass</label>
                <input id="pass" {...register('pass')} className="w-full rounded-md border border-slate-300 p-2 text-sm uppercase" placeholder="---" />
              </div>
            </div>
          </div>

          {/* === CARD 4: Cargo Quants & Math === */}
          <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-6 ">
            <h3 className="text-md font-semibold text-slate-800 flex items-center mb-4 border-b pb-2">
              <Scale className="w-4 h-4 mr-2" /> 4. Scale Quantities
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-5 items-end">
              <div>
                <label htmlFor="bags" className="block text-xs font-bold text-slate-600 mb-1">Bag (Qty)</label>
                <input id="bags" type="number" {...register('bags')} className="w-full rounded-md border border-slate-300 p-2 text-sm bg-slate-50" placeholder="0" />
                {errors.bags && <p className="text-red-500 text-[10px] mt-1">{errors.bags.message}</p>}
              </div>
              <div>
                <label htmlFor="palaBags" className="block text-xs font-bold text-slate-600 mb-1">PALA BAG (Qty)</label>
                <input id="palaBags" type="number" {...register('palaBags')} className="w-full rounded-md border border-slate-300 p-2 text-sm bg-slate-50" placeholder="0" />
              </div>
              <div className="col-span-2">
                <label htmlFor="mt" className="block text-xs font-bold text-slate-600 mb-1">mt (Total Metric Tons) *</label>
                <input
                  id="mt"
                  type="number"
                  step="0.01"
                  {...register('mt')}
                  className={`w-full rounded-md border-2 p-3 text-lg font-bold focus:ring-0 ${watchedDirection === 'OUTWARD' && isError ? 'border-red-500 text-red-900 bg-red-50 focus:border-red-500' : 'border-emerald-400 text-emerald-900 bg-emerald-50 focus:border-emerald-500'}`}
                  placeholder="0.00"
                />
                {watchedDirection === 'OUTWARD' && availableStock !== null && (
                  <p className="text-sm font-semibold text-slate-800 mt-2">
                    Available: {formatWeight(availableStock)}
                  </p>
                )}
                {errors.mt && !isError && <p className="text-red-500 text-[10px] mt-1">{errors.mt.message}</p>}
              </div>
            </div>

          {direction === 'INWARD' && (
            <div className="mt-8 pt-4 border-t border-slate-100">
              <div className="flex flex-col sm:flex-row items-start sm:items-end gap-6 justify-between">
                <div className="flex flex-col sm:flex-row gap-5">
                  <div>
                    <label htmlFor="storageDays" className="block text-xs font-bold text-slate-600 mb-1">
                      Storage Duration (days)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="storageDays"
                        type="number"
                        {...register('storageDays')}
                        min={1}
                        className="w-24 rounded-md border border-slate-300 px-3 py-2 text-sm text-center font-bold bg-white text-slate-900"
                      />
                      <span className="text-sm font-semibold text-slate-500">Days</span>
                    </div>
                    {errors.storageDays && (
                      <p className="text-red-500 text-[10px] mt-1 font-bold">{errors.storageDays.message}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {direction === 'INWARD' && watchedMT > 0 && selectedRate > 0 && watchedDays > 0 && (
            <div className="mt-8 rounded-2xl bg-blue-50 border border-blue-200 p-8 shadow-sm">
              <div className="text-center">
                <p className="text-sm font-medium text-blue-700 uppercase tracking-wide mb-2">Estimated Storage Charges (Pro-Rata)</p>
                <p className="text-4xl font-bold text-blue-900">{formatCurrency(rentPreview?.totalAmount || 0)}</p>
                <p className="text-xs text-blue-600 mt-2">
                  {rentPreview?.totalDays} days × {watchedMT} MT × ₹{selectedRate}/MT/month ÷ 30 = {formatCurrency(rentPreview?.dailyRate || 0)}/day
                </p>
              </div>
            </div>
          )}

          {watchedDirection === 'OUTWARD' && isError && (
            <div className="mt-8 rounded-2xl bg-red-50 border-l-4 border-red-500 shadow-sm p-6 transition-all duration-300 ease-out">
              <div className="space-y-4">
                <div>
                  <p className="text-2xl font-bold text-red-700">Commodity not available</p>
                  <p className="text-sm text-red-600 mt-2">
                    The requested weight exceeds the current stock for this commodity in the selected warehouse.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4 bg-white rounded-2xl p-4 border border-red-100">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Requested</p>
                    <p className="text-lg font-semibold text-slate-900">{formatWeight(watchedMT)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Available</p>
                    <p className="text-lg font-semibold text-slate-900">{formatWeight(availableStock ?? 0)}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
          </div>

          {/* Action Footer */}
          {!(watchedDirection === 'OUTWARD' && isError) && (
            <div className="pt-6 flex justify-end">
              <button
                type="submit"
                disabled={isSubmittingEngine || isCheckingStock}
                className={`rounded-xl shadow-lg transition-all flex items-center justify-center py-4 px-10 font-bold ${isSubmittingEngine || isCheckingStock ? 'bg-slate-300 text-slate-700 cursor-not-allowed opacity-70 pointer-events-none' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}
              >
                {isSubmittingEngine ? 'Generating Invoice...' : 'Insert Row & Generate Invoice'}
                {isSubmittingEngine ? (
                  <Lock className="w-5 h-5 ml-2" />
                ) : (
                  <ChevronRight className="w-5 h-5 ml-2" />
                )}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
