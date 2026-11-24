'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, Controller, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Loader2, Plus, Trash2, Calendar, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { createColdPledge, getColdInwardsForPledge, getColdClientsForPledge } from '@/app/actions/cold-pledge-actions';
import { getColdPledgees } from '@/app/actions/cold-pledgee-actions';

const pledgeSchema = z.object({
  pledgeNo: z.string().min(1, 'Pledge Number is required'),
  loanDate: z.string().min(1, 'Loan Date is required'),
  repaymentDate: z.string().min(1, 'Repayment Date is required'),
  clientId: z.string().min(1, 'Client is required'),
  lenderId: z.string().min(1, 'Lender / Bank is required'),
  lenderName: z.string().optional(),
  loanAmount: z.coerce.number().min(1, 'Loan Amount must be greater than 0'),
  remarks: z.string().optional(),
  items: z.array(z.object({
    inwardId: z.string().min(1, 'Inward lot is required'),
    storageType: z.literal('COLD').default('COLD'),
    commodityId: z.string(),
    warehouseId: z.string(),
    chamberName: z.string().optional(),
    floorNo: z.number().optional(),
    stackNo: z.number().optional(),
    pledgedQuantity: z.coerce.number().min(0.01, 'Quantity must be > 0'),
    pledgedBags: z.coerce.number().min(1, 'Bags must be >= 1'),
  })).min(1, 'At least one inward lot must be selected')
}).refine((data) => {
  if (data.loanDate && data.repaymentDate) {
    const loanD = new Date(data.loanDate);
    const repayD = new Date(data.repaymentDate);
    const loanTime = new Date(loanD.getFullYear(), loanD.getMonth(), loanD.getDate()).getTime();
    const repayTime = new Date(repayD.getFullYear(), repayD.getMonth(), repayD.getDate()).getTime();
    return repayTime >= loanTime;
  }
  return true;
}, {
  message: 'Repayment Date must not be earlier than Loan Date',
  path: ['repaymentDate']
});

type PledgeFormValues = z.infer<typeof pledgeSchema>;

export default function ColdCreatePledgeForm() {
  const router = useRouter();
  const [clients, setClients] = useState<any[]>([]);
  const [banks, setBanks] = useState<any[]>([]);
  const [availableInwards, setAvailableInwards] = useState<any[]>([]);
  const [loadingInwards, setLoadingInwards] = useState(false);

  const { register, control, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<PledgeFormValues>({
    resolver: zodResolver(pledgeSchema) as any,
    defaultValues: {
      loanDate: new Date().toISOString().split('T')[0],
      repaymentDate: '',
      items: [{ inwardId: '', storageType: 'COLD', commodityId: '', warehouseId: '', pledgedQuantity: 0, pledgedBags: 0 }]
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items'
  });

  const selectedClientId = watch('clientId');
  const items = watch('items');

  // Find all selected inward details
  const selectedInwards = items
    .map(it => availableInwards.find(i => i._id === it.inwardId))
    .filter(Boolean);

  // Check if any selected lot has missing expiry date
  const missingExpiryLots = selectedInwards.filter(i => !(i.assayingExpiryDate || i.expiryDate));

  // Determine earliest expiry date among selected lots
  const earliestExpiryDateObj = selectedInwards.reduce<Date | null>((earliest, i) => {
    const exp = i.assayingExpiryDate || i.expiryDate;
    if (!exp) return earliest;
    const d = new Date(exp);
    return !earliest || d < earliest ? d : earliest;
  }, null);

  const earliestExpiryDateStr = earliestExpiryDateObj
    ? earliestExpiryDateObj.toISOString().split('T')[0]
    : undefined;

  useEffect(() => {
    // Fetch clients
    getColdClientsForPledge()
      .then(data => {
        if (Array.isArray(data)) {
          setClients(data);
        } else {
          setClients([]);
        }
      })
      .catch(() => toast.error('Failed to load clients'));

    // Fetch lenders from Cold Pledgee Master
    getColdPledgees()
      .then(data => {
        if (Array.isArray(data)) {
          setBanks(data);
        }
      })
      .catch(() => toast.error('Failed to load pledgees'));
  }, []);

  useEffect(() => {
    if (selectedClientId) {
      setLoadingInwards(true);
      getColdInwardsForPledge(selectedClientId)
        .then(data => {
          setAvailableInwards(data);
          setValue('items', [{ inwardId: '', storageType: 'COLD', commodityId: '', warehouseId: '', pledgedQuantity: 0, pledgedBags: 0 }]);
        })
        .catch(() => toast.error('Failed to load stock details'))
        .finally(() => setLoadingInwards(false));
    } else {
      setAvailableInwards([]);
    }
  }, [selectedClientId, setValue]);

  const onSubmit = async (data: PledgeFormValues) => {
    if (!data.repaymentDate) {
      toast.error('Repayment Date is required');
      return;
    }

    const repayD = new Date(data.repaymentDate);
    const repayTime = new Date(repayD.getFullYear(), repayD.getMonth(), repayD.getDate()).getTime();

    if (data.loanDate) {
      const loanD = new Date(data.loanDate);
      const loanTime = new Date(loanD.getFullYear(), loanD.getMonth(), loanD.getDate()).getTime();
      if (repayTime < loanTime) {
        toast.error('Repayment Date cannot be earlier than Loan Date');
        return;
      }
    }

    // Validation: ensure pledge doesn't exceed available & check stock expiry dates
    for (const item of data.items) {
      const inward = availableInwards.find(i => i._id === item.inwardId);
      if (!inward) {
        toast.error('Invalid inward selected');
        return;
      }
      if (item.pledgedQuantity > inward.availableForPledgeKg) {
        toast.error(`Pledged quantity for ${inward.receiptNumber || inward.lotNo} exceeds available stock (${inward.availableForPledgeKg.toLocaleString('en-IN')} Kg)`);
        return;
      }

      const inwardExpiry = inward.assayingExpiryDate || inward.expiryDate;
      if (!inwardExpiry) {
        const lotLabel = inward.lotNo ? `Lot: ${inward.lotNo}` : (inward.receiptNumber || 'Selected inward stock');
        toast.error(`${lotLabel} has no Expiry Date. Inward stock must have an Assaying Expiry Date before pledging.`);
        return;
      }

      const expD = new Date(inwardExpiry);
      const expTime = new Date(expD.getFullYear(), expD.getMonth(), expD.getDate()).getTime();
      if (repayTime > expTime) {
        const formattedExp = expD.toLocaleDateString('en-IN');
        toast.error(`Repayment Date cannot be later than Inward Stock Expiry Date (${formattedExp})`);
        return;
      }
    }

    try {
      const res = await createColdPledge(data as any);
      if (res.success) {
        toast.success('Cold Storage Pledge created successfully');
        router.push('/cold/pledges');
      } else {
        toast.error(res.error || 'Failed to create pledge');
      }
    } catch (error: any) {
      toast.error(error.message || 'Error creating pledge');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <div className="flex items-center space-x-4">
        <Button variant="ghost" onClick={() => router.back()} className="p-2 h-auto rounded-full">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Create Cold Storage Pledge</h1>
          <p className="text-sm text-slate-500">Record stock pledged against loans in Cold Storage</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
          <h2 className="text-lg font-semibold text-slate-800 border-b pb-2">Loan Details</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Pledge Number *</Label>
              <Input
                {...register('pledgeNo')}
                placeholder="e.g. PLG-COLD-001"
                className="bg-white"
              />
              {errors.pledgeNo && <p className="text-sm text-red-500">{errors.pledgeNo.message}</p>}
            </div>

            <div className="space-y-2">
              <Label>Client *</Label>
              <Controller
                name="clientId"
                control={control}
                render={({ field }) => (
                  <SearchableSelect
                    options={clients.map(c => ({ value: c._id, label: `${c.name}${c.mobile ? ` (${c.mobile})` : ''}` }))}
                    value={field.value}
                    onValueChange={(val) => field.onChange(val)}
                    placeholder="Select a client..."
                  />
                )}
              />
              {errors.clientId && <p className="text-sm text-red-500">{errors.clientId.message}</p>}
            </div>

            <div className="space-y-2">
              <Label>Lender / Bank *</Label>
              <Controller
                name="lenderId"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(val) => {
                      field.onChange(val);
                      const selectedBank = banks.find(b => b._id === val);
                      if (selectedBank) {
                        setValue('lenderName', selectedBank.name);
                      }
                    }}
                  >
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Select Lender / Bank" />
                    </SelectTrigger>
                    <SelectContent>
                      {banks.length === 0 ? (
                        <SelectItem value="none" disabled>No lenders configured in Pledge Master</SelectItem>
                      ) : (
                        banks.map(b => (
                          <SelectItem key={b._id} value={b._id}>
                            {b.name} ({b.type})
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.lenderId && <p className="text-sm text-red-500">{errors.lenderId.message}</p>}
            </div>

            <div className="space-y-2">
              <Label>Loan Amount (₹) *</Label>
              <Input
                type="number"
                step="any"
                {...register('loanAmount')}
                placeholder="e.g. 500000"
                className="bg-white"
              />
              {errors.loanAmount && <p className="text-sm text-red-500">{errors.loanAmount.message}</p>}
            </div>

            <div className="space-y-2">
              <Label>Loan Date *</Label>
              <Input
                type="date"
                {...register('loanDate')}
                className="bg-white"
              />
              {errors.loanDate && <p className="text-sm text-red-500">{errors.loanDate.message}</p>}
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label>Repayment Date *</Label>
                {earliestExpiryDateStr && (
                  <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Max allowed: {new Date(earliestExpiryDateStr).toLocaleDateString('en-IN')}
                  </span>
                )}
              </div>
              <Input
                type="date"
                {...register('repaymentDate')}
                min={watch('loanDate')}
                max={earliestExpiryDateStr}
                className="bg-white"
              />
              {errors.repaymentDate && <p className="text-sm text-red-500">{errors.repaymentDate.message}</p>}
              
              {missingExpiryLots.length > 0 && (
                <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2 mt-1">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    <strong>Warning:</strong> One or more selected stock lots do not have an Expiry Date from Assaying & Grading. Inward stock must have an expiry date to be pledged.
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Remarks</Label>
              <Textarea
                {...register('remarks')}
                placeholder="Optional notes or details about the pledge..."
                rows={2}
                className="bg-white"
              />
            </div>
          </div>
        </div>

        {/* Stock Items Selection */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex justify-between items-center border-b pb-2">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Pledge Stock Lots</h2>
              <p className="text-xs text-slate-500">Select Cold Storage inward lots and specify pledged weight & bags</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => append({ inwardId: '', storageType: 'COLD', commodityId: '', warehouseId: '', pledgedQuantity: 0, pledgedBags: 0 })}
              disabled={!selectedClientId}
              className="text-cyan-700 border-cyan-300 hover:bg-cyan-50"
            >
              <Plus className="w-4 h-4 mr-1" /> Add Stock Lot
            </Button>
          </div>

          {!selectedClientId ? (
            <div className="text-center py-8 text-slate-500 text-sm">
              Please select a client above to view and pledge their stock.
            </div>
          ) : loadingInwards ? (
            <div className="text-center py-8 text-slate-500 flex items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" /> Loading client stock...
            </div>
          ) : availableInwards.length === 0 ? (
            <div className="text-center py-8 text-amber-600 bg-amber-50 rounded-lg p-4 text-sm border border-amber-200">
              No graded stock available for pledge for this client. Only inward stock with Grading enabled is eligible for pledging.
            </div>
          ) : (
            <div className="space-y-4">
              {fields.map((field, index) => {
                const currentInwardId = watch(`items.${index}.inwardId`);
                const inwardDetails = availableInwards.find(i => i._id === currentInwardId);

                return (
                  <div key={field.id} className="p-4 bg-slate-50 border rounded-xl space-y-4 relative">
                    {fields.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-2 text-slate-400 hover:text-red-500"
                        onClick={() => remove(index)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2 md:col-span-3">
                        <Label>Select Inward Lot *</Label>
                        <Controller
                          name={`items.${index}.inwardId`}
                          control={control}
                          render={({ field: inwardField }) => (
                            <Select
                              value={inwardField.value}
                              onValueChange={(val) => {
                                inwardField.onChange(val);
                                const selected = availableInwards.find(i => i._id === val);
                                if (selected) {
                                  setValue(`items.${index}.commodityId`, selected.commodityId?._id || selected.commodityId);
                                  setValue(`items.${index}.warehouseId`, selected.warehouseId?._id || selected.warehouseId);
                                  setValue(`items.${index}.storageType`, 'COLD');
                                  setValue(`items.${index}.pledgedQuantity`, selected.availableForPledgeKg);
                                  setValue(`items.${index}.pledgedBags`, selected.availableForPledgeBags);
                                }
                              }}
                            >
                              <SelectTrigger className="bg-white">
                                <SelectValue placeholder="Choose an available inward lot..." />
                              </SelectTrigger>
                              <SelectContent>
                                {availableInwards.map(inw => (
                                  <SelectItem key={inw._id} value={inw._id}>
                                    {inw.lotNo ? `Lot: ${inw.lotNo}` : (inw.receiptNumber || 'Receipt')} &mdash; {inw.commodityName} &mdash; Avail: {inw.availableForPledgeKg?.toLocaleString('en-IN')} Kg ({inw.availableForPledgeBags} bags) &mdash; {inw.warehouseName} &mdash; Grading: Yes
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </div>

                      {inwardDetails && (
                        <>
                          <div className="space-y-1 bg-white p-3 rounded-lg border text-xs col-span-3 grid grid-cols-2 md:grid-cols-4 gap-2">
                            <div>
                              <span className="text-slate-400 block font-medium">Lot No. / Receipt No.:</span>
                              <span className="font-semibold text-slate-800">
                                {inwardDetails.lotNo ? `Lot: ${inwardDetails.lotNo}` : (inwardDetails.receiptNumber || '—')}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 block font-medium">Commodity:</span>
                              <span className="font-semibold text-slate-800">{inwardDetails.commodityName}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block font-medium">Warehouse:</span>
                              <span className="font-semibold text-slate-800">{inwardDetails.warehouseName}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block font-medium">Grading Status:</span>
                              <span className="font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                                ✓ Graded
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 block font-medium">Available to Pledge:</span>
                              <span className="font-bold text-cyan-700">
                                {inwardDetails.availableForPledgeKg?.toLocaleString('en-IN')} Kg ({inwardDetails.availableForPledgeBags} bags)
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 block font-medium">Stock Expiry Date:</span>
                              <span className={`font-semibold ${inwardDetails.assayingExpiryDate ? 'text-emerald-700' : 'text-red-600'}`}>
                                {inwardDetails.assayingExpiryDate ? new Date(inwardDetails.assayingExpiryDate).toLocaleDateString('en-IN') : 'Missing Expiry Date'}
                              </span>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label>Pledged Weight (Kg) *</Label>
                            <Input
                              type="number"
                              step="any"
                              {...register(`items.${index}.pledgedQuantity`)}
                              max={inwardDetails.availableForPledgeKg}
                              className="bg-white"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label>Pledged Bags *</Label>
                            <Input
                              type="number"
                              step="1"
                              {...register(`items.${index}.pledgedBags`)}
                              max={inwardDetails.availableForPledgeBags}
                              className="bg-white"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting} className="bg-cyan-700 hover:bg-cyan-800 text-white">
            {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Create Pledge
          </Button>
        </div>
      </form>
    </div>
  );
}
