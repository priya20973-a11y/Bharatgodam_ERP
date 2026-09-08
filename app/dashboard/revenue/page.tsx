'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Wallet, TrendingUp, HandCoins, Filter, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'react-hot-toast';
import { logRevenueExportAction } from '@/app/actions/revenue';

export default function RevenueDashboard() {
  const [data, setData] = useState<{ summary: any; warehouseRevenue: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedWarehouse, setSelectedWarehouse] = useState('ALL');
  const [selectedMonth, setSelectedMonth] = useState('ALL');
  const [warehouseOptions, setWarehouseOptions] = useState<{ label: string; value: string }[]>([]);
  const [monthOptions, setMonthOptions] = useState<{ label: string; value: string }[]>([]);
  const [warehouseTransactions, setWarehouseTransactions] = useState<any[]>([]);

  // Generate month options (last 12 months)
  useEffect(() => {
    const months: { label: string; value: string }[] = [{ label: 'All Months', value: 'ALL' }];
    const today = new Date();
    for (let i = 11; i >= 0; i--) {
      const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const monthKey = `${year}-${month}`;
      const label = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(date);
      months.push({ label, value: monthKey });
    }
    setMonthOptions(months);
  }, []);

  useEffect(() => {
    fetchWarehouseOptions();
    loadAnalytics();
    loadWarehouseTransactions();
  }, []);

  useEffect(() => {
    loadAnalytics();
    loadWarehouseTransactions();
  }, [selectedWarehouse, selectedMonth]);

  const getMonthRange = (monthKey: string) => {
    const [year, month] = monthKey.split('-');
    const startDate = `${year}-${month}-01`;
    const nextMonth = new Date(Number(year), Number(month) - 1 + 1, 1);
    nextMonth.setDate(nextMonth.getDate() - 1);
    const endDate = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-${String(nextMonth.getDate()).padStart(2, '0')}`;
    return { startDate, endDate };
  };

  const loadWarehouseTransactions = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedWarehouse !== 'ALL') params.append('warehouseId', selectedWarehouse);
      if (selectedMonth !== 'ALL') {
        params.append('month', selectedMonth);
      }
      const query = params.toString() ? `?${params.toString()}` : '';
      const response = await fetch(`/api/revenue-dashboard/ledger-periods${query}`);
      if (!response.ok) {
        setWarehouseTransactions([]);
        return;
      }
      const json = await response.json();
      setWarehouseTransactions(json.periods || []);
    } catch (error) {
      console.error('Failed to load ledger periods:', error);
      setWarehouseTransactions([]);
    }
  };

  const fetchWarehouseOptions = async () => {
    try {
      const response = await fetch('/api/warehouses');
      if (!response.ok) throw new Error('Failed to load warehouses');
      const result = await response.json();
      const options = result.warehouses?.map((warehouse: any) => ({
        label: warehouse.name,
        value: String(warehouse.id || warehouse._id),
      })) || [];
      setWarehouseOptions([{ label: 'All Warehouses', value: 'ALL' }, ...options]);
    } catch (error) {
      console.error('Warehouse load failed:', error);
    }
  };

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedWarehouse !== 'ALL') params.append('warehouseId', selectedWarehouse);
      if (selectedMonth !== 'ALL') params.append('month', selectedMonth);
      const query = params.toString() ? `?${params.toString()}` : '';
      const response = await fetch(`/api/revenue-dashboard${query}`);
      if (!response.ok) throw new Error('Failed to load revenue analytics');
      const analytics = await response.json();
      setData(analytics);
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center animate-pulse text-slate-500">Calculating revenue splits...</div>;
  }

  const { summary, warehouseRevenue } = data!;

  const formatDecimal = (value: number) => value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatRent = (value: number) => Math.round(value).toLocaleString('en-IN');

  const formatMonthLabel = (monthKey: string) => {
    const [year, month] = monthKey.split('-');
    const date = new Date(Number(year), Number(month) - 1, 1);
    return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(date);
  };

  const getTransactionMonth = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return '';
    return formatMonthLabel(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  };

  const exportToCSV = async () => {
    try {
      type MonthlyCharges = Record<string, number>;

      const warehouseMonthTotals = warehouseTransactions
        .filter((period) => selectedMonth === 'ALL' || period.month === selectedMonth)
        .reduce(
          (acc: Record<string, { warehouseName: string; month: string; amount: number }>, period: any) => {
            const warehouseName = period.warehouseName || 'Unknown Warehouse';
            const month = period.month || '';
            const key = `${warehouseName}||${month}`;
            const amount = typeof period.rentTotal === 'number' ? period.rentTotal : Number(period.rentTotal || 0);

            if (!acc[key]) {
              acc[key] = { warehouseName, month, amount: 0 };
            }
            acc[key].amount += amount;
            return acc;
          },
          {}
        );

      const summaryRows = Object.values(warehouseMonthTotals).map((item) => ({
        'Row Type': 'Revenue Summary',
        'Warehouse Name': item.warehouseName,
        'Client Name': '',
        Month: formatMonthLabel(item.month),
        Date: '',
        Direction: '',
        Commodity: '',
        'Quantity': '',
        'Unit': '',
        'Gate Pass': '',
        Status: '',
        'Rent (₹)': Math.round(item.amount * 100) / 100,
        'Owner Share (₹)': Math.round(item.amount * 0.6 * 100) / 100,
        'Platform Share (₹)': Math.round(item.amount * 0.4 * 100) / 100,
      }));

      const transactionRows = warehouseTransactions
        .filter((period) => selectedMonth === 'ALL' || period.month === selectedMonth)
        .map((period) => ({
          'Row Type': 'Ledger Period',
          'Warehouse Name': period.warehouseName || '',
          'Client Name': period.clientName || '',
          Month: formatMonthLabel(period.month),
          Date: `${period.periodStart} to ${period.periodEnd}`,
          Direction: 'Storage',
          Commodity: period.commodityName || '',
          'Quantity': typeof period.quantityMT === 'number' ? period.quantityMT.toFixed(2) : (period.bagsCount || ''),
          'Unit': period.unit || 'MT',
          'Gate Pass': period.gatePass || '',
          Status: period.status || '',
          'Rent (₹)': typeof period.rentTotal === 'number' ? period.rentTotal.toFixed(2) : '',
          'Owner Share (₹)': '',
          'Platform Share (₹)': '',
        }));

      const rows = [...summaryRows, ...transactionRows];
      if (rows.length === 0) {
        toast.error('No revenue or transaction data available to export');
        return;
      }

      const header = [
        'Row Type',
        'Warehouse Name',
        'Client Name',
        'Month',
        'Date',
        'Direction',
        'Commodity',
        'Quantity',
        'Unit',
        'Gate Pass',
        'Status',
        'Rent (₹)',
        'Owner Share (₹)',
        'Platform Share (₹)',
      ];

      const csvLines = [header.join(',')];
      for (const row of rows) {
        const line = header.map((key) => {
          const value = row[key as keyof typeof row];
          const escaped = String(value ?? '').replace(/"/g, '""');
          return `"${escaped}"`;
        }).join(',');
        csvLines.push(line);
      }

      const csvContent = csvLines.join('\n');
      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `RevenueSplit_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      await logRevenueExportAction();
      
      toast.success('Revenue CSV exported successfully');
    } catch (error) {
      console.error('Revenue CSV export failed:', error);
      toast.error('Failed to export revenue CSV');
    }
  };

  const revenueRows = warehouseRevenue.flatMap((item: any) =>
  Object.entries(item.monthlyCharges as Record<string, number>)
    .filter(([monthKey]) => selectedMonth === 'ALL' || monthKey === selectedMonth)
    .map(([monthKey, rent]) => ({
      warehouseId: item.warehouseId,
      warehouseName: item.warehouseName,
      monthKey,
      monthLabel: formatMonthLabel(monthKey),
      rent,
      ownerShare: Math.round(rent * 0.6 * 100) / 100,
      platformShare: Math.round(rent * 0.4 * 100) / 100,
    }))
).sort((a, b) => {
  if (a.warehouseName !== b.warehouseName) {
    return a.warehouseName.localeCompare(b.warehouseName);
  }
  return a.monthKey.localeCompare(b.monthKey);
});

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Revenue split for Storage Charges</h1>
        <p className="text-slate-500">Monitor the 60/40 Revenue split for Storage Charges between Warehouse Owners and the Platform.</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-white border-l-4 border-l-indigo-600">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2 uppercase tracking-wider">
              <TrendingUp className="h-4 w-4" /> Gross Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-slate-900">₹{summary.totalRevenue.toLocaleString('en-IN')}</div>
            <p className="text-xs text-slate-400 mt-1">Total billing generated across all clients.</p>
          </CardContent>
        </Card>

        <Card className="bg-white border-l-4 border-l-emerald-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2 uppercase tracking-wider">
              <Wallet className="h-4 w-4" /> Owner Earnings (60%)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-emerald-600">₹{summary.ownerEarnings.toLocaleString('en-IN')}</div>
            <p className="text-xs text-slate-400 mt-1">Net profit disbursed to warehouse operators.</p>
          </CardContent>
        </Card>

        <Card className="bg-white border-l-4 border-l-amber-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2 uppercase tracking-wider">
              <HandCoins className="h-4 w-4" /> Platform Comm. (40%)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-amber-600">₹{summary.platformCommissions.toLocaleString('en-IN')}</div>
            <p className="text-xs text-slate-400 mt-1">Management fees and platform service charges.</p>
          </CardContent>
        </Card>
      </div>

      {/* Client-Warehouse Revenue Table */}
      <Card className="bg-white">
        <CardHeader className="flex flex-col gap-4 border-b bg-slate-50/50 p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="text-lg font-bold">Warehouse Revenue Summary</CardTitle>
            <p className="text-xs text-slate-500">Month-wise revenue rows for each warehouse.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <Filter className="h-3 w-3 text-slate-500" />
              <Select value={selectedWarehouse} onValueChange={(value) => setSelectedWarehouse(value)}>
                <SelectTrigger className="min-w-[220px]">
                  <SelectValue placeholder="Filter by warehouse" />
                </SelectTrigger>
                <SelectContent>
                  {warehouseOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <Filter className="h-3 w-3 text-slate-500" />
              <Select value={selectedMonth} onValueChange={(value) => setSelectedMonth(value)}>
                <SelectTrigger className="min-w-[180px]">
                  <SelectValue placeholder="Filter by month" />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={exportToCSV}
              disabled={revenueRows.length === 0 && warehouseTransactions.length === 0}
              className="font-bold bg-emerald-600 hover:bg-emerald-700 flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Warehouse Name</TableHead>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Rent (₹)</TableHead>
                <TableHead className="text-emerald-600">Owner (60%)</TableHead>
                <TableHead className="text-amber-600">Platform (40%)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {revenueRows.map((item: any) => (
                <TableRow key={`${item.warehouseId}-${item.monthKey}`} className="hover:bg-slate-50/50">
                  <TableCell className="font-medium text-slate-900">
                    {item.warehouseName}
                  </TableCell>
                  <TableCell>{item.monthLabel}</TableCell>
                  <TableCell className="text-right">₹{formatRent(item.rent)}</TableCell>
                  <TableCell className="text-emerald-600 font-bold">₹{formatRent(item.ownerShare)}</TableCell>
                  <TableCell className="text-amber-600 font-bold">₹{formatRent(item.platformShare)}</TableCell>
                </TableRow>
              ))}
              {revenueRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-slate-400 italic">
                    No revenue data found for the selected period.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

    </div>
  );
}
