"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setTempPassword(null);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      if (json.success) {
        setMessage(json.message || 'Temporary password has been generated.');
        if (json.tempPassword) setTempPassword(json.tempPassword);
      } else {
        setMessage(json.message || 'Failed to process request');
      }
    } catch (err) {
      console.error(err);
      setMessage('Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white p-6 rounded shadow">
        <h2 className="text-lg font-semibold mb-2">Forgot Password</h2>
        <p className="text-sm text-slate-600 mb-4">Enter your account email and we will generate a temporary password.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            className="w-full border rounded px-3 py-2"
          />
          <div className="flex gap-2">
            <button type="submit" disabled={loading} className="bg-blue-600 text-white px-4 py-2 rounded">
              {loading ? 'Please wait...' : 'Generate Temporary Password'}
            </button>
            <button type="button" onClick={() => router.push('/auth/signin')} className="px-4 py-2 rounded border">
              Back to Sign in
            </button>
          </div>
        </form>

        {message && <div className="mt-4 p-3 bg-amber-50 border rounded text-amber-800">{message}</div>}
        {tempPassword && (
          <div className="mt-3 p-3 bg-blue-50 border rounded">
            <div className="text-sm text-slate-700">Temporary password:</div>
            <div className="font-mono font-bold text-lg mt-1">{tempPassword}</div>
            <div className="text-xs text-slate-500 mt-2">Use this password to sign in, then change it from your profile.</div>
          </div>
        )}
      </div>
    </div>
  );
}
