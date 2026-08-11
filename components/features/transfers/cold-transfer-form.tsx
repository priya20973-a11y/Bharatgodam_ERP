'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { getAvailableInwardsForTransfer, createOwnershipTransfer } from '@/app/actions/cold-transfer-actions';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useColdTranslation } from '@/components/providers/cold-language-provider';

const formSchema = z.object({
  transferType: z.enum(['Self', 'Purchase']).default('Self'),
  fromClientId: z.string().min(1, 'Please select the current client'),
  inwardId: z.string().min(1, 'Please select an inward receipt'),
  toClientId: z.string().min(1, 'Please select the new client'),
  transferDate: z.string().min(1, 'A date of transfer is required.'),
  transferWeight: z.preprocess((val) => Number(val), z.number().min(0.01, 'Transfer weight must be greater than 0')),
  transferBags: z.preprocess((val) => Number(val), z.number().min(1, 'Transfer bags must be at least 1')),
});

interface ColdTransferFormProps {
  clients: any[];
}

export default function ColdTransferForm({ clients }: ColdTransferFormProps) {
  const router = useRouter();
  const { t, formatNumber } = useColdTranslation();
  
  const [availableInwards, setAvailableInwards] = useState<any[]>([]);
  const [loadingInwards, setLoadingInwards] = useState(false);
  const [selectedInwardDetails, setSelectedInwardDetails] = useState<any>(null);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema) as any,
    defaultValues: {
      transferType: 'Self',
      fromClientId: '',
      inwardId: '',
      toClientId: '',
      transferDate: new Date().toISOString().slice(0, 10),
      transferWeight: 0,
      transferBags: 0,
    },
  });

  const transferType = watch('transferType');
  const fromClientId = watch('fromClientId');
  const inwardId = watch('inwardId');
  const toClientId = watch('toClientId');

  useEffect(() => {
    async function fetchInwards() {
      if (!fromClientId) {
        setAvailableInwards([]);
        return;
      }
      setLoadingInwards(true);
      try {
        const data = await getAvailableInwardsForTransfer(fromClientId, transferType);
        setAvailableInwards(data);
      } catch (error) {
        console.error('Failed to fetch inwards', error);
      } finally {
        setLoadingInwards(false);
      }
    }
    fetchInwards();
    setValue('inwardId', ''); // reset selected inward when client or type changes
  }, [fromClientId, transferType, setValue]);

  useEffect(() => {
    if (inwardId && availableInwards.length > 0) {
      const inward = availableInwards.find(inv => inv._id === inwardId);
      setSelectedInwardDetails(inward || null);
      if (inward) {
        setValue('transferWeight', inward.availableQty);
        setValue('transferBags', inward.availableBags);
        if (transferType === 'Purchase' && inward.warehouseId?._id) {
          setValue('toClientId', inward.warehouseId._id);
        }
      }
    } else {
      setSelectedInwardDetails(null);
      setValue('transferWeight', 0);
      setValue('transferBags', 0);
      if (transferType === 'Purchase') {
        setValue('toClientId', '');
      }
    }
  }, [inwardId, availableInwards, setValue, transferType]);

  const onSubmit = async (values: any) => {
    if (values.fromClientId === values.toClientId) {
      alert("Cannot transfer to the same client.");
      return;
    }
    
    if (selectedInwardDetails) {
      if (values.transferWeight > selectedInwardDetails.availableQty) {
        alert("Transfer weight cannot exceed available stock.");
        return;
      }
      if (values.transferBags > selectedInwardDetails.availableBags) {
        alert("Transfer bags cannot exceed available bags.");
        return;
      }
    }

    try {
      const res = await createOwnershipTransfer({
        fromClientId: values.fromClientId,
        toClientId: values.toClientId,
        inwardId: values.inwardId,
        transferDate: new Date(values.transferDate).toISOString(),
        transferWeight: values.transferWeight,
        transferBags: values.transferBags,
        transferType: values.transferType,
      });

      if (res.success) {
        alert("Ownership has been transferred.");
        
        // Open receipt in new tab
        const url = `/api/cold/receipt/html?id=${res.transferId}&type=transfer`;
        window.open(url, '_blank');
        
        router.push('/cold/transfers');
      } else {
        alert("Transfer Failed: " + res.error);
      }
    } catch (error: any) {
      alert("Transfer Failed: " + (error.message || "An unexpected error occurred"));
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg border shadow-sm">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        
        <div className="space-y-4">
          <h3 className="text-lg font-medium">1. Select Source</h3>
          
          <div className="space-y-2 mb-4">
            <label className="text-sm font-medium leading-none">Transfer Type *</label>
            <Controller
              name="transferType"
              control={control}
              render={({ field }) => (
                <div className="flex flex-row space-x-6 mt-2">
                  <div className="flex items-center space-x-2">
                    <input 
                      type="radio" 
                      id="r1" 
                      name="transferType" 
                      value="Self" 
                      checked={field.value === "Self"} 
                      onChange={(e) => field.onChange(e.target.value)}
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                    />
                    <label htmlFor="r1" className="text-sm font-medium leading-none cursor-pointer">Self (Regular Transfer)</label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input 
                      type="radio" 
                      id="r2" 
                      name="transferType" 
                      value="Purchase" 
                      checked={field.value === "Purchase"} 
                      onChange={(e) => field.onChange(e.target.value)}
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                    />
                    <label htmlFor="r2" className="text-sm font-medium leading-none cursor-pointer">Purchase</label>
                  </div>
                </div>
              )}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Current Client (From Client) *</label>
              <Controller
                name="fromClientId"
                control={control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger className={errors.fromClientId ? "border-red-500" : ""}>
                      <SelectValue placeholder="Select Client" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map(c => (
                        <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.fromClientId && <p className="text-red-500 text-sm">{errors.fromClientId.message}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Inward Receipt * {loadingInwards && <Loader2 className="inline w-3 h-3 animate-spin ml-2" />}</label>
              <Controller
                name="inwardId"
                control={control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value} disabled={!fromClientId || availableInwards.length === 0}>
                    <SelectTrigger className={errors.inwardId ? "border-red-500" : ""}>
                      <SelectValue placeholder={availableInwards.length === 0 && fromClientId ? "No available stock found" : "Select Receipt"} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableInwards.map(inv => (
                        <SelectItem key={inv._id} value={inv._id}>
                          {inv.date ? new Date(inv.date).toISOString().slice(0, 10) : ''} - {inv.commodityId?.name} ({formatNumber(inv.availableQty)} {inv.unit || inv.commodityId?.unit || 'KG'})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.inwardId && <p className="text-red-500 text-sm">{errors.inwardId.message}</p>}
            </div>
          </div>
        </div>

        {selectedInwardDetails && (
          <div className="bg-slate-50 p-4 rounded-md border text-sm space-y-2">
            <h4 className="font-semibold text-slate-700">Available Stock Details</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-slate-500">Commodity</p>
                <p className="font-medium">{selectedInwardDetails.commodityId?.name}</p>
              </div>
              <div>
                <p className="text-slate-500">Warehouse</p>
                <p className="font-medium">{selectedInwardDetails.warehouseId?.name}</p>
              </div>
              <div>
                <p className="text-slate-500 text-red-600">Available Net Wt.</p>
                <p className="font-bold text-red-600">{formatNumber(selectedInwardDetails.availableQty)} {selectedInwardDetails.unit || selectedInwardDetails.commodityId?.unit || 'KG'}</p>
              </div>
              <div>
                <p className="text-slate-500 text-red-600">Available Bags</p>
                <p className="font-bold text-red-600">{formatNumber(selectedInwardDetails.availableBags)}</p>
              </div>
              <div className="col-span-2 md:col-span-4 mt-2">
                <p className="text-slate-500">Stack Allocations</p>
                <div className="mt-1 space-y-1">
                  {selectedInwardDetails.availableAllocations.map((alloc: any, idx: number) => (
                    <div key={idx} className="bg-white border px-3 py-1.5 rounded-sm flex justify-between">
                      <span>Chamber {String(alloc.chamberName || alloc.chamberNo).replace(/^Chamber\s+/i, '')} | Floor {alloc.floorNo} | Stack {alloc.stackNo}</span>
                      <span className="font-medium">{formatNumber(alloc.allocatedWeight)} {selectedInwardDetails.unit || selectedInwardDetails.commodityId?.unit || 'KG'} ({alloc.bagsCount} bags)</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4 pt-4 border-t">
          <h3 className="text-lg font-medium">2. Select Destination</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">New Client (To Client) *</label>
              {transferType === 'Purchase' ? (
                <div className="flex h-10 w-full items-center rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 font-medium">
                  {selectedInwardDetails?.warehouseId?.name || '-'}
                </div>
              ) : (
                <Controller
                  name="toClientId"
                  control={control}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger className={errors.toClientId ? "border-red-500" : ""}>
                        <SelectValue placeholder="Select Client" />
                      </SelectTrigger>
                      <SelectContent>
                        {clients.filter(c => c._id !== fromClientId).map(c => (
                          <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              )}
              {errors.toClientId && <p className="text-red-500 text-sm">{errors.toClientId.message}</p>}
            </div>

            <div className="space-y-2 flex flex-col">
              <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Date of Transfer *</label>
              <Controller
                name="transferDate"
                control={control}
                render={({ field }) => (
                  <input
                    type="date"
                    className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    {...field}
                  />
                )}
              />
              {errors.transferDate && <p className="text-red-500 text-sm">{errors.transferDate.message}</p>}
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div className="space-y-2 flex flex-col">
              <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Transfer Net Weight ({selectedInwardDetails?.unit || selectedInwardDetails?.commodityId?.unit || 'KG'}) *</label>
              <Controller
                name="transferWeight"
                control={control}
                render={({ field }) => (
                  <Input
                    type="number"
                    step="0.01"
                    className={errors.transferWeight ? "border-red-500" : ""}
                    {...field}
                  />
                )}
              />
              {errors.transferWeight && <p className="text-red-500 text-sm">{errors.transferWeight.message}</p>}
            </div>
            
            <div className="space-y-2 flex flex-col">
              <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Transfer Bags *</label>
              <Controller
                name="transferBags"
                control={control}
                render={({ field }) => (
                  <Input
                    type="number"
                    className={errors.transferBags ? "border-red-500" : ""}
                    {...field}
                  />
                )}
              />
              {errors.transferBags && <p className="text-red-500 text-sm">{errors.transferBags.message}</p>}
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <Button 
            type="button" 
            variant="outline" 
            className="mr-3" 
            onClick={() => router.push('/cold/transfers')}
          >
            Cancel
          </Button>
          <Button 
            type="submit" 
            disabled={isSubmitting || !selectedInwardDetails}
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Transfer Ownership
          </Button>
        </div>
      </form>
    </div>
  );
}
