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
  onSuccess: () => void;
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

    // Email required for new clients
    const emailVal = (formData as any).email?.trim() || '';
    if (!client) {
      if (!emailVal) {
        validationErrors.email = 'Email is required for new clients';
      } else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailVal)) {
        validationErrors.email = 'Enter a valid email address';
      }
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
        if (!client && 'credentials' in res && res.credentials) {
          const credentials = res.credentials as { email: string; password: string };
          toast.success('Client registered');
          window.alert(
            `Client account created successfully.\n\nLogin Email: ${credentials.email}\nPassword: ${credentials.password}`
          );
        } else {
          toast.success(client ? t('clients.clientUpdated') : t('clients.clientRegistered'));
        }
        onSuccess();
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
    <form onSubmit={handleSubmit} className="space-y-4 p-4 border rounded-lg bg-slate-50">
      <h3 className="font-semibold text-lg">{client ? t('clients.editClient') : t('clients.registerNewClient')}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('clients.businessOwnerName')}</label>
          <Input required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Akshay Vadher" />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Email {client ? '' : '*'}</label>
          <Input
            required={!client}
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            placeholder="user@example.com"
          />
          {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email}</p>}
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('clients.clientType')}</label>
          <Select value={formData.clientType} onValueChange={(val) => setFormData({ ...formData, clientType: val })}>
            <SelectTrigger><SelectValue placeholder={t('clients.selectType')} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="FARMER">{t('clients.farmer')}</SelectItem>
              <SelectItem value="FPO">{t('clients.fpo')}</SelectItem>
              <SelectItem value="COMPANY">{t('clients.company')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('clients.addressReq')}</label>
          <Input required value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder={t('clients.placeholderLocation')} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('clients.state')}{!client ? ' *' : ''}</label>
          <Select value={formData.state} onValueChange={(val) => handleFieldChange('state', val)}>
            <SelectTrigger><SelectValue placeholder={t('clients.selectState')} /></SelectTrigger>
            <SelectContent>
              {INDIAN_STATES.map((state) => <SelectItem key={state} value={state}>{state}</SelectItem>)}
            </SelectContent>
          </Select>
          {errors.state && <p className="mt-1 text-sm text-red-600">{errors.state}</p>}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('clients.mobileReq')}</label>
          <Input required value={formData.mobile} onChange={(e) => handleFieldChange('mobile', e.target.value)} placeholder={t('clients.placeholderMobile')} />
          {errors.mobile && <p className="mt-1 text-sm text-red-600">{errors.mobile}</p>}
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('clients.panReq')}</label>
          <Input required value={formData.panNumber} onChange={(e) => handleFieldChange('panNumber', e.target.value)} placeholder={t('clients.placeholderPan')} />
          {errors.panNumber && <p className="mt-1 text-sm text-red-600">{errors.panNumber}</p>}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('clients.aadhaarReq')}</label>
          <Input required value={formData.aadharNumber} onChange={(e) => handleFieldChange('aadharNumber', e.target.value)} placeholder={t('clients.placeholderAadhaar')} />
          {errors.aadharNumber && <p className="mt-1 text-sm text-red-600">{errors.aadharNumber}</p>}
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('clients.gstinReq')}</label>
          <Input required value={formData.gstNumber} onChange={(e) => handleFieldChange('gstNumber', e.target.value)} placeholder={t('clients.placeholderGst')} />
          {errors.gstNumber && <p className="mt-1 text-sm text-red-600">{errors.gstNumber}</p>}
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">{t('clients.allowedCommodities')}</label>
        <div className="rounded-xl border border-slate-300 bg-white p-3 min-h-[120px]">
          {availableCommodities.length === 0 ? (
            <p className="text-sm text-slate-500">{t('clients.noCommodities')}</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {availableCommodities.map((commodity) => {
                const commodityId = commodity._id?.toString?.() || commodity.id;
                const selected = formData.commodityIds.includes(commodityId);
                return (
                  <button key={commodityId} type="button" onClick={() => toggleCommodity(commodityId)} className={`rounded-full border px-3 py-1 text-sm transition ${selected ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'}`}>
                    {commodity.type ? `${commodity.name} (${commodity.type})` : commodity.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <p className="text-xs text-slate-500 mt-1">{t('clients.commodityHint')}</p>
        {errors.commodityIds && <p className="mt-1 text-sm text-red-600">{errors.commodityIds}</p>}
      </div>
      <div className="flex justify-between items-center gap-2 pt-2">
        <p className="text-sm text-slate-500">{formData.commodityIds.length} {t('clients.commoditiesAssigned')}</p>
        <Button type="submit" disabled={loading}>
          {loading ? t('common.loading') : client ? t('clients.updateClient') : t('clients.registerClient')}
        </Button>
      </div>
    </form>
  );
}
