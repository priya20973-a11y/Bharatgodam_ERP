'use client';

import React, { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { createColdEnvironmentRecord } from '@/app/actions/cold-environment-actions';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';

const formSchema = z.object({
  warehouseId: z.string().min(1, 'Please select a warehouse'),
  chamberName: z.string().min(1, 'Please select a chamber'),
  floorNo: z.coerce.number().min(1, 'Please select a floor'),
  date: z.string().min(1, 'Please enter a valid date and time'),
  temperature: z.coerce.number(),
  moisture: z.coerce.number().min(0, 'Moisture cannot be negative').max(100, 'Moisture cannot exceed 100%'),
  notes: z.string().optional(),
});

export default function ColdEnvironmentForm({ warehouses }: { warehouses: any[] }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedWarehouse, setSelectedWarehouse] = useState<any>(null);
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema) as any,
    defaultValues: {
      warehouseId: '',
      chamberName: '',
      floorNo: 0,
      date: new Date().toISOString().slice(0, 16),
      temperature: 0,
      moisture: 0,
      notes: '',
    },
  });

  const watchWarehouseId = form.watch('warehouseId');
  const watchChamberName = form.watch('chamberName');

  useEffect(() => {
    if (watchWarehouseId) {
      const wh = warehouses.find(w => w._id === watchWarehouseId);
      setSelectedWarehouse(wh || null);
    } else {
      setSelectedWarehouse(null);
    }
  }, [watchWarehouseId, warehouses]);

  useEffect(() => {
    form.setValue('chamberName', '');
    form.setValue('floorNo', 0);
  }, [watchWarehouseId, form]);

  useEffect(() => {
    form.setValue('floorNo', 0);
  }, [watchChamberName, form]);

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      setIsSubmitting(true);
      await createColdEnvironmentRecord({
        warehouseId: values.warehouseId,
        chamberName: values.chamberName,
        floorNo: values.floorNo,
        date: new Date(values.date),
        temperature: values.temperature,
        moisture: values.moisture,
        notes: values.notes,
      });
      form.reset({
        warehouseId: '',
        chamberName: '',
        floorNo: 0,
        date: new Date().toISOString().slice(0, 16),
        temperature: 0,
        moisture: 0,
        notes: '',
      });
      alert('Environment record created successfully');
    } catch (error: any) {
      alert(error.message || 'Failed to create record');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getChambers = () => {
    if (!selectedWarehouse) return [];
    return Array.from({ length: selectedWarehouse.noOfChambers || 0 }, (_, i) => `Chamber ${i + 1}`);
  };

  const getFloors = () => {
    if (!selectedWarehouse) return [];
    return Array.from({ length: selectedWarehouse.noOfFloors || 0 }, (_, i) => i + 1);
  };

  return (
    <div className="bg-white p-6 rounded-lg border shadow-sm h-full">
      <h2 className="text-xl font-bold tracking-tight text-slate-900 mb-6">Add New Environment Record</h2>
      
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Warehouse</label>
            <Controller
              control={form.control}
              name="warehouseId"
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Warehouse" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.map((w) => (
                      <SelectItem key={w._id} value={w._id}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {form.formState.errors.warehouseId && (
              <p className="text-xs text-red-500">{form.formState.errors.warehouseId.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Chamber</label>
            <Controller
              control={form.control}
              name="chamberName"
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value} disabled={!watchWarehouseId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Chamber" />
                  </SelectTrigger>
                  <SelectContent>
                    {getChambers().map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {form.formState.errors.chamberName && (
              <p className="text-xs text-red-500">{form.formState.errors.chamberName.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Floor</label>
            <Controller
              control={form.control}
              name="floorNo"
              render={({ field }) => (
                <Select onValueChange={(val) => field.onChange(parseInt(val))} value={field.value ? field.value.toString() : ''} disabled={!watchChamberName}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Floor" />
                  </SelectTrigger>
                  <SelectContent>
                    {getFloors().map((f) => (
                      <SelectItem key={f} value={f.toString()}>Floor {f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {form.formState.errors.floorNo && (
              <p className="text-xs text-red-500">{form.formState.errors.floorNo.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Recorded Date & Time</label>
            <Input type="datetime-local" {...form.register('date')} />
            {form.formState.errors.date && (
              <p className="text-xs text-red-500">{form.formState.errors.date.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Temperature (°C)</label>
            <Input type="number" step="0.1" placeholder="e.g. -12.5" {...form.register('temperature')} />
            {form.formState.errors.temperature && (
              <p className="text-xs text-red-500">{form.formState.errors.temperature.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Moisture (%)</label>
            <Input type="number" step="0.1" min="0" max="100" placeholder="e.g. 60" {...form.register('moisture')} />
            {form.formState.errors.moisture && (
              <p className="text-xs text-red-500">{form.formState.errors.moisture.message}</p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Notes</label>
          <Input placeholder="Optional notes" {...form.register('notes')} />
        </div>

        <Button type="submit" className="w-full sm:w-auto mt-4" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          + Save Record
        </Button>
      </form>
    </div>
  );
}
