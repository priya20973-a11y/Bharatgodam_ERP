'use client';

'use client';

import { useEffect, useState } from 'react';
import { createClient, updateClient } from '@/app/actions/client-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'react-hot-toast';

interface ClientFormProps {
  client?: any;
  availableCommodities: any[];
  onSuccess: () => void;
}

interface ClientFormState {
  name: string;
  address: string;
  clientType: string;
  mobile: string;
  panNumber: string;
  aadharNumber: string;
  gstNumber: string;
  commodityIds: string[];
}

export default function ClientForm({ client, availableCommodities, onSuccess }: ClientFormProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<ClientFormState>({
    name: client?.name || '',
    address: client?.address || '',
    clientType: client?.clientType || 'FARMER',
    mobile: client?.mobile || '',
    panNumber: client?.panNumber || '',
    aadharNumber: client?.aadharNumber || '',
    gstNumber: client?.gstNumber || '',
    commodityIds: client?.commodityIds || [],
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
      commodityIds: client?.commodityIds || [],
    });
  }, [client]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const payload = {
        name: formData.name,
        address: formData.address,
        clientType: formData.clientType,
        mobile: formData.mobile,
        panNumber: formData.panNumber,
        aadharNumber: formData.aadharNumber,
        gstNumber: formData.gstNumber,
        commodityIds: formData.commodityIds,
      };

      const res = client 
        ? await updateClient(client.id, payload)
        : await createClient(payload as any);

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

  const toggleCommodity = (commodityId: string) => {
    setFormData((prev) => {
      const isSelected = prev.commodityIds.includes(commodityId);
      return {
        ...prev,
        commodityIds: isSelected
          ? prev.commodityIds.filter((selectedId) => selectedId !== commodityId)
          : [...prev.commodityIds, commodityId],
      };
    });
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          <label className="text-sm font-medium">Allowed Commodities</label>
          <div className="rounded-xl border border-slate-300 bg-white p-3 min-h-[120px]">
            {availableCommodities.length === 0 ? (
              <p className="text-sm text-slate-500">No commodities configured yet.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {availableCommodities.map((commodity) => {
                  const commodityId = commodity._id?.toString?.() || commodity.id;
                  const selected = formData.commodityIds.includes(commodityId);
                  return (
                    <button
                      key={commodityId}
                      type="button"
                      onClick={() => toggleCommodity(commodityId)}
                      className={`rounded-full border px-3 py-1 text-sm transition ${selected ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'}`}
                    >
                      {commodity.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">Click to assign or remove commodities for this client.</p>
        </div>
      </div>
      <div className="flex justify-between items-center gap-2 pt-2">
        <p className="text-sm text-slate-500">{formData.commodityIds.length} commodity{formData.commodityIds.length === 1 ? '' : 'ies'} assigned.</p>
        <Button type="submit" disabled={loading}>
          {loading ? 'Saving...' : client ? 'Update Client' : 'Register Client'}
        </Button>
      </div>
    </form>
  );
}
