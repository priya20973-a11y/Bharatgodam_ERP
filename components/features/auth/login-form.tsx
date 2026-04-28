'use client';

import React, { useState } from 'react';
import { Mail, Lock, ArrowRight, UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation'; // <-- Native Next.js Router
import { signIn } from 'next-auth/react'; // <-- Import NextAuth signIn

export default function LoginForm() {
  const router = useRouter(); // <-- Initialize Router
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // REAL API Integration
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Handle Sign In
      const result = await signIn('credentials', {
        redirect: false,
        email,
        password,
      });

      if (result?.error) {
        alert(`Error: ${result.error}`);
      } else {
        // Secure, fast client-side redirect!
        router.push('/dashboard'); 
        router.refresh(); // Forces Next.js to check the new session state
      }
    } catch (error) {
      console.error('Authentication error:', error);
      alert('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMode = () => {
    // Optional: Clear form when switching modes
    setEmail('');
    setPassword('');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      {/* Centered Card */}
      <div className="w-full max-w-md space-y-8 rounded-2xl bg-white p-8 shadow-xl border border-gray-100">
        
        {/* Header Section */}
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-extrabold tracking-tight text-gray-900">
            Sign in to your account
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Warehouse Management System v2.0
          </p>
        </div>

        {/* Auth Form */}
        <form className="mt-8 space-y-6" onSubmit={handleSubmit} aria-label="Authentication form">
          <div className="space-y-4 rounded-md shadow-sm">
            
            {/* Email Field */}
            <div>
              <label htmlFor="email-address" className="sr-only">
                Email address
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Mail className="h-5 w-5 text-gray-400" aria-hidden="true" />
                </div>
                <input
                  id="email-address"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 py-3 pl-10 pr-3 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm transition-colors"
                  placeholder="Email ID"
                  aria-required="true"
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Lock className="h-5 w-5 text-gray-400" aria-hidden="true" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 py-3 pl-10 pr-3 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm transition-colors"
                  placeholder="Password"
                  aria-required="true"
                />
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative flex w-full justify-center rounded-lg border border-transparent bg-blue-600 py-3 px-4 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
            >
              <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                <ArrowRight className="h-5 w-5 text-blue-500 group-hover:text-blue-400 transition-colors" aria-hidden="true" />
              </span>
              {isLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </div>
        </form>

        {/* Toggle Mode Button */}
        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-white px-2 text-gray-500">Need an account?</span>
            </div>
          </div>

          <div className="mt-6 text-center">
            <button
              onClick={() => router.push('/auth/signup')}
              type="button"
              className="font-medium text-blue-600 hover:text-blue-500 focus:outline-none focus:underline"
            >
              Sign up for a WSP account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
