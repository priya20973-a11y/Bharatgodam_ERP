'use client';

import { useEffect, useState } from 'react';
import { createClient, updateClient } from '@/app/actions/client-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'react-hot-toast';
import { useColdTranslation } from '@/components/providers/cold-language-provider';

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana",
  "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands",
  "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir", "Ladakh",
  "Lakshadweep", "Puducherry"
];

interface ClientFormProps {
  client?: any;
  availableCommodities: any[];
  onSuccess: (newClient?: any) => void;
  isColdStorage?: boolean;
}

interface ClientFormState {
  name: string;
  address: string;
  clientType: string;
  mobile: string;
  panNumber: string;
  aadharNumber: string;
  gstNumber: string;
  state: string;
  commodityIds: string[];
  email?: string;
}

export default function ClientForm({ client, availableCommodities, onSuccess, isColdStorage = false }: ClientFormProps) {
  const { t } = useColdTranslation();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState<ClientFormState>({
    name: client?.name || '',
    address: client?.address || '',
    clientType: client?.clientType || 'FARMER',
    mobile: client?.mobile || '',
    panNumber: client?.panNumber || '',
    aadharNumber: client?.aadharNumber || '',
    gstNumber: client?.gstNumber || '',
    state: client?.state || '',
    commodityIds: client?.commodityIds || [],
    email: client?.email || '',
  });

  const isNAValue = (value: string) => value.trim().toUpperCase() === 'NA';
  const normalizeAadhaar = (value: string) => value.replace(/\s+/g, '');

  const validateForm = () => {
    const validationErrors: Record<string, string> = {};
    const mobile = formData.mobile.trim();
    const pan = formData.panNumber.trim();
    const aadhar = formData.aadharNumber.trim();
    const gst = formData.gstNumber.trim();

    if (!mobile) {
      validationErrors.mobile = 'Mobile number is required';
    } else if (isColdStorage && isNAValue(mobile)) {
      validationErrors.mobile = 'Mobile number cannot be NA in Cold Storage';
    } else if (!isNAValue(mobile) && !/^[0-9]{10}$/.test(mobile)) {
      validationErrors.mobile = 'Mobile number must be exactly 10 digits';
    }

    if (!pan) {
      validationErrors.panNumber = 'PAN number is required';
    } else if (!isNAValue(pan) && !/^[A-Z]{5}[0-9]{4}[A-Z]$/i.test(pan)) {
      validationErrors.panNumber = 'Invalid PAN format';
    }

    if (!aadhar) {
      validationErrors.aadharNumber = 'Aadhaar number is required';
    } else if (!isNAValue(aadhar) && !/^[0-9]{12}$/.test(normalizeAadhaar(aadhar))) {
      validationErrors.aadharNumber = 'Aadhaar must be exactly 12 digits';
    }

    if (!gst) {
      validationErrors.gstNumber = 'GSTIN is required';
    } else if (!isNAValue(gst) && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/i.test(gst)) {
      validationErrors.gstNumber = 'Enter valid GSTIN or NA if not available';
    }

    // Email optional for clients
    const emailVal = (formData as any).email?.trim() || '';
    if (emailVal && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailVal)) {
      validationErrors.email = 'Enter a valid email address';
    }

    if (!client && !formData.state) {
      validationErrors.state = 'State is required';
    }

    if (isColdStorage && formData.commodityIds.length === 0) {
      validationErrors.commodityIds = 'Please assign at least one commodity to the client.';
    }

    setErrors(validationErrors);
    return validationErrors;
  };

  const handleFieldChange = (field: keyof ClientFormState, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  useEffect(() => {
    setFormData({
      name: client?.name || '',
      address: client?.address || '',
      clientType: client?.clientType || 'FARMER',
      mobile: client?.mobile || '',
      panNumber: client?.panNumber || '',
      aadharNumber: client?.aadharNumber || '',
      gstNumber: client?.gstNumber || '',
      state: client?.state || '',
      commodityIds: client?.commodityIds || [],
      email: client?.email || '',
    });
  }, [client]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      setLoading(false);
      return;
    }

    try {
      const payload = {
        name: formData.name,
        address: formData.address,
        clientType: formData.clientType,
        mobile: formData.mobile,
        panNumber: formData.panNumber,
        aadharNumber: formData.aadharNumber,
        gstNumber: formData.gstNumber,
        state: formData.state,
        commodityIds: formData.commodityIds,
        email: formData.email,
      };

      const res = client
        ? await updateClient(client.id, payload, isColdStorage)
        : await createClient(payload as any, isColdStorage);

      if (res.success) {
        toast.success(client ? t('clients.clientUpdated') : t('clients.clientRegistered'));
        onSuccess(res.data);
      } else {
        toast.error(res.error || t('common.error'));
      }
    } catch (err) {
      toast.error(t('common.error'));
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
    <form onSubmit={handleSubmit} className="space-y-4 p-4 border border-slate-200 rounded-lg bg-white text-slate-900 shadow-xs">
      <h3 className="font-bold text-lg text-slate-900 border-b pb-2">{client ? t('clients.editClient') : t('clients.registerNewClient')}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-slate-800 block">{t('clients.businessOwnerName')}</label>
          <Input 
            required 
            value={formData.name} 
            onChange={(e) => setFormData({ ...formData, name: e.target.value })} 
            placeholder="e.g. Akshay Vadher" 
            className="bg-white text-slate-900 font-medium placeholder:text-slate-400 border-slate-300 focus:border-indigo-600 focus:ring-indigo-600"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-slate-800 block">Email</label>
          <Input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            placeholder="user@example.com"
            className="bg-white text-slate-900 font-medium placeholder:text-slate-400 border-slate-300 focus:border-indigo-600 focus:ring-indigo-600"
          />
          {errors.email && <p className="mt-1 text-xs font-semibold text-red-600">{errors.email}</p>}
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-slate-800 block">{t('clients.clientType')}</label>
          <Select value={formData.clientType} onValueChange={(val) => setFormData({ ...formData, clientType: val })}>
            <SelectTrigger className="bg-white text-slate-900 font-medium border-slate-300 focus:ring-indigo-600">
              <SelectValue placeholder={t('clients.selectType')} className="text-slate-900 font-medium" />
            </SelectTrigger>
            <SelectContent className="bg-white text-slate-900 border-slate-200">
              <SelectItem value="FARMER" className="text-slate-900 font-medium focus:bg-indigo-50 focus:text-indigo-900">{t('clients.farmer')}</SelectItem>
              <SelectItem value="FPO" className="text-slate-900 font-medium focus:bg-indigo-50 focus:text-indigo-900">{t('clients.fpo')}</SelectItem>
              <SelectItem value="COMPANY" className="text-slate-900 font-medium focus:bg-indigo-50 focus:text-indigo-900">{t('clients.company')}</SelectItem>
              <SelectItem value="PURCHASE" className="text-slate-900 font-medium focus:bg-indigo-50 focus:text-indigo-900">Purchase</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-slate-800 block">{t('clients.addressReq')}</label>
          <Input 
            required 
            value={formData.address} 
            onChange={(e) => setFormData({ ...formData, address: e.target.value })} 
            placeholder={t('clients.placeholderLocation')} 
            className="bg-white text-slate-900 font-medium placeholder:text-slate-400 border-slate-300 focus:border-indigo-600 focus:ring-indigo-600"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-slate-800 block">{t('clients.state')}{!client ? ' *' : ''}</label>
          <Select value={formData.state} onValueChange={(val) => handleFieldChange('state', val)}>
            <SelectTrigger className="bg-white text-slate-900 font-medium border-slate-300 focus:ring-indigo-600">
              <SelectValue placeholder={t('clients.selectState')} className="text-slate-900 font-medium" />
            </SelectTrigger>
            <SelectContent className="bg-white text-slate-900 border-slate-200 max-h-60 overflow-y-auto">
              {INDIAN_STATES.map((state) => (
                <SelectItem key={state} value={state} className="text-slate-900 font-medium focus:bg-indigo-50 focus:text-indigo-900">
                  {state}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.state && <p className="mt-1 text-xs font-semibold text-red-600">{errors.state}</p>}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-slate-800 block">{t('clients.mobileReq')}</label>
          <Input 
            required 
            value={formData.mobile} 
            onChange={(e) => handleFieldChange('mobile', e.target.value)} 
            placeholder={t('clients.placeholderMobile')} 
            className="bg-white text-slate-900 font-medium placeholder:text-slate-400 border-slate-300 focus:border-indigo-600 focus:ring-indigo-600"
          />
          {errors.mobile && <p className="mt-1 text-xs font-semibold text-red-600">{errors.mobile}</p>}
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-slate-800 block">{t('clients.panReq')}</label>
          <Input 
            required 
            value={formData.panNumber} 
            onChange={(e) => handleFieldChange('panNumber', e.target.value)} 
            placeholder={t('clients.placeholderPan')} 
            className="bg-white text-slate-900 font-medium placeholder:text-slate-400 border-slate-300 focus:border-indigo-600 focus:ring-indigo-600"
          />
          {errors.panNumber && <p className="mt-1 text-xs font-semibold text-red-600">{errors.panNumber}</p>}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-slate-800 block">{t('clients.aadhaarReq')}</label>
          <Input 
            required 
            value={formData.aadharNumber} 
            onChange={(e) => handleFieldChange('aadharNumber', e.target.value)} 
            placeholder={t('clients.placeholderAadhaar')} 
            className="bg-white text-slate-900 font-medium placeholder:text-slate-400 border-slate-300 focus:border-indigo-600 focus:ring-indigo-600"
          />
          {errors.aadharNumber && <p className="mt-1 text-xs font-semibold text-red-600">{errors.aadharNumber}</p>}
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-slate-800 block">{t('clients.gstinReq')}</label>
          <Input 
            required 
            value={formData.gstNumber} 
            onChange={(e) => handleFieldChange('gstNumber', e.target.value)} 
            placeholder={t('clients.placeholderGst')} 
            className="bg-white text-slate-900 font-medium placeholder:text-slate-400 border-slate-300 focus:border-indigo-600 focus:ring-indigo-600"
          />
          {errors.gstNumber && <p className="mt-1 text-xs font-semibold text-red-600">{errors.gstNumber}</p>}
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-semibold text-slate-800 block">{t('clients.allowedCommodities')}</label>
        <div className="rounded-xl border border-slate-300 bg-white p-3 min-h-[120px]">
          {availableCommodities.length === 0 ? (
            <p className="text-sm text-slate-500 font-medium">{t('clients.noCommodities')}</p>
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
                    className={`rounded-full border px-3 py-1 text-sm font-medium transition ${
                      selected 
                        ? 'bg-indigo-600 text-white border-indigo-600 font-semibold shadow-2xs' 
                        : 'bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200'
                    }`}
                  >
                    {commodity.type ? `${commodity.name} (${commodity.type})` : commodity.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <p className="text-xs text-slate-500 font-medium mt-1">{t('clients.commodityHint')}</p>
        {errors.commodityIds && <p className="mt-1 text-xs font-semibold text-red-600">{errors.commodityIds}</p>}
      </div>
      <div className="flex justify-between items-center gap-2 pt-2">
        <p className="text-sm font-medium text-slate-600">{formData.commodityIds.length} {t('clients.commoditiesAssigned')}</p>
        <Button type="submit" disabled={loading} className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold">
          {loading ? t('common.loading') : client ? t('clients.updateClient') : t('clients.registerClient')}
        </Button>
      </div>
    </form>
  );
}
