'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import toast from 'react-hot-toast';
import { getLedgerSummary, getMasterData } from '@/app/actions/stock-ledger-actions';
import { TimeStateLedgerTable } from '@/components/features/ledger/time-state-ledger-table';
import type { IClient, ICommodity, IWarehouse } from '@/types/schemas';
import { getDropdownDisplayName } from '@/lib/utils';

export default function LedgerReportPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const isAdmin = (session?.user as any)?.role === 'ADMIN';

  // Redirect to login if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/');
    }
  }, [status, router]);

  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [masterData, setMasterData] = useState<{
    clients: IClient[];
    commodities: ICommodity[];
    warehouses: IWarehouse[];
  }>({
    clients: [],
    commodities: [],
    warehouses: [],
  });

  const [filters, setFilters] = useState({
    clientId: '',
    warehouseId: '',
    commodityId: '',
  });

  const [ledgerData, setLedgerData] = useState<any>(null);

  // Fetch master data on component mount
  useEffect(() => {
    const fetchMasterData = async () => {
      try {
        const data = await getMasterData();
        setMasterData(data);
        setIsLoading(false);
      } catch (error) {
        console.error('Failed to fetch master data:', error);
        setIsLoading(false);
      }
    };

    if (session) {
      fetchMasterData();
    }
  }, [session]);

  const handleFilterChange = (name: string, value: string) => {
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const generateReport = async () => {
    if (!filters.clientId || !filters.warehouseId) {
      toast.error('Please select at least Client and Warehouse');
      return;
    }

    setIsGenerating(true);
    try {
      const data = await getLedgerSummary(filters.clientId, filters.warehouseId, filters.commodityId || undefined);
      setLedgerData(data);
    } catch (error) {
      console.error('Error generating ledger report:', error);
      toast.error('Failed to generate ledger report');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Time-State Ledger Report</h1>
          <p className="text-slate-600 mt-2">View continuous stock presence and billing periods</p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Report Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Client *</label>
                <Select value={filters.clientId} onValueChange={(value) => handleFilterChange('clientId', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select client" />
                  </SelectTrigger>
                  <SelectContent>
                    {masterData.clients.map(client => (
                      <SelectItem key={client._id?.toString()} value={client._id?.toString() || ''}>
                        {getDropdownDisplayName(client, masterData.clients, isAdmin)} {client.location ? `(${client.location})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Warehouse *</label>
                <Select value={filters.warehouseId} onValueChange={(value) => handleFilterChange('warehouseId', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select warehouse" />
                  </SelectTrigger>
                  <SelectContent>
                    {masterData.warehouses.map(warehouse => (
                      <SelectItem key={warehouse._id?.toString()} value={warehouse._id?.toString() || ''}>
                        {warehouse.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Commodity (Optional)</label>
                <Select value={filters.commodityId} onValueChange={(value) => handleFilterChange('commodityId', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All commodities" />
                  </SelectTrigger>
                  <SelectContent>
                    {masterData.commodities.map(commodity => (
                      <SelectItem key={commodity._id?.toString()} value={commodity._id?.toString() || ''}>
                        {getDropdownDisplayName(commodity, masterData.commodities, isAdmin)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end gap-2">
                <Button
                  onClick={generateReport}
                  disabled={isGenerating}
                  className="flex-1"
                >
                  {isGenerating ? 'Generating...' : 'Generate Report'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {ledgerData && (
          <div className="mt-8">
            <TimeStateLedgerTable 
              timeStateLedger={ledgerData}
              isLoading={isGenerating}
            />
          </div>
        )}

        {!ledgerData && !isGenerating && (
          <Card>
            <CardContent className="text-center py-8">
              <p className="text-slate-600">Select filters and generate a report to view day-wise ledger breakdown</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}