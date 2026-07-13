'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

const INDIAN_STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Andaman and Nicobar Islands",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Lakshadweep",
  "Puducherry"
];

interface ProfileData {
  id: string;
  fullName: string;
  email: string;
  invoiceEmail?: string | null;
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
  panNumber?: string | null;
  iecCode?: string | null;
  termsAndConditions?: string | null;
  isNewRegistration?: boolean;
}

const initialProfileForm = {
  fullName: '',
  email: '',
  invoiceEmail: '',
  companyName: '',
  phoneNumber: '',
  address: '',
  warehouseLocation: '',
  state: '',
  gstNumber: '',
  bankName: '',
  accountName: '',
  bankAccountNumber: '',
  ifscCode: '',
  bankBranch: '',
  companyLogo: '',
  panNumber: '',
  iecCode: '',
  termsAndConditions: '',
};

const initialPasswordForm = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
};

export default function ProfilePage() {
  const router = useRouter();
  const { data: session, status } = useSession();
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
        setError(data?.message || 'Unable to load profile data.');
        return;
      }
      const data = await response.json();
      setProfile(data.user);
      setProfileForm({
        fullName: data.user.fullName || '',
        email: data.user.email || '',
        invoiceEmail: data.user.invoiceEmail || '',
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
        panNumber: data.user.panNumber || '',
        iecCode: data.user.iecCode || '',
        termsAndConditions: data.user.termsAndConditions || '',
      });
      setLogoPreview(data.user.companyLogo || null);
      setGstNotApplicable(data.user.gstNumber === 'NA');
    } catch (err) {
      setError('Unable to load profile data.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleProfileSubmit(event: React.FormEvent<HTMLFormElement>) {
    const isNew = !!profile?.isNewRegistration;

    if (!profileForm.fullName.trim()) {
      setError('Full name is required.');
      setSavingProfile(false);
      return;
    }

    if (!profileForm.warehouseLocation.trim()) {
      setError('Location is required.');
      setSavingProfile(false);
      return;
    }

    const phoneNumber = profileForm.phoneNumber?.trim() ?? '';
    const phoneRegex = /^[0-9]{10}$/;
    if (phoneNumber && !phoneRegex.test(phoneNumber)) {
      setError('Phone number must be exactly 10 digits.');
      setSavingProfile(false);
      return;
    }

    const gstTrimmed = profileForm.gstNumber?.trim().toUpperCase() || '';
    const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

    const panTrimmed = profileForm.panNumber?.trim().toUpperCase() || '';
    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

    const iecTrimmed = profileForm.iecCode?.trim().toUpperCase() || '';
    const iecRegex = /^[A-Z0-9]{10}$/;

    if (isNew) {
      if (!profileForm.state) {
        setError('State is required.');
        setSavingProfile(false);
        return;
      }
      if (!profileForm.bankName.trim()) {
        setError('Bank name is required.');
        setSavingProfile(false);
        return;
      }
      if (!profileForm.accountName.trim()) {
        setError('Account Name is required.');
        setSavingProfile(false);
        return;
      }
      if (!profileForm.bankAccountNumber.trim()) {
        setError('Bank account number is required.');
        setSavingProfile(false);
        return;
      }
      if (!profileForm.ifscCode.trim()) {
        setError('IFSC code is required.');
        setSavingProfile(false);
        return;
      }
      if (!profileForm.bankBranch.trim()) {
        setError('Bank branch is required.');
        setSavingProfile(false);
        return;
      }
      if (!profileForm.companyLogo) {
        setError('Company logo is required.');
        setSavingProfile(false);
        return;
      }
      if (!gstTrimmed) {
        setError('GST Number is required (use NA if not applicable).');
        setSavingProfile(false);
        return;
      }
      if (gstTrimmed !== 'NA' && !gstRegex.test(gstTrimmed)) {
        setError('Invalid GSTIN format (must be 15 characters, or NA).');
        setSavingProfile(false);
        return;
      }
      if (!panTrimmed) {
        setError('PAN Number is required.');
        setSavingProfile(false);
        return;
      }
      if (!panRegex.test(panTrimmed)) {
        setError('Invalid PAN format (must be AAAAA9999A).');
        setSavingProfile(false);
        return;
      }
      if (iecTrimmed && !iecRegex.test(iecTrimmed)) {
        setError('Invalid IEC Code format (must be exactly 10 alphanumeric characters).');
        setSavingProfile(false);
        return;
      }
    } else {
      if (gstTrimmed && gstTrimmed !== 'NA' && !gstRegex.test(gstTrimmed)) {
        setError('Invalid GSTIN format (must be 15 characters, or NA).');
        setSavingProfile(false);
        return;
      }
      if (panTrimmed && !panRegex.test(panTrimmed)) {
        setError('Invalid PAN format (must be AAAAA9999A).');
        setSavingProfile(false);
        return;
      }
      if (iecTrimmed && !iecRegex.test(iecTrimmed)) {
        setError('Invalid IEC Code format (must be exactly 10 alphanumeric characters).');
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
        setError(data?.message || 'Unable to update profile.');
        return;
      }

      setProfile(data.user);
      setGstNotApplicable(data.user.gstNumber === 'NA');
      setMessage('Profile updated successfully.');
    } catch (err) {
      setError('Unable to update profile.');
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
      setError('New passwords do not match.');
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
        setError(data?.message || 'Unable to change password.');
        return;
      }

      setMessage('Password changed successfully.');
      setPasswordForm(initialPasswordForm);
    } catch (err) {
      setError('Unable to change password.');
      console.error(err);
    } finally {
      setSavingPassword(false);
    }
  }

  if (status === 'loading' || loading) {
    return <div className="rounded-xl bg-white p-8 shadow-sm">Loading profile...</div>;
  }

  if (!session) {
    return (
      <div className="rounded-xl bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold mb-4">Profile</h1>
        <p>You need to be signed in to access your profile.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="rounded-xl bg-white p-8 shadow-sm">
        <div className="mb-6 flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">My Profile</h1>
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
              <span className="text-sm font-medium text-slate-700">Full Name</span>
              <input
                type="text"
                value={profileForm.fullName}
                onChange={(event) => setProfileForm({ ...profileForm, fullName: event.target.value })}
                className="w-full rounded-md border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Login Email Address</span>
              <input
                type="email"
                value={profileForm.email}
                readOnly
                disabled
                className="w-full rounded-md border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-700 outline-none"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Invoice Email (Optional)</span>
              <input
                type="email"
                value={profileForm.invoiceEmail}
                onChange={(event) => setProfileForm({ ...profileForm, invoiceEmail: event.target.value })}
                className="w-full rounded-md border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                placeholder="Alternative email for invoices"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Role</span>
              <input
                type="text"
                value={profile?.role || session.user.role || ''}
                readOnly
                disabled
                className="w-full rounded-md border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-700 outline-none"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Company Name</span>
              <input
                type="text"
                value={profileForm.companyName}
                onChange={(event) => setProfileForm({ ...profileForm, companyName: event.target.value })}
                className="w-full rounded-md border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                placeholder="Company name"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">
                Company Logo{profile?.isNewRegistration ? ' *' : ''}
              </span>
              <input
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  if (!file.type.startsWith('image/')) {
                    setError('Please upload a valid image file.');
                    return;
                  }
                  if (file.size > 500 * 1024) {
                    setError('Logo file size must be 500KB or smaller.');
                    return;
                  }

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
                }}
                className="w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
              <p className="text-xs text-slate-500">
                {profile?.isNewRegistration ? 'Company logo is required. Max 500KB.' : 'Optional company logo for your account. Max 500KB.'}
              </p>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Phone Number</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{10}"
                maxLength={10}
                value={profileForm.phoneNumber}
                onChange={(event) => setProfileForm({ ...profileForm, phoneNumber: event.target.value })}
                className="w-full rounded-md border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                placeholder="10 digit phone number"
              />
            </label>

            <div className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Logo Preview</span>
              <div className="h-32 w-full overflow-hidden rounded-md border border-slate-200 bg-slate-50">
                {logoPreview ? (
                  <img
                    src={logoPreview}
                    alt="Company logo preview"
                    className="h-full w-full object-contain"
                  />
                ) : null}
              </div>
            </div>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Address</span>
              <textarea
                rows={3}
                value={profileForm.address}
                onChange={(event) => setProfileForm({ ...profileForm, address: event.target.value })}
                className="w-full min-h-[5rem] max-h-36 rounded-md border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Location</span>
              <input
                type="text"
                value={profileForm.warehouseLocation}
                onChange={(event) => setProfileForm({ ...profileForm, warehouseLocation: event.target.value })}
                className="w-full rounded-md border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">
                State{profile?.isNewRegistration ? ' *' : ''}
              </span>
              <select
                value={profileForm.state}
                onChange={(event) => setProfileForm({ ...profileForm, state: event.target.value })}
                className="w-full rounded-md border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              >
                <option value="" disabled>Select State/UT</option>
                {INDIAN_STATES.map((state) => (
                  <option key={state} value={state}>{state}</option>
                ))}
              </select>
            </label>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">
                  GST Number{profile?.isNewRegistration ? ' *' : ''}
                </span>
                <label className="flex items-center space-x-2 text-sm text-slate-600 select-none cursor-pointer">
                  <input
                    type="checkbox"
                    checked={gstNotApplicable}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setGstNotApplicable(checked);
                      if (checked) {
                        setProfileForm(prev => ({ ...prev, gstNumber: 'NA' }));
                      } else {
                        setProfileForm(prev => ({ ...prev, gstNumber: '' }));
                      }
                    }}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Not Applicable (NA)</span>
                </label>
              </div>
              <input
                type="text"
                disabled={gstNotApplicable}
                value={gstNotApplicable ? 'NA' : profileForm.gstNumber}
                onChange={(event) => setProfileForm({ ...profileForm, gstNumber: event.target.value })}
                className={`w-full rounded-md border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 ${
                  gstNotApplicable ? 'bg-slate-100 text-slate-750' : 'bg-slate-50'
                }`}
              />
            </div>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">
                PAN Number{profile?.isNewRegistration ? ' *' : ''}
              </span>
              <input
                type="text"
                value={profileForm.panNumber}
                onChange={(event) => setProfileForm({ ...profileForm, panNumber: event.target.value })}
                className="w-full rounded-md border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 uppercase"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">IEC Code (Optional)</span>
              <input
                type="text"
                value={profileForm.iecCode}
                onChange={(event) => setProfileForm({ ...profileForm, iecCode: event.target.value.toUpperCase() })}
                className="w-full rounded-md border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 uppercase"
                placeholder="0123456789 or ABCDE12345"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">
                Bank Name{profile?.isNewRegistration ? ' *' : ''}
              </span>
              <input
                type="text"
                value={profileForm.bankName}
                onChange={(event) => setProfileForm({ ...profileForm, bankName: event.target.value })}
                className="w-full rounded-md border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">
                Account Name{profile?.isNewRegistration ? ' *' : ''}
              </span>
              <input
                type="text"
                value={profileForm.accountName}
                onChange={(event) => setProfileForm({ ...profileForm, accountName: event.target.value })}
                className="w-full rounded-md border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">
                Account Number{profile?.isNewRegistration ? ' *' : ''}
              </span>
              <input
                type="text"
                value={profileForm.bankAccountNumber}
                onChange={(event) => setProfileForm({ ...profileForm, bankAccountNumber: event.target.value })}
                className="w-full rounded-md border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">
                IFSC Code{profile?.isNewRegistration ? ' *' : ''}
              </span>
              <input
                type="text"
                value={profileForm.ifscCode}
                onChange={(event) => setProfileForm({ ...profileForm, ifscCode: event.target.value })}
                className="w-full rounded-md border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">
                Branch{profile?.isNewRegistration ? ' *' : ''}
              </span>
              <input
                type="text"
                value={profileForm.bankBranch}
                onChange={(event) => setProfileForm({ ...profileForm, bankBranch: event.target.value })}
                className="w-full rounded-md border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
            </label>
            <label className="space-y-2 lg:col-span-2">
              <span className="text-sm font-medium text-slate-700">
                Terms & Conditions
              </span>
              <textarea
                rows={4}
                value={profileForm.termsAndConditions}
                onChange={(event) => setProfileForm({ ...profileForm, termsAndConditions: event.target.value })}
                placeholder="Enter custom terms and conditions for your invoices..."
                className="w-full rounded-md border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
            </label>
          </div>

          <div className="mt-6 flex items-center gap-3">
          <button
            type="submit"
            disabled={savingProfile}
            className="inline-flex items-center justify-center rounded-md bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {savingProfile ? 'Saving...' : 'Save Profile'}
          </button>
          <button
            type="button"
            onClick={() => {
              setProfileForm({
                fullName: profile?.fullName || '',
                email: profile?.email || '',
                invoiceEmail: profile?.invoiceEmail || '',
                companyName: profile?.companyName || '',
                phoneNumber: profile?.phoneNumber || '',
                address: profile?.address || '',
                warehouseLocation: profile?.warehouseLocation || '',
                state: profile?.state || '',
                gstNumber: profile?.gstNumber || '',
                bankName: profile?.bankName || '',
                accountName: profile?.accountName || '',
                bankAccountNumber: profile?.bankAccountNumber || '',
                ifscCode: profile?.ifscCode || '',
                bankBranch: profile?.bankBranch || '',
                companyLogo: profile?.companyLogo || '',
                panNumber: profile?.panNumber || '',
                iecCode: profile?.iecCode || '',
                termsAndConditions: profile?.termsAndConditions || '',
              });
              setMessage(null);
              setError(null);
              setGstNotApplicable(profile?.gstNumber === 'NA');
            }}
            className="rounded-md border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            Reset
          </button>
        </div>
      </form>

      <form onSubmit={handlePasswordSubmit} className="rounded-xl bg-white p-8 shadow-sm">
        <div className="mb-6 flex flex-col gap-1">
          <h2 className="text-xl font-semibold">Change Password</h2>
          <p className="text-sm text-slate-600">
            Enter your current password and choose a new password.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">Current Password</span>
            <input
              type="password"
              value={passwordForm.currentPassword}
              onChange={(event) => setPasswordForm({ ...passwordForm, currentPassword: event.target.value })}
              className="w-full rounded-md border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">New Password</span>
            <input
              type="password"
              value={passwordForm.newPassword}
              onChange={(event) => setPasswordForm({ ...passwordForm, newPassword: event.target.value })}
              className="w-full rounded-md border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">Confirm New Password</span>
            <input
              type="password"
              value={passwordForm.confirmPassword}
              onChange={(event) => setPasswordForm({ ...passwordForm, confirmPassword: event.target.value })}
              className="w-full rounded-md border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
          </label>
        </div>

        <div className="mt-6">
          <button
            type="submit"
            disabled={savingPassword}
            className="inline-flex items-center justify-center rounded-md bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {savingPassword ? 'Updating password...' : 'Change Password'}
          </button>
        </div>
      </form>
    </div>
  </div>
  );
}
