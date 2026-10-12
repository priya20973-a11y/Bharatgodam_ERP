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
import { ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { createPledge, getInwardsForPledge, getClientsForPledge } from '@/app/actions/pledge-actions';
import { getPledgees } from '@/app/actions/pledgee-actions';

const pledgeSchema = z.object({
  pledgeNo: z.string().min(1, 'Pledge Number is required'),
  loanDate: z.string().min(1, 'Loan Date is required'),
  repaymentDate: z.string().min(1, 'Repayment Date is required'),
  clientId: z.string().min(1, 'Client is required'),
  lenderId: z.string().min(1, 'Bank is required'),
  lenderName: z.string().optional(),
  loanAmount: z.coerce.number().min(1, 'Loan Amount must be greater than 0'),
  remarks: z.string().optional(),
  items: z.array(z.object({
    inwardId: z.string().min(1, 'Inward is required'),
    storageType: z.enum(['DRY', 'COLD']).optional(),
    commodityId: z.string(),
    warehouseId: z.string(),
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

export default function CreatePledgeForm() {
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
      items: [{ inwardId: '', storageType: 'DRY', commodityId: '', warehouseId: '', pledgedQuantity: 0, pledgedBags: 0 }]
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
    // Fetch clients directly from Client Master
    getClientsForPledge()
      .then(data => {
        if (Array.isArray(data)) {
          setClients(data);
        } else {
          setClients([]);
        }
      })
      .catch(() => toast.error('Failed to load clients'));

    // Fetch banks from Pledgee Master
    getPledgees()
      .then(data => {
        if (Array.isArray(data)) {
          setBanks(data.filter((p: any) => p.type === 'Bank'));
        }
      })
      .catch(() => toast.error('Failed to load banks'));
  }, []);

  useEffect(() => {
    if (selectedClientId) {
      setLoadingInwards(true);
      getInwardsForPledge(selectedClientId)
        .then(data => {
          setAvailableInwards(data);
          // Reset items when client changes
          setValue('items', [{ inwardId: '', storageType: 'DRY', commodityId: '', warehouseId: '', pledgedQuantity: 0, pledgedBags: 0 }]);
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
      if (item.pledgedQuantity > inward.availableForPledgeMT) {
        toast.error(`Pledged quantity for ${inward.receiptNumber || inward.lotNo} exceeds available stock (${inward.availableForPledgeMT} MT)`);
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
      const res = await createPledge(data);
      if (res.success) {
        toast.success('Pledge created successfully');
        router.push('/dashboard/pledges');
      } else {
        toast.error(res.error || 'Failed to create pledge');
      }
    } catch (error: any) {
      toast.error(error.message || 'Error creating pledge');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center space-x-4">
        <Button variant="ghost" onClick={() => router.back()} className="p-2 h-auto rounded-full">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Create New Pledge</h1>
          <p className="text-sm text-slate-500">Block stock against a loan</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-8">
        {/* Basic Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label>Pledge / Loan No. *</Label>
            <Input {...register('pledgeNo')} placeholder="Enter Pledge Number" />
            {errors.pledgeNo && <p className="text-xs text-red-500">{errors.pledgeNo.message}</p>}
          </div>

          <div className="space-y-2">
            <Label>Client *</Label>
            <Controller
              name="clientId"
              control={control}
              render={({ field }) => (
                <SearchableSelect 
                  options={clients.map(c => ({ 
                    value: c._id || c.id, 
                    label: `${c.name || 'Unknown'}${c.mobile ? ` - ${c.mobile}` : ''}` 
                  }))}
                  value={field.value}
                  onValueChange={field.onChange}
                  placeholder="Search and select client..."
                />
              )}
            />
            {errors.clientId && <p className="text-xs text-red-500">{errors.clientId.message}</p>}
          </div>

          <div className="space-y-2">
            <Label>Bank *</Label>
            <Controller
              name="lenderId"
              control={control}
              render={({ field }) => (
                <Select
                  onValueChange={(val) => {
                    field.onChange(val);
                    const selectedBank = banks.find(b => b._id === val);
                    if (selectedBank) {
                      setValue('lenderName', selectedBank.name);
                    }
                  }}
                  value={field.value}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a Bank" />
                  </SelectTrigger>
                  <SelectContent>
                    {banks.length === 0 ? (
                      <SelectItem value="empty" disabled>No banks found. Please add a bank in Pledgee Master.</SelectItem>
                    ) : (
                      banks.map((bank) => (
                        <SelectItem key={bank._id} value={bank._id}>
                          {bank.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.lenderId && <p className="text-xs text-red-500">{errors.lenderId.message}</p>}
          </div>

          <div className="space-y-2">
            <Label>Loan Amount (₹) *</Label>
            <Input type="number" {...register('loanAmount')} placeholder="0.00" />
            {errors.loanAmount && <p className="text-xs text-red-500">{errors.loanAmount.message}</p>}
          </div>

          <div className="space-y-2">
            <Label>Loan Date *</Label>
            <Input type="date" {...register('loanDate')} />
            {errors.loanDate && <p className="text-xs text-red-500">{errors.loanDate.message}</p>}
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label>Repayment Date *</Label>
              {earliestExpiryDateObj && (
                <span className="text-xs text-slate-500 font-medium">
                  Stock Expiry: {earliestExpiryDateObj.toLocaleDateString('en-IN')}
                </span>
              )}
            </div>
            <Input 
              type="date" 
              max={earliestExpiryDateStr}
              className={errors.repaymentDate ? 'border-red-500 bg-white' : 'bg-white'}
              {...register('repaymentDate')} 
            />
            {errors.repaymentDate && <p className="text-xs text-red-500">{errors.repaymentDate.message}</p>}
            {!errors.repaymentDate && earliestExpiryDateObj && (
              <p className="text-[11px] text-slate-500">
                Repayment Date must be on or before Inward Stock Expiry Date ({earliestExpiryDateObj.toLocaleDateString('en-IN')}).
              </p>
            )}
            {!errors.repaymentDate && missingExpiryLots.length > 0 && (
              <p className="text-[11px] text-red-500 font-medium">
                ⚠️ Selected stock lot has no Expiry Date. Inward stock must have an expiry date to pledge.
              </p>
            )}
          </div>
        </div>

        {/* Stock Selection */}
        <div className="space-y-4 pt-4 border-t border-slate-100">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-slate-800">Select Stock to Pledge</h3>
            <Button 
              type="button" 
              variant="outline" 
              size="sm" 
              onClick={() => append({ inwardId: '', storageType: 'DRY', commodityId: '', warehouseId: '', pledgedQuantity: 0, pledgedBags: 0 })}
              disabled={!selectedClientId}
            >
              <Plus className="w-4 h-4 mr-2" /> Add Lot
            </Button>
          </div>

          {!selectedClientId && (
            <div className="p-4 bg-slate-50 text-slate-500 text-sm text-center rounded-lg border border-slate-100">
              Please select a client to load available stock
            </div>
          )}

          {selectedClientId && loadingInwards && (
            <div className="flex items-center justify-center p-4">
              <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
            </div>
          )}

          {selectedClientId && !loadingInwards && availableInwards.length === 0 && (
            <div className="p-4 bg-amber-50 text-amber-600 text-sm text-center rounded-lg border border-amber-100">
              No available unpledged stock found for this client.
            </div>
          )}

          {fields.map((field, index) => {
            const selectedInwardId = items[index]?.inwardId;
            const inwardDetails = availableInwards.find(i => i._id === selectedInwardId);

            return (
              <div key={field.id} className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="font-medium text-slate-700">Lot {index + 1}</h4>
                  {fields.length > 1 && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)} className="text-red-500 hover:text-red-600 hover:bg-red-50">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-2 md:col-span-4">
                    <Label>Select Inward Lot *</Label>
                    <Controller
                      name={`items.${index}.inwardId`}
                      control={control}
                      render={({ field }) => (
                        <Select 
                          onValueChange={(val) => {
                            field.onChange(val);
                            const inv = availableInwards.find(i => i._id === val);
                            if (inv) {
                              setValue(`items.${index}.commodityId`, inv.commodityId._id || inv.commodityId);
                              setValue(`items.${index}.warehouseId`, inv.warehouseId._id || inv.warehouseId);
                              setValue(`items.${index}.pledgedQuantity`, inv.availableForPledgeMT);
                              setValue(`items.${index}.pledgedBags`, inv.availableForPledgeBags);
                              setValue(`items.${index}.storageType`, inv.storageType);
                            }
                          }} 
                          value={field.value}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select Inward Receipt / Lot" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableInwards.map(inv => {
                              const alreadySelected = items.some((item, i) => item.inwardId === inv._id && i !== index);
                              const expLabel = inv.assayingExpiryDate || inv.expiryDate
                                ? `Exp: ${new Date(inv.assayingExpiryDate || inv.expiryDate).toLocaleDateString('en-IN')}`
                                : 'No Expiry';
                              return (
                                <SelectItem key={inv._id} value={inv._id} disabled={alreadySelected}>
                                  {inv.lotNo ? `Lot: ${inv.lotNo}` : (inv.receiptNumber || 'N/A')} - {inv.commodityName} ({inv.availableForPledgeMT} MT Available) - {expLabel}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {errors.items?.[index]?.inwardId && <p className="text-xs text-red-500">{errors.items[index]?.inwardId?.message}</p>}
                  </div>

                  {inwardDetails && (
                    <>
                      <div className="space-y-2">
                        <Label>Available to Pledge</Label>
                        <div className="p-2 bg-slate-200 rounded-md text-sm font-medium">
                          {inwardDetails.availableForPledgeMT} MT / {inwardDetails.availableForPledgeBags} Bags
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Stock Expiry Date</Label>
                        <div className={`p-2 rounded-md text-sm font-medium ${
                          inwardDetails.assayingExpiryDate || inwardDetails.expiryDate
                            ? 'bg-slate-200 text-slate-800'
                            : 'bg-red-50 text-red-600 border border-red-200'
                        }`}>
                          {inwardDetails.assayingExpiryDate || inwardDetails.expiryDate
                            ? new Date(inwardDetails.assayingExpiryDate || inwardDetails.expiryDate).toLocaleDateString('en-IN')
                            : 'No Expiry Date'}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Pledge Quantity (MT) *</Label>
                        <Input type="number" step="0.01" {...register(`items.${index}.pledgedQuantity`)} />
                        {errors.items?.[index]?.pledgedQuantity && <p className="text-xs text-red-500">{errors.items[index]?.pledgedQuantity?.message}</p>}
                      </div>

                      <div className="space-y-2">
                        <Label>Pledge Bags *</Label>
                        <Input type="number" {...register(`items.${index}.pledgedBags`)} />
                        {errors.items?.[index]?.pledgedBags && <p className="text-xs text-red-500">{errors.items[index]?.pledgedBags?.message}</p>}
                      </div>

                      {!(inwardDetails.assayingExpiryDate || inwardDetails.expiryDate) && (
                        <div className="md:col-span-4 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                          ⚠️ This inward stock lot does not have an Expiry Date from Assaying & Grading. Inward stock must have an Assaying Expiry Date before it can be pledged.
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="space-y-2 pt-4 border-t border-slate-100">
          <Label>Remarks (Optional)</Label>
          <Textarea {...register('remarks')} placeholder="Add any notes about this pledge..." className="resize-none" />
        </div>

        <div className="pt-6">
          <Button type="submit" className="w-full bg-orange-600 hover:bg-orange-700 h-11" disabled={isSubmitting}>
            {isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : 'Save Pledge & Block Stock'}
          </Button>
        </div>
      </form>
    </div>
  );
}
