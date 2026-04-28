'use client';

import { useEffect, useState } from 'react';
import { createClient, updateClient } from '@/app/actions/client-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'react-hot-toast';

interface ClientFormProps {
  client?: any;
  onSuccess: () => void;
}

export default function ClientForm({ client, onSuccess }: ClientFormProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: client?.name || '',
    address: client?.address || '',
    clientType: client?.clientType || 'FARMER',
    mobile: client?.mobile || '',
    panNumber: client?.panNumber || '',
    aadharNumber: client?.aadharNumber || '',
    gstNumber: client?.gstNumber || '',
  });

  useEffect(() => {
    setFormData({
      name: client?.name || '',
      address: client?.address || '',
      clientType: client?.clientType || 'FARMER',
      mobile: client?.mobile || '',
      panNumber: client?.panNumber || '',
      aadharNumber: client?.aadharNumber || '',
      gstNumber: client?.gstNumber || '',
    });
  }, [client]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = client 
        ? await updateClient(client.id, formData)
        : await createClient(formData as any);

      if (res.success) {
        toast.success(client ? 'Client updated' : 'Client registered');
        onSuccess();
      } else {
        toast.error(res.error || 'Failed to save client');
      }
    } catch (err) {
      toast.error('Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4 border rounded-lg bg-slate-50">
      <h3 className="font-semibold text-lg">{client ? 'Edit Client' : 'Register New Client'}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Business/Owner Name</label>
          <Input 
            required 
            value={formData.name} 
            onChange={(e) => setFormData({ ...formData, name: e.target.value })} 
            placeholder="e.g. Akshay Vadher"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Client Type</label>
          <Select 
            value={formData.clientType} 
            onValueChange={(val) => setFormData({ ...formData, clientType: val })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="FARMER">Farmer</SelectItem>
              <SelectItem value="FPO">FPO</SelectItem>
              <SelectItem value="COMPANY">Company</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Address</label>
        <Input 
          required 
          value={formData.address} 
          onChange={(e) => setFormData({ ...formData, address: e.target.value })} 
          placeholder="Location/Village/City"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">PAN Card Number</label>
        <Input 
          required 
          value={formData.panNumber} 
          onChange={(e) => setFormData({ ...formData, panNumber: e.target.value })} 
          placeholder="ABCDE1234F"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Aadhaar Number</label>
        <Input 
          required 
          value={formData.aadharNumber} 
          onChange={(e) => setFormData({ ...formData, aadharNumber: e.target.value })} 
          placeholder="1234 5678 9012"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">GSTIN</label>
        <Input 
          required 
          value={formData.gstNumber} 
          onChange={(e) => setFormData({ ...formData, gstNumber: e.target.value })} 
          placeholder="22AAAAA0000A1Z5"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Mobile Number</label>
        <Input 
          required 
          value={formData.mobile} 
          onChange={(e) => setFormData({ ...formData, mobile: e.target.value })} 
          placeholder="+91 XXXXX XXXXX"
        />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={loading}>
          {loading ? 'Saving...' : client ? 'Update Client' : 'Register Client'}
        </Button>
      </div>
    </form>
  );
}
