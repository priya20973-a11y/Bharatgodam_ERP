'use client';

import { useState, useEffect, useMemo } from 'react';
import { getClients } from '@/app/actions/client-actions';
import { ColdClientLedger } from '@/components/features/ledger/cold-client-ledger';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, ChevronRight, ArrowLeft, Landmark } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useColdTranslation } from '@/components/providers/cold-language-provider';

import { toGujaratiDigits } from '@/lib/utils/cold-numbers';

function formatCurrency(value: number, language: string) {
  const formatted = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value);
  return language === 'gu' ? toGujaratiDigits(formatted) : formatted;
}

export default function LedgerDashboard() {
  const { t, language, formatNumber } = useColdTranslation();
  const [clients, setClients] = useState<any[]>([]);
  const [selectedClient, setSelectedClient] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const selectedTab = 'clients';
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [warehouseLoading, setWarehouseLoading] = useState(false);
  const [warehouseError, setWarehouseError] = useState<string | null>(null);
  const [warehouseReport, setWarehouseReport] = useState<any | null>(null);
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>('all');

  useEffect(() => {
    loadClients();
    loadWarehouses();
  }, []);

  const loadClients = async () => {
    setLoading(true);
    const data = await getClients();
    setClients(data);
    setLoading(false);
  };

  const loadWarehouses = async () => {
    try {
      const response = await fetch('/api/warehouses');
      const result = await response.json();
      if (result.success) {
        setWarehouses(result.warehouses || []);
      }
    } catch (error) {
      console.error('Failed to load warehouses', error);
    }
  };

  const fetchWarehouseReport = async (warehouseId: string) => {
    if (!warehouseId) {
      setWarehouseReport(null);
      setWarehouseError(null);
      return;
    }

    setWarehouseLoading(true);
    setWarehouseError(null);

    try {
      const response = await fetch(`/api/reports/ledger/warehouse?warehouseId=${encodeURIComponent(warehouseId)}`);
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Unable to load warehouse ledger');
      }
      setWarehouseReport(result.data);
    setSelectedMonthKey('all');
    } catch (error: any) {
      console.error('Failed to load warehouse ledger report', error);
      setWarehouseError(error?.message || 'Failed to load warehouse ledger report');
      setWarehouseReport(null);
    } finally {
      setWarehouseLoading(false);
    }
  };

  const handleDrillDown = (client: any) => {
    setSelectedClient(client);
  };

  const availableMonthKeys = useMemo(() => {
    if (!warehouseReport?.transactionRecords?.length) return [];
    const keys = new Set<string>();
    warehouseReport.transactionRecords.forEach((tx: any) => {
      const date = new Date(tx.date);
      if (!Number.isNaN(date.getTime())) {
        keys.add(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
      }
    });
    return Array.from(keys).sort();
  }, [warehouseReport]);

  const formatMonthLabel = (monthKey: string) => {
    const [year, month] = monthKey.split('-');
    const date = new Date(Number(year), Number(month) - 1, 1);
    return date.toLocaleString('default', { month: 'short', year: 'numeric' });
  };

  const filteredTransactionRecords = useMemo(() => {
    if (!warehouseReport?.transactionRecords?.length) return [];
    if (selectedMonthKey === 'all') return warehouseReport.transactionRecords;
    return warehouseReport.transactionRecords.filter((tx: any) => {
      const date = new Date(tx.date);
      if (Number.isNaN(date.getTime())) return false;
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` === selectedMonthKey;
    });
  }, [warehouseReport, selectedMonthKey]);

  const filteredClientSummaries = useMemo(() => {
    if (selectedMonthKey === 'all' || !warehouseReport?.transactionRecords?.length) {
      return warehouseReport?.clientSummaries || [];
    }
    const map = new Map<string, any>();
    filteredTransactionRecords.forEach((tx: any) => {
      const clientKey = `${tx.clientName || 'Unknown Client'}|${tx.commodityName || 'Unknown Commodity'}`;
      if (!map.has(clientKey)) {
        map.set(clientKey, {
          clientName: tx.clientName || 'Unknown Client',
          commodityName: tx.commodityName || 'Unknown Commodity',
          inwardMT: 0,
          outwardMT: 0,
          balanceMT: 0,
          transactionCount: 0,
        });
      }
      const summary = map.get(clientKey);
      const inwardMT = tx.direction === 'INWARD' ? Number(tx.mt || 0) : 0;
      const outwardMT = tx.direction === 'OUTWARD' ? Number(tx.mt || 0) : 0;
      summary.inwardMT += inwardMT;
      summary.outwardMT += outwardMT;
      summary.balanceMT += inwardMT - outwardMT;
      summary.transactionCount += 1;
    });
    return Array.from(map.values()).sort((a, b) => a.clientName.localeCompare(b.clientName) || a.commodityName.localeCompare(b.commodityName));
  }, [warehouseReport, selectedMonthKey, filteredTransactionRecords]);

  const filteredCommoditySummaries = useMemo(() => {
    if (selectedMonthKey === 'all' || !warehouseReport?.transactionRecords?.length) {
      return warehouseReport?.commoditySummaries || [];
    }
    const map = new Map<string, any>();
    filteredTransactionRecords.forEach((tx: any) => {
      const commodityName = tx.commodityName || 'Unknown Commodity';
      if (!map.has(commodityName)) {
        map.set(commodityName, {
          commodityName,
          inwardMT: 0,
          outwardMT: 0,
          balanceMT: 0,
          clientIds: new Set<string>(),
        });
      }
      const summary = map.get(commodityName);
      const inwardMT = tx.direction === 'INWARD' ? Number(tx.mt || 0) : 0;
      const outwardMT = tx.direction === 'OUTWARD' ? Number(tx.mt || 0) : 0;
      summary.inwardMT += inwardMT;
      summary.outwardMT += outwardMT;
      summary.balanceMT += inwardMT - outwardMT;
      summary.clientIds.add(tx.clientName || 'Unknown Client');
    });
    return Array.from(map.values()).map((summary) => ({
      commodityName: summary.commodityName,
      inwardMT: summary.inwardMT,
      outwardMT: summary.outwardMT,
      balanceMT: summary.balanceMT,
      clientCount: summary.clientIds.size,
    })).sort((a, b) => b.balanceMT - a.balanceMT || a.commodityName.localeCompare(b.commodityName));
  }, [warehouseReport, selectedMonthKey, filteredTransactionRecords]);

  const filteredClientLedgerSummaries = useMemo(() => {
    if (selectedMonthKey === 'all' || !warehouseReport?.transactionRecords?.length) {
      return warehouseReport?.clientLedgerSummaries || [];
    }
    const visibleKeys = new Set<string>();
    filteredTransactionRecords.forEach((tx: any) => {
      visibleKeys.add(`${tx.clientName || 'Unknown Client'}|${tx.commodityName || 'Unknown Commodity'}`);
    });
    return (warehouseReport?.clientLedgerSummaries || []).filter((item: any) =>
      visibleKeys.has(`${item.clientName || 'Unknown Client'}|${item.commodityName || 'Unknown Commodity'}`)
    );
  }, [warehouseReport, selectedMonthKey, filteredTransactionRecords]);

  const filteredSummary = useMemo(() => {
    if (!warehouseReport?.transactionRecords?.length) {
      return {
        totalClients: 0,
        totalCommodities: 0,
        totalInwardMT: 0,
        totalOutwardMT: 0,
        netMT: 0,
      };
    }
    const rows = selectedMonthKey === 'all' ? warehouseReport.transactionRecords : filteredTransactionRecords;
    const clientIds = new Set<string>();
    const commodityIds = new Set<string>();
    let totalInwardMT = 0;
    let totalOutwardMT = 0;

    rows.forEach((tx: any) => {
      clientIds.add(tx.clientName || 'Unknown Client');
      commodityIds.add(tx.commodityName || 'Unknown Commodity');
      if (tx.direction === 'INWARD') {
        totalInwardMT += Number(tx.mt || 0);
      } else if (tx.direction === 'OUTWARD') {
        totalOutwardMT += Number(tx.mt || 0);
      }
    });

    return {
      totalClients: clientIds.size,
      totalCommodities: commodityIds.size,
      totalInwardMT: Number(totalInwardMT.toFixed(2)),
      totalOutwardMT: Number(totalOutwardMT.toFixed(2)),
      netMT: Number((totalInwardMT - totalOutwardMT).toFixed(2)),
    };
  }, [warehouseReport, selectedMonthKey, filteredTransactionRecords]);

  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.type.toLowerCase().includes(search.toLowerCase())
  );

  if (selectedClient) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => setSelectedClient(null)} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> {t('ledger.backToDirectory')}
        </Button>

        <div className="space-y-6">
          <ColdClientLedger
            clientId={selectedClient._id}
            clientName={selectedClient.name}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">{t('ledger.pageTitle')}</h1>
          <p className="text-slate-500">{t('ledger.pageDescription')}</p>
        </div>
      </div>

      {selectedTab === 'clients' ? (
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
      ) : null}
    </div>
  );
}
