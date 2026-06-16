'use client';

import { useState } from 'react';
import { signIn, useSession } from 'next-auth/react';

export default function TestInvoicesPage() {
  const { data: session, status } = useSession();
  const [email, setEmail] = useState('admin@test.com');
  const [password, setPassword] = useState('password123');
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError('Login failed: ' + result.error);
    }
  };

  const fetchInvoices = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/invoices/monthly/Sureshwar%20Corporation');
      const data = await response.json();

      if (data.success) {
        setInvoices(data.data);
      } else {
        setError(data.message || 'Failed to fetch invoices');
      }
    } catch (err) {
      setError('Error fetching invoices: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  };

  if (status === 'loading') {
    return <div className="p-6">Loading...</div>;
  }

  if (!session) {
    return (
      <div className="p-6 max-w-md mx-auto">
        <h1 className="text-2xl font-bold mb-6">Login to Test Monthly Invoices</h1>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Email *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-2 border rounded"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Password *</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-2 border rounded"
              required
            />
          </div>

          <button
            type="submit"
            className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600"
          >
            Login
          </button>
        </form>

        {error && (
          <div className="mt-4 p-3 bg-red-100 text-red-700 rounded">
            {error}
          </div>
        )}

        <div className="mt-6 p-3 bg-gray-100 rounded">
          <p className="text-sm text-gray-600">
            <strong>Test Credentials:</strong><br />
            Email: admin@test.com<br />
            Password: password123
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Monthly Invoices Test</h1>
        <div className="text-sm text-gray-600">
          Logged in as: {session.user?.email}
        </div>
      </div>

      <div className="mb-6">
        <button
          onClick={fetchInvoices}
          disabled={loading}
          className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Fetch Monthly Invoices'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
          {error}
        </div>
      )}

      {invoices && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Generated Invoices:</h2>

          {invoices.map((invoice, index) => (
            <div key={index} className="border rounded p-4 bg-gray-50">
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-lg font-medium">
                  {invoice.month} {invoice.year}
                </h3>
                <div className="text-right">
                  <div className="text-sm text-gray-600">{invoice.warehouseName}</div>
                  <div className="text-lg font-bold text-green-600">
                    ₹{invoice.totalAmount.toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                {invoice.lineItems.map((item: any, itemIndex: number) => (
                  <div key={itemIndex} className="flex justify-between text-sm bg-white p-2 rounded">
                    <div>
                      <span className="font-medium">{item.commodityName}</span>
                      <span className="text-gray-500 ml-2">
                        {item.bags} bags, {item.storageDays} days
                      </span>
                    </div>
                    <div className="text-right">
                      <div>₹{item.amount.toLocaleString()}</div>
                      <div className="text-xs text-gray-500">
                        {new Date(item.inwardDate).toLocaleDateString()} →
                        {item.outwardDate ? new Date(item.outwardDate).toLocaleDateString() : 'Current'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="mt-6 p-4 bg-blue-50 rounded">
            <h3 className="font-semibold mb-2">Summary:</h3>
            <p className="text-sm">
              Total Invoices: {invoices.length} | Total Amount: ₹{invoices.reduce((sum, inv) => sum + inv.totalAmount, 0).toLocaleString()}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}