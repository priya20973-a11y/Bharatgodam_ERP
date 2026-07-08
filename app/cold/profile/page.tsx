'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useColdTranslation } from '@/components/providers/cold-language-provider';

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana",
  "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands",
  "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir", "Ladakh",
  "Lakshadweep", "Puducherry"
];

interface ProfileData {
  id: string;
  fullName: string;
  email: string;
  role: string;
  companyName?: string;
  phoneNumber?: string;
  address?: string | null;
  warehouseLocation?: string;
  state?: string;
  gstNumber?: string | null;
  bankName?: string | null;
  accountName?: string | null;
  bankAccountNumber?: string | null;
  ifscCode?: string | null;
  bankBranch?: string | null;
  companyLogo?: string | null;
  isNewRegistration?: boolean;
}

const initialProfileForm = {
  fullName: '', email: '', companyName: '', phoneNumber: '', address: '', warehouseLocation: '',
  state: '', gstNumber: '', bankName: '', accountName: '', bankAccountNumber: '', ifscCode: '',
  bankBranch: '', companyLogo: '',
};

const initialPasswordForm = {
  currentPassword: '', newPassword: '', confirmPassword: '',
};

export default function ProfilePage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { t } = useColdTranslation();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [profileForm, setProfileForm] = useState(initialProfileForm);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [gstNotApplicable, setGstNotApplicable] = useState(false);
  const [passwordForm, setPasswordForm] = useState(initialPasswordForm);
  const [loading, setLoading] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'authenticated' && session?.user?.role === 'ADMIN') {
      router.push('/dashboard');
      return;
    }
    if (status === 'authenticated') {
      fetchProfile();
    }
  }, [status, session?.user?.role, router]);

  async function fetchProfile() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/profile');
      if (!response.ok) {
        const data = await response.json();
        setError(data?.message || t('common.error'));
        return;
      }
      const data = await response.json();
      setProfile(data.user);
      setProfileForm({
        fullName: data.user.fullName || '',
        email: data.user.email || '',
        companyName: data.user.companyName || '',
        phoneNumber: data.user.phoneNumber || '',
        address: data.user.address || '',
        warehouseLocation: data.user.warehouseLocation || '',
        state: data.user.state || '',
        gstNumber: data.user.gstNumber || '',
        bankName: data.user.bankName || '',
        accountName: data.user.accountName || '',
        bankAccountNumber: data.user.bankAccountNumber || '',
        ifscCode: data.user.ifscCode || '',
        bankBranch: data.user.bankBranch || '',
        companyLogo: data.user.companyLogo || '',
      });
      setLogoPreview(data.user.companyLogo || null);
      setGstNotApplicable(data.user.gstNumber === 'NA');
    } catch (err) {
      setError(t('common.error'));
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleProfileSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const isNew = !!profile?.isNewRegistration;
    setSavingProfile(true);

    if (!profileForm.fullName.trim()) {
      setError(t('common.error'));
      setSavingProfile(false);
      return;
    }

    if (!profileForm.warehouseLocation.trim()) {
      setError(t('common.error'));
      setSavingProfile(false);
      return;
    }

    const phoneNumber = profileForm.phoneNumber?.trim() ?? '';
    const phoneRegex = /^[0-9]{10}$/;
    if (phoneNumber && !phoneRegex.test(phoneNumber)) {
      setError(t('common.error'));
      setSavingProfile(false);
      return;
    }

    const gstTrimmed = profileForm.gstNumber?.trim().toUpperCase() || '';
    const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

    if (isNew) {
      if (!profileForm.state || !profileForm.bankName.trim() || !profileForm.accountName.trim() || !profileForm.bankAccountNumber.trim() || !profileForm.ifscCode.trim() || !profileForm.bankBranch.trim() || !profileForm.companyLogo || !gstTrimmed) {
        setError(t('common.error'));
        setSavingProfile(false);
        return;
      }
      if (gstTrimmed !== 'NA' && !gstRegex.test(gstTrimmed)) {
        setError(t('common.error'));
        setSavingProfile(false);
        return;
      }
    } else {
      if (gstTrimmed && gstTrimmed !== 'NA' && !gstRegex.test(gstTrimmed)) {
        setError(t('common.error'));
        setSavingProfile(false);
        return;
      }
    }

    try {
      const response = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...profileForm,
          gstNumber: gstNotApplicable ? 'NA' : profileForm.gstNumber,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data?.message || t('common.error'));
        return;
      }

      setProfile(data.user);
      setGstNotApplicable(data.user.gstNumber === 'NA');
      setMessage(t('profile.profileUpdated'));
    } catch (err) {
      setError(t('common.error'));
      console.error(err);
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePasswordSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingPassword(true);
    setMessage(null);
    setError(null);

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError(t('common.error'));
      setSavingPassword(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(passwordForm),
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data?.message || t('common.error'));
        return;
      }

      setMessage(t('profile.passwordUpdated'));
      setPasswordForm(initialPasswordForm);
    } catch (err) {
      setError(t('common.error'));
      console.error(err);
    } finally {
      setSavingPassword(false);
    }
  }

  if (status === 'loading' || loading) {
    return <div className="rounded-xl bg-white p-8 shadow-sm">{t('common.loading')}</div>;
  }

  if (!session) {
    return (
      <div className="rounded-xl bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold mb-4">{t('profile.title')}</h1>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="rounded-xl bg-white p-8 shadow-sm">
        <div className="mb-6 flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">{t('profile.title')}</h1>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}
        {message && (
          <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            {message}
          </div>
        )}

        <form onSubmit={handleProfileSubmit} className="rounded-xl bg-white p-8 shadow-sm">
          <div className="grid gap-6 lg:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">{t('profile.fullName')}</span>
              <input type="text" value={profileForm.fullName} onChange={(e) => setProfileForm({ ...profileForm, fullName: e.target.value })} className="w-full rounded-md border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200" />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">{t('profile.email')}</span>
              <input type="email" value={profileForm.email} readOnly disabled className="w-full rounded-md border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-700 outline-none" />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">{t('dashboard.role')}</span>
              <input type="text" value={profile?.role || session.user.role || ''} readOnly disabled className="w-full rounded-md border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-700 outline-none" />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">{t('profile.companyName')}</span>
              <input type="text" value={profileForm.companyName} readOnly disabled className="w-full rounded-md border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-700 outline-none" />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">{t('profile.companyLogo')}{profile?.isNewRegistration ? ' *' : ''}</span>
              <input type="file" accept="image/*" onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                  const result = reader.result;
                  if (typeof result === 'string') {
                    setProfileForm({ ...profileForm, companyLogo: result });
                    setLogoPreview(result);
                    setError(null);
                  }
                };
                reader.readAsDataURL(file);
              }} className="w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200" />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">{t('profile.phone')}</span>
              <input type="text" inputMode="numeric" pattern="[0-9]{10}" maxLength={10} value={profileForm.phoneNumber} onChange={(e) => setProfileForm({ ...profileForm, phoneNumber: e.target.value })} className="w-full rounded-md border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200" />
            </label>

            <div className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Logo Preview</span>
              <div className="h-32 w-full overflow-hidden rounded-md border border-slate-200 bg-slate-50">
                {logoPreview && <img src={logoPreview} alt="Preview" className="h-full w-full object-contain" />}
              </div>
            </div>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">{t('profile.address')}</span>
              <textarea rows={3} value={profileForm.address} onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })} className="w-full min-h-[5rem] max-h-36 rounded-md border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200" />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">{t('profile.warehouseLocation')}</span>
              <input type="text" value={profileForm.warehouseLocation} onChange={(e) => setProfileForm({ ...profileForm, warehouseLocation: e.target.value })} className="w-full rounded-md border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200" />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">{t('profile.state')}{profile?.isNewRegistration ? ' *' : ''}</span>
              <select value={profileForm.state} onChange={(e) => setProfileForm({ ...profileForm, state: e.target.value })} className="w-full rounded-md border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200">
                <option value="" disabled>{t('profile.selectState')}</option>
                {INDIAN_STATES.map((state) => <option key={state} value={state}>{state}</option>)}
              </select>
            </label>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">{t('profile.gstNumber')}{profile?.isNewRegistration ? ' *' : ''}</span>
                <label className="flex items-center space-x-2 text-sm text-slate-600 select-none cursor-pointer">
                  <input type="checkbox" checked={gstNotApplicable} onChange={(e) => {
                    const checked = e.target.checked;
                    setGstNotApplicable(checked);
                    if (checked) setProfileForm(prev => ({ ...prev, gstNumber: 'NA' }));
                    else setProfileForm(prev => ({ ...prev, gstNumber: '' }));
                  }} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                  <span>{t('profile.notApplicable')}</span>
                </label>
              </div>
              <input type="text" disabled={gstNotApplicable} value={gstNotApplicable ? 'NA' : profileForm.gstNumber} onChange={(e) => setProfileForm({ ...profileForm, gstNumber: e.target.value })} className={`w-full rounded-md border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 ${gstNotApplicable ? 'bg-slate-100 text-slate-750' : 'bg-slate-50'}`} />
            </div>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">{t('profile.bankName')}{profile?.isNewRegistration ? ' *' : ''}</span>
              <input type="text" value={profileForm.bankName} onChange={(e) => setProfileForm({ ...profileForm, bankName: e.target.value })} className="w-full rounded-md border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200" />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">{t('profile.accountName')}{profile?.isNewRegistration ? ' *' : ''}</span>
              <input type="text" value={profileForm.accountName} onChange={(e) => setProfileForm({ ...profileForm, accountName: e.target.value })} className="w-full rounded-md border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200" />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">{t('profile.accountNumber')}{profile?.isNewRegistration ? ' *' : ''}</span>
              <input type="text" value={profileForm.bankAccountNumber} onChange={(e) => setProfileForm({ ...profileForm, bankAccountNumber: e.target.value })} className="w-full rounded-md border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200" />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">{t('profile.ifsc')}{profile?.isNewRegistration ? ' *' : ''}</span>
              <input type="text" value={profileForm.ifscCode} onChange={(e) => setProfileForm({ ...profileForm, ifscCode: e.target.value })} className="w-full rounded-md border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200" />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">{t('profile.branch')}{profile?.isNewRegistration ? ' *' : ''}</span>
              <input type="text" value={profileForm.bankBranch} onChange={(e) => setProfileForm({ ...profileForm, bankBranch: e.target.value })} className="w-full rounded-md border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200" />
            </label>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <button type="submit" disabled={savingProfile} className="inline-flex items-center justify-center rounded-md bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400">
              {savingProfile ? t('profile.savingProfile') : t('profile.saveProfile')}
            </button>
            <button type="button" onClick={() => {
              setProfileForm({
                fullName: profile?.fullName || '', email: profile?.email || '', companyName: profile?.companyName || '',
                phoneNumber: profile?.phoneNumber || '', address: profile?.address || '', warehouseLocation: profile?.warehouseLocation || '',
                state: profile?.state || '', gstNumber: profile?.gstNumber || '', bankName: profile?.bankName || '',
                accountName: profile?.accountName || '', bankAccountNumber: profile?.bankAccountNumber || '',
                ifscCode: profile?.ifscCode || '', bankBranch: profile?.bankBranch || '', companyLogo: profile?.companyLogo || '',
              });
              setMessage(null); setError(null); setGstNotApplicable(profile?.gstNumber === 'NA');
            }} className="rounded-md border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">
              {t('common.cancel')}
            </button>
          </div>
        </form>

        <form onSubmit={handlePasswordSubmit} className="rounded-xl bg-white p-8 shadow-sm">
          <div className="mb-6 flex flex-col gap-1">
            <h2 className="text-xl font-semibold">{t('profile.security')}</h2>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">{t('profile.currentPassword')}</span>
              <input type="password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} className="w-full rounded-md border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">{t('profile.newPassword')}</span>
              <input type="password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} className="w-full rounded-md border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">{t('profile.confirmPassword')}</span>
              <input type="password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} className="w-full rounded-md border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200" />
            </label>
          </div>
          <div className="mt-6">
            <button type="submit" disabled={savingPassword} className="inline-flex items-center justify-center rounded-md bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400">
              {savingPassword ? t('profile.updatingPassword') : t('profile.updatePassword')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
