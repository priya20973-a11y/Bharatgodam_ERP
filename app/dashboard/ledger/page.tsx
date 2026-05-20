'use client';

import { useState, useEffect } from 'react';
import { getClients } from '@/app/actions/client-actions';
import { LedgerCalculator } from '@/components/features/ledger';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, ChevronRight, ArrowLeft, Landmark } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value);
}

export default function LedgerDashboard() {
  const [clients, setClients] = useState<any[]>([]);
  const [selectedClient, setSelectedClient] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    setLoading(true);
    const data = await getClients();
    setClients(data);
    setLoading(false);
  };

  const handleDrillDown = (client: any) => {
    setSelectedClient(client);
  };

  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.type.toLowerCase().includes(search.toLowerCase())
  );

  if (selectedClient) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => setSelectedClient(null)} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Client Directory
        </Button>

        <div className="space-y-6">
          <LedgerCalculator
            clientId={selectedClient._id}
            clientName={selectedClient.name}
            showInvoiceAdjustments={true}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Financial Ledger</h1>
          <p className="text-slate-500">View consolidated balances and drill down into individual transaction math.</p>
        </div>

      </div>

      <div className="flex items-center gap-4 bg-white p-4 rounded-xl border shadow-sm">
        <Search className="h-5 w-5 text-slate-400" />
        <Input 
          placeholder="Search by client name or type..." 
          className="max-w-md border-none focus-visible:ring-0 shadow-none text-lg"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          [1, 2, 3].map(i => <div key={i} className="h-32 bg-slate-200 animate-pulse rounded-xl" />)
        ) : (
          filteredClients.map((client, index) => (
            <Card 
              key={`${client._id || client.id || index}-${client.name}-${index}`} 
              className="group hover:border-indigo-500 cursor-pointer transition-all duration-200 shadow-sm"
              onClick={() => handleDrillDown(client)}
            >
              <CardContent className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="h-12 w-12 rounded-full bg-indigo-50 flex items-center justify-center group-hover:bg-indigo-600 transition-colors">
                    <Landmark className="h-6 w-6 text-indigo-600 group-hover:text-white" />
                  </div>
                  <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all" />
                </div>
                <h3 className="text-xl font-bold text-slate-900">{client.name}</h3>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider">{client.type}</Badge>
                  <p className="text-xs text-slate-400 font-medium">{client.mobile}</p>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
