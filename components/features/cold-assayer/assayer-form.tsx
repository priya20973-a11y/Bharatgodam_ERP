'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { createColdAssayer, updateColdAssayer } from '@/app/actions/cold-assayer-actions';
import { Loader2 } from 'lucide-react';

interface AssayerFormProps {
  assayer?: any;
  onSuccess: (data?: any) => void;
  onCancel?: () => void;
}

export default function ColdAssayerForm({ assayer, onSuccess, onCancel }: AssayerFormProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: assayer?.name || '',
    licenceNumber: assayer?.licenceNumber || '',
    status: assayer?.status || 'Active',
  });

  useEffect(() => {
    if (assayer) {
      setFormData({
        name: assayer.name || '',
        licenceNumber: assayer.licenceNumber || '',
        status: assayer.status || 'Active',
      });
    }
  }, [assayer]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      return toast.error('Assayer Name is required');
    }
    if (!formData.licenceNumber.trim()) {
      return toast.error('Licence Number is required');
    }

    setLoading(true);
    try {
      const res = assayer 
        ? await updateColdAssayer(assayer._id || assayer.id, formData as any)
        : await createColdAssayer(formData as any);
        
      if (res.success) {
        toast.success(assayer ? 'Assayer updated successfully' : 'Assayer created successfully');
        onSuccess(res.data);
      } else {
        toast.error(res.error || 'Operation failed');
      }
    } catch (error: any) {
      toast.error(error.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4 border border-slate-200 rounded-lg bg-white shadow-sm">
      <h3 className="font-bold text-lg border-b pb-2 text-slate-800">
        {assayer ? 'Edit Assayer' : 'Add New Assayer'}
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-slate-700">Assayer Name <span className="text-red-500">*</span></Label>
          <Input 
            required 
            value={formData.name} 
            onChange={(e) => setFormData({ ...formData, name: e.target.value })} 
            placeholder="e.g. Quality Testing Labs" 
            className="bg-white"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-semibold text-slate-700">Licence Number <span className="text-red-500">*</span></Label>
          <Input 
            required 
            value={formData.licenceNumber} 
            onChange={(e) => setFormData({ ...formData, licenceNumber: e.target.value })} 
            placeholder="e.g. LIC-COLD-12345" 
            className="bg-white"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-semibold text-slate-700">Licence Status <span className="text-red-500">*</span></Label>
          <Select 
            value={formData.status} 
            onValueChange={(val: any) => setFormData({ ...formData, status: val })}
          >
            <SelectTrigger className="bg-white">
              <SelectValue placeholder="Select Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Expired">Expired</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={loading} className="bg-cyan-700 hover:bg-cyan-800 text-white">
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {assayer ? 'Update Assayer' : 'Create Assayer'}
        </Button>
      </div>
    </form>
  );
}
