'use client';

import { useState, useEffect } from 'react';
import { createWarehouse, updateWarehouse } from '@/app/actions/warehouse-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'react-hot-toast';
import { Plus, Trash2 } from 'lucide-react';

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
  });

  const formatDateForInput = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
  };

  const [insurances, setInsurances] = useState<Insurance[]>([]);

  useEffect(() => {
    setFormData({
      warehouseId: warehouse?.warehouseId || '',
      name: warehouse?.name || '',
      address: warehouse?.address || '',
      totalCapacity: warehouse?.totalCapacity || 0,
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
