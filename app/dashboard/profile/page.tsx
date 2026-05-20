'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

interface ProfileData {
  id: string;
  fullName: string;
  email: string;
  role: string;
  companyName?: string;
  phoneNumber?: string;
  warehouseLocation?: string;
  gstNumber?: string | null;
}

const initialProfileForm = {
  fullName: '',
  email: '',
  companyName: '',
  phoneNumber: '',
  warehouseLocation: '',
  gstNumber: '',
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
        companyName: data.user.companyName || '',
        phoneNumber: data.user.phoneNumber || '',
        warehouseLocation: data.user.warehouseLocation || '',
        gstNumber: data.user.gstNumber || '',
      });
    } catch (err) {
      setError('Unable to load profile data.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleProfileSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingProfile(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(profileForm),
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data?.message || 'Unable to update profile.');
        return;
      }

      setProfile(data.user);
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
              <span className="text-sm font-medium text-slate-700">Email Address</span>
              <input
                type="email"
                value={profileForm.email}
                readOnly
                disabled
                className="w-full rounded-md border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-700 outline-none"
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
                readOnly
                disabled
                className="w-full rounded-md border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-700 outline-none"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Phone Number</span>
              <input
                type="text"
                value={profileForm.phoneNumber}
                onChange={(event) => setProfileForm({ ...profileForm, phoneNumber: event.target.value })}
                className="w-full rounded-md border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
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
              <span className="text-sm font-medium text-slate-700">GST Number</span>
              <input
                type="text"
                value={profileForm.gstNumber}
                onChange={(event) => setProfileForm({ ...profileForm, gstNumber: event.target.value })}
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
                companyName: profile?.companyName || '',
                phoneNumber: profile?.phoneNumber || '',
                warehouseLocation: profile?.warehouseLocation || '',
                gstNumber: profile?.gstNumber || '',
              });
              setMessage(null);
              setError(null);
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
