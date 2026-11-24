'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { createColdPledgee, updateColdPledgee } from '@/app/actions/cold-pledgee-actions';
import { Loader2 } from 'lucide-react';

interface PledgeeFormProps {
  pledgee?: any;
  onSuccess: (data?: any) => void;
  onCancel?: () => void;
}

export default function ColdPledgeeForm({ pledgee, onSuccess, onCancel }: PledgeeFormProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: pledgee?.name || '',
    type: pledgee?.type || 'NBFC',
    iifcCode: pledgee?.iifcCode || '',
    address: pledgee?.address || '',
    personName: pledgee?.personName || '',
    mobile: pledgee?.mobile || '',
  });

  useEffect(() => {
    if (pledgee) {
      setFormData({
        name: pledgee.name || '',
        type: pledgee.type || 'NBFC',
        iifcCode: pledgee.iifcCode || '',
        address: pledgee.address || '',
        personName: pledgee.personName || '',
        mobile: pledgee.mobile || '',
      });
    }
  }, [pledgee]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      return toast.error('Pledgee Name is required');
    }
    if (formData.type === 'Bank' && (!formData.iifcCode || !formData.iifcCode.trim())) {
      return toast.error('IIFC Code is required when Type is Bank');
    }

    setLoading(true);
    try {
      const res = pledgee 
        ? await updateColdPledgee(pledgee._id || pledgee.id, formData as any)
        : await createColdPledgee(formData as any);
        
      if (res.success) {
        toast.success(pledgee ? 'Pledgee updated successfully' : 'Pledgee created successfully');
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
        {pledgee ? 'Edit Pledgee' : 'Add New Pledgee'}
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-slate-700">Pledgee Name *</Label>
          <Input 
            required 
            value={formData.name} 
            onChange={(e) => setFormData({ ...formData, name: e.target.value })} 
            placeholder="e.g. HDFC Bank" 
            className="bg-white"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-semibold text-slate-700">Type *</Label>
          <Select 
            value={formData.type} 
            onValueChange={(val: any) => setFormData({ ...formData, type: val })}
          >
            <SelectTrigger className="bg-white">
              <SelectValue placeholder="Select Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NBFC">NBFC</SelectItem>
              <SelectItem value="Bank">Bank</SelectItem>
              <SelectItem value="Other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {formData.type === 'Bank' && (
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-slate-700">IIFC Code *</Label>
            <Input 
              required 
              value={formData.iifcCode} 
              onChange={(e) => setFormData({ ...formData, iifcCode: e.target.value })} 
              placeholder="e.g. HDFC0001234" 
              className="bg-white"
            />
          </div>
        )}

        <div className="space-y-2">
          <Label className="text-sm font-semibold text-slate-700">Contact Person Name</Label>
          <Input 
            value={formData.personName} 
            onChange={(e) => setFormData({ ...formData, personName: e.target.value })} 
            placeholder="e.g. John Doe" 
            className="bg-white"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-semibold text-slate-700">Mobile Number</Label>
          <Input 
            value={formData.mobile} 
            onChange={(e) => setFormData({ ...formData, mobile: e.target.value })} 
            placeholder="e.g. 9876543210" 
            className="bg-white"
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label className="text-sm font-semibold text-slate-700">Address</Label>
          <Textarea 
            value={formData.address} 
            onChange={(e) => setFormData({ ...formData, address: e.target.value })} 
            placeholder="Branch address / remarks" 
            rows={2} 
            className="bg-white"
          />
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
          {pledgee ? 'Update Pledgee' : 'Create Pledgee'}
        </Button>
      </div>
    </form>
  );
}
