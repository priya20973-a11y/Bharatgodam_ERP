'use client';

import { useEffect, useState } from 'react';

type TransactionRecord = {
  _id?: string;
  type: string;
  itemId?: string;
  quantity?: number;
  unit?: string;
  supplierOrCustomer?: string;
  lotNo?: string;
  notes?: string;
  createdAt?: string;
};

type ItemRecord = { _id?: string; name: string; type: string };

export default function ReportsClient() {
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [items, setItems] = useState<ItemRecord[]>([]);

  useEffect(() => {
    const loadData = async () => {
      const [transactionsRes, itemsRes] = await Promise.all([
        fetch('/api/manufacturing/transactions'),
        fetch('/api/manufacturing/items'),
      ]);
      const transactionsData = await transactionsRes.json();
      const itemsData = await itemsRes.json();
      setTransactions(transactionsData.transactions || []);
      setItems(itemsData.items || []);
    };

    loadData();
  }, []);

  const itemMap = new Map(items.map((item) => [item._id, item.name]));

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-slate-900">Manufacturing activity summary</h2>
      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2">Quantity</th>
              <th className="px-3 py-2">Reference</th>
              <th className="px-3 py-2">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {transactions.map((transaction) => (
              <tr key={transaction._id}>
                <td className="px-3 py-2">{transaction.type}</td>
                <td className="px-3 py-2">{itemMap.get(transaction.itemId || '') || 'Unknown'}</td>
                <td className="px-3 py-2">{transaction.quantity} {transaction.unit}</td>
                <td className="px-3 py-2">{transaction.supplierOrCustomer || transaction.lotNo || '-'}</td>
                <td className="px-3 py-2">{transaction.notes || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
