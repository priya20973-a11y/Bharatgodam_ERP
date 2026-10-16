'use client';

import { useState, useEffect } from 'react';
import { createWarehouse, updateWarehouse } from '@/app/actions/warehouse-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'react-hot-toast';
import { Plus, Trash2, Building, KeyRound, Percent } from 'lucide-react';

interface WarehouseFormProps {
  warehouse?: any;
  onSuccess: () => void;
}

interface Insurance {
  policyName: string;
  companyName: string;
  policyNumber: string;
  amount: string | number;
  validityStart: string;
  validityEnd: string;
}

export default function WarehouseForm({ warehouse, onSuccess }: WarehouseFormProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    warehouseId: warehouse?.warehouseId || '',
    name: warehouse?.name || '',
    address: warehouse?.address || '',
    totalCapacity: warehouse?.totalCapacity || 0,
    warehouseType: (warehouse?.warehouseType || 'Owner') as 'Rented' | 'Owner',
    platformCommission: warehouse?.platformCommission !== undefined 
      ? Number(warehouse.platformCommission) 
      : (warehouse?.ownerEarnings !== undefined ? 100 - Number(warehouse.ownerEarnings) : (warehouse?.ownerEquity !== undefined ? 100 - Number(warehouse.ownerEquity) : 40)),
    ownerEarnings: warehouse?.ownerEarnings !== undefined 
      ? Number(warehouse.ownerEarnings) 
      : (warehouse?.ownerEquity !== undefined ? Number(warehouse.ownerEquity) : 60),
  });

  const formatDateForInput = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
  };

  const [insurances, setInsurances] = useState<Insurance[]>([]);

  useEffect(() => {
    const whType = (warehouse?.warehouseType || 'Owner') as 'Rented' | 'Owner';
    setFormData({
      warehouseId: warehouse?.warehouseId || '',
      name: warehouse?.name || '',
      address: warehouse?.address || '',
      totalCapacity: warehouse?.totalCapacity || 0,
      warehouseType: whType,
      platformCommission: warehouse?.platformCommission !== undefined 
        ? Number(warehouse.platformCommission) 
        : (whType === 'Rented' ? 100 : (warehouse?.ownerEarnings !== undefined ? 100 - Number(warehouse.ownerEarnings) : (warehouse?.ownerEquity !== undefined ? 100 - Number(warehouse.ownerEquity) : 40))),
      ownerEarnings: warehouse?.ownerEarnings !== undefined 
        ? Number(warehouse.ownerEarnings) 
        : (whType === 'Rented' ? 0 : (warehouse?.ownerEquity !== undefined ? Number(warehouse.ownerEquity) : 60)),
    });
    setInsurances(
      warehouse?.insurances?.map((ins: any) => ({
        policyName: ins.policyName || '',
        companyName: ins.companyName || '',
        policyNumber: ins.policyNumber || '',
        amount: ins.amount || '',
        validityStart: formatDateForInput(ins.validityStart),
        validityEnd: formatDateForInput(ins.validityEnd),
      })) || []
    );
  }, [warehouse]);

  const handleAddInsurance = () => {
    setInsurances([
      ...insurances, 
      { policyName: '', companyName: '', policyNumber: '', amount: '', validityStart: '', validityEnd: '' }
    ]);
  };

  const handleRemoveInsurance = (index: number) => {
    const newInsurances = [...insurances];
    newInsurances.splice(index, 1);
    setInsurances(newInsurances);
  };

  const handleInsuranceChange = (index: number, field: keyof Insurance, value: string | number) => {
    const newInsurances = [...insurances];
    newInsurances[index] = { ...newInsurances[index], [field]: value };
    setInsurances(newInsurances);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (formData.warehouseType === 'Owner') {
        const pc = Number(formData.platformCommission);
        const oe = Number(formData.ownerEarnings);

        if (isNaN(pc) || isNaN(oe)) {
          toast.error('Platform Commission and Owner Earnings must be valid numbers');
          setLoading(false);
          return;
        }

        if (pc < 0 || pc > 100 || oe < 0 || oe > 100) {
          toast.error('Platform Commission and Owner Earnings must be between 0 and 100%');
          setLoading(false);
          return;
        }

        const total = Number((pc + oe).toFixed(2));
        if (total !== 100) {
          toast.error(`Total percentage must equal exactly 100% (currently ${total}%)`);
          setLoading(false);
          return;
        }
      }

      const formattedInsurances = insurances.map(ins => ({
        policyName: ins.policyName || undefined,
        companyName: ins.companyName || undefined,
        policyNumber: ins.policyNumber || undefined,
        amount: ins.amount ? Number(ins.amount) : undefined,
        validityStart: ins.validityStart ? new Date(ins.validityStart) : undefined,
        validityEnd: ins.validityEnd ? new Date(ins.validityEnd) : undefined,
      }));

      const payload = {
        ...formData,
        platformCommission: formData.warehouseType === 'Rented' ? 100 : Number(formData.platformCommission),
        ownerEarnings: formData.warehouseType === 'Rented' ? 0 : Number(formData.ownerEarnings),
        insurances: formattedInsurances,
      };

      const res = warehouse 
        ? await updateWarehouse(warehouse.id || warehouse._id, payload)
        : await createWarehouse(payload);

      if (res.success) {
        toast.success(warehouse ? 'Warehouse updated' : 'Warehouse created');
        onSuccess();
      } else {
        toast.error(res.error || 'Failed to save warehouse');
      }
    } catch (err) {
      toast.error('Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 p-4 border rounded-lg bg-slate-50 overflow-y-auto max-h-[80vh]">
      <div className="space-y-4">
        <h3 className="font-semibold text-lg">{warehouse ? 'Edit Warehouse' : 'Add New Warehouse'}</h3>
        <div className="space-y-2">
          <label className="text-sm font-medium">Warehouse ID (Optional)</label>
          <Input 
            value={formData.warehouseId} 
            onChange={(e) => setFormData({ ...formData, warehouseId: e.target.value })} 
            placeholder="e.g. WH-001"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Warehouse Name *</label>
          <Input 
            required 
            value={formData.name} 
            onChange={(e) => setFormData({ ...formData, name: e.target.value })} 
            placeholder="e.g. Central Silo A"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Address *</label>
          <Input 
            required 
            value={formData.address} 
            onChange={(e) => setFormData({ ...formData, address: e.target.value })} 
            placeholder="Full Address"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Total Capacity (MT) *</label>
          <Input 
            required 
            type="number" 
            value={formData.totalCapacity} 
            onChange={(e) => setFormData({ ...formData, totalCapacity: Number(e.target.value) })} 
            placeholder="3000"
          />
        </div>

        {/* Warehouse Type Selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">Warehouse Type *</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                setFormData(prev => ({
                  ...prev,
                  warehouseType: 'Owner',
                  platformCommission: prev.platformCommission === 100 && prev.ownerEarnings === 0 ? 40 : prev.platformCommission,
                  ownerEarnings: prev.platformCommission === 100 && prev.ownerEarnings === 0 ? 60 : prev.ownerEarnings,
                }));
              }}
              className={`flex items-center justify-center gap-2 p-3 rounded-lg border text-sm font-medium transition-all ${
                formData.warehouseType === 'Owner'
                  ? 'border-indigo-600 bg-indigo-50/70 text-indigo-700 ring-2 ring-indigo-600/20 shadow-sm'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Building className="w-4 h-4" />
              Owner
            </button>
            <button
              type="button"
              onClick={() => {
                setFormData(prev => ({
                  ...prev,
                  warehouseType: 'Rented',
                  platformCommission: 100,
                  ownerEarnings: 0,
                }));
              }}
              className={`flex items-center justify-center gap-2 p-3 rounded-lg border text-sm font-medium transition-all ${
                formData.warehouseType === 'Rented'
                  ? 'border-indigo-600 bg-indigo-50/70 text-indigo-700 ring-2 ring-indigo-600/20 shadow-sm'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <KeyRound className="w-4 h-4" />
              Rented
            </button>
          </div>
          <p className="text-xs text-slate-500">
            {formData.warehouseType === 'Owner'
              ? 'Revenue will be split between Platform and Warehouse Owner according to the configured percentages.'
              : 'Rented facility — storage revenue is not subject to owner revenue split.'}
          </p>
        </div>

        {/* Owner Revenue Split Configuration */}
        {formData.warehouseType === 'Owner' && (
          <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/40 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-semibold text-sm text-slate-800">
                <Percent className="w-4 h-4 text-indigo-600" />
                <span>Revenue Split Configuration</span>
              </div>
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                Number((Number(formData.platformCommission || 0) + Number(formData.ownerEarnings || 0)).toFixed(2)) === 100
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-rose-100 text-rose-700'
              }`}>
                Total: {Number((Number(formData.platformCommission || 0) + Number(formData.ownerEarnings || 0)).toFixed(2))}%{' '}
                {Number((Number(formData.platformCommission || 0) + Number(formData.ownerEarnings || 0)).toFixed(2)) === 100 ? '✓' : '(Must be 100%)'}
              </span>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Platform Commission (%) *</label>
                <Input
                  required
                  type="number"
                  min="0"
                  max="100"
                  step="any"
                  value={formData.platformCommission}
                  onChange={(e) => {
                    const val = e.target.value === '' ? '' : Number(e.target.value);
                    setFormData(prev => ({ ...prev, platformCommission: val as any }));
                  }}
                  placeholder="40"
                />
                <p className="text-xs text-slate-500">Management & platform charges.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Owner Earnings (%) *</label>
                <Input
                  required
                  type="number"
                  min="0"
                  max="100"
                  step="any"
                  value={formData.ownerEarnings}
                  onChange={(e) => {
                    const val = e.target.value === '' ? '' : Number(e.target.value);
                    setFormData(prev => ({ ...prev, ownerEarnings: val as any }));
                  }}
                  placeholder="60"
                />
                <p className="text-xs text-slate-500">Disbursed to warehouse owner.</p>
              </div>
            </div>

            {Number((Number(formData.platformCommission || 0) + Number(formData.ownerEarnings || 0)).toFixed(2)) !== 100 && (
              <div className="flex items-center justify-between text-xs text-rose-600 bg-rose-50 p-2 rounded border border-rose-200">
                <span>Total percentage must equal exactly 100%.</span>
                <button
                  type="button"
                  onClick={() => {
                    const pc = Math.min(100, Math.max(0, Number(formData.platformCommission) || 0));
                    setFormData(prev => ({
                      ...prev,
                      platformCommission: pc,
                      ownerEarnings: Number((100 - pc).toFixed(2))
                    }));
                  }}
                  className="underline font-semibold hover:text-rose-800"
                >
                  Balance to 100%
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="pt-4 border-t border-slate-200 space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="font-semibold text-md text-slate-800">Insurance Details (Optional)</h3>
          <Button type="button" variant="outline" size="sm" onClick={handleAddInsurance} className="gap-2">
            <Plus className="w-4 h-4" /> Add Insurance
          </Button>
        </div>

        {insurances.map((ins, index) => (
          <div key={index} className="p-4 border rounded-md bg-white space-y-4 relative">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => handleRemoveInsurance(index)}
              className="absolute top-2 right-2 text-red-500 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
            
            <h4 className="text-sm font-medium text-slate-500">Policy {index + 1}</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Name of Insurance Policy</label>
                <Input 
                  value={ins.policyName} 
                  onChange={(e) => handleInsuranceChange(index, 'policyName', e.target.value)} 
                  placeholder="e.g. Standard Fire and Special Perils"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Name of Insurance Company</label>
                <Input 
                  value={ins.companyName} 
                  onChange={(e) => handleInsuranceChange(index, 'companyName', e.target.value)} 
                  placeholder="e.g. ICICI Lombard"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Policy Number</label>
                <Input 
                  value={ins.policyNumber} 
                  onChange={(e) => handleInsuranceChange(index, 'policyNumber', e.target.value)} 
                  placeholder="e.g. POL12345678"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Insured Amount</label>
                <Input 
                  type="number"
                  value={ins.amount} 
                  onChange={(e) => handleInsuranceChange(index, 'amount', e.target.value)} 
                  placeholder="e.g. 5000000"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Validity Start Date</label>
                <Input 
                  type="date"
                  value={ins.validityStart} 
                  onChange={(e) => handleInsuranceChange(index, 'validityStart', e.target.value)} 
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Validity End Date</label>
                <Input 
                  type="date"
                  value={ins.validityEnd} 
                  onChange={(e) => handleInsuranceChange(index, 'validityEnd', e.target.value)} 
                />
              </div>
            </div>
          </div>
        ))}

        {insurances.length === 0 && (
          <p className="text-sm text-slate-500 italic">No insurance policies added.</p>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button type="submit" disabled={loading} className="bg-indigo-600 hover:bg-indigo-700 text-white">
          {loading ? 'Saving...' : warehouse ? 'Update Warehouse' : 'Create Warehouse'}
        </Button>
      </div>
    </form>
  );
}
