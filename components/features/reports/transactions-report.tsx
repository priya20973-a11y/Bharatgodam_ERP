'use client';

import React, { useEffect, useState, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  ColumnDef,
  flexRender,
  SortingState,
  VisibilityState,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getClientOptions, getWarehouseOptions } from '@/app/actions/reports';
import { Download, ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'react-hot-toast';
import { getDropdownDisplayName } from '@/lib/utils';
import { useRouter } from 'next/navigation';

interface TransactionRecord {
  _id: string;
  sourceType?: string;
  direction: 'INWARD' | 'OUTWARD' | 'No Data Found';
  date: string;
  clientName: string;
  clientId: string;
  commodityName: string;
  commodityId: string;
  warehouseName: string;
  warehouseId: string;
  quantityMT: number;
  rentTotal?: number;
  bagsCount?: number;
  gatePass?: string;
  stackNo?: string;
  lotNo?: string;
  status?: string;
  createdAt: string;
}

interface TransactionsReportProps {
  transactions: TransactionRecord[];
  isAdmin?: boolean;
  isLoading?: boolean;
}

export default function TransactionsReport({ transactions, isAdmin = false, isLoading = false }: TransactionsReportProps) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    stackNo: false,
    lotNo: false,
    bagsCount: true,
  });
  const [globalFilter, setGlobalFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('ALL');
  const [warehouseFilter, setWarehouseFilter] = useState('ALL');
  const [monthFilter, setMonthFilter] = useState('ALL');
  const [clientOptions, setClientOptions] = useState<{ label: string; value: string }[]>([]);
  const [warehouseOptions, setWarehouseOptions] = useState<{ label: string; value: string }[]>([]);
  const [isLoadingClients, setIsLoadingClients] = useState(true);
  const [isLoadingWarehouses, setIsLoadingWarehouses] = useState(true);
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 20,
  });
  const [liveTransactions, setLiveTransactions] = useState<TransactionRecord[]>(transactions);
  const [isDailyReport, setIsDailyReport] = useState(false);
  const [fromDateFilter, setFromDateFilter] = useState(() => new Date().toISOString().split('T')[0]);
  const [toDateFilter, setToDateFilter] = useState(() => new Date().toISOString().split('T')[0]);

  useEffect(() => {
    setLiveTransactions(transactions);
  }, [transactions]);

  const handleDeleteTransaction = async (transaction: TransactionRecord) => {
    if (!window.confirm(`Delete transaction on ${transaction.date} for ${transaction.clientName}? This will remove linked stock, ledger, and invoice entries.`)) {
      return;
    }

    try {
      const response = await fetch('/api/transactions', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transactionId: transaction._id,
          sourceType: transaction.sourceType,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Unable to delete transaction');
      }

      setLiveTransactions((current) => current.filter((item) => item._id !== transaction._id));
      toast.success('Transaction deleted successfully');
      router.refresh();
    } catch (error) {
      console.error('Delete failed:', error);
      toast.error(`Delete failed: ${String(error)}`);
    }
  };

  const handleEditTransaction = async (transaction: TransactionRecord) => {
    const newDate = window.prompt('Enter new transaction date (YYYY-MM-DD)', transaction.date);
    if (!newDate) return;
    const parsedDate = new Date(newDate);
    if (Number.isNaN(parsedDate.getTime())) {
      toast.error('Invalid date entered');
      return;
    }

    const newQuantity = window.prompt('Enter new quantity (MT)', transaction.quantityMT.toString());
    if (!newQuantity) return;
    const quantityValue = Number(newQuantity);
    if (!Number.isFinite(quantityValue) || quantityValue <= 0) {
      toast.error('Quantity must be a positive number');
      return;
    }

    try {
      const response = await fetch('/api/transactions', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transactionId: transaction._id,
          date: newDate,
          quantityMT: quantityValue,
          sourceType: transaction.sourceType,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Unable to edit transaction');
      }

      setLiveTransactions((current) =>
        current.map((item) =>
          item._id === transaction._id
            ? { ...item, date: newDate, quantityMT: quantityValue }
            : item
        )
      );
      toast.success('Transaction updated successfully');
      router.refresh();
    } catch (error) {
      console.error('Edit failed:', error);
      toast.error(`Edit failed: ${String(error)}`);
    }
  };

  useEffect(() => {
    const loadMasters = async () => {
      setIsLoadingClients(true);
      setIsLoadingWarehouses(true);
      try {
        const [clients, warehouses] = await Promise.all([
          getClientOptions(),
          getWarehouseOptions(),
        ]);
        const filteredClients = clients.filter((client) => {
          const name = client.label.trim().toLowerCase();
          return (
            name !== 'abc traders' &&
            name !== 'xyz enterprise' &&
            name !== 'xyz enterprises'
          );
        });
        setClientOptions(filteredClients);
        setWarehouseOptions(warehouses);
      } catch (error) {
        console.error('Failed to load master dropdown options:', error);
      } finally {
        setIsLoadingClients(false);
        setIsLoadingWarehouses(false);
      }
    };

    loadMasters();
  }, []);

  const extractTransactionMonth = (dateValue?: string) => {
    if (!dateValue) return '';
    const parsed = new Date(dateValue);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString().slice(0, 7);
  };

  const filteredTransactions = useMemo(() => {
    if (isDailyReport) {
      const dailyTransactions = liveTransactions.filter((item) => {
        const itemDate = item.date ? new Date(item.date).toISOString().split('T')[0] : '';
        return itemDate >= fromDateFilter && itemDate <= toDateFilter;
      });

      const getDatesInRange = (start: string, end: string) => {
        const dates = [];
        let current = new Date(start);
        const endDate = new Date(end);
        while (current <= endDate) {
          dates.push(current.toISOString().split('T')[0]);
          current.setDate(current.getDate() + 1);
        }
        return dates.length > 0 ? dates : [start];
      };

      const dateRange = getDatesInRange(fromDateFilter, toDateFilter);
      const dummyRecords: TransactionRecord[] = [];

      dateRange.forEach(dateStr => {
        const clientsWithTxOnDate = new Set(
          dailyTransactions
            .filter(t => (t.date ? new Date(t.date).toISOString().split('T')[0] : '') === dateStr)
            .map(t => t.clientId)
        );

        clientOptions.forEach(client => {
          if (client.value !== 'ALL' && !clientsWithTxOnDate.has(client.value)) {
            dummyRecords.push({
              _id: `dummy-${client.value}-${dateStr}`,
              direction: 'No Data Found',
              date: dateStr,
              clientName: client.label,
              clientId: client.value,
              commodityName: '-',
              commodityId: '',
              warehouseName: '-',
              warehouseId: '',
              quantityMT: null as any,
              bagsCount: undefined,
              gatePass: undefined,
              stackNo: undefined,
              lotNo: undefined,
              status: undefined,
              createdAt: '',
            });
          }
        });
      });

      const combinedDaily = [...dailyTransactions, ...dummyRecords];
      
      return combinedDaily.filter((item) => {
        const matchesClient =
          clientFilter === 'ALL' ||
          item.clientId === clientFilter ||
          item.clientName === clientFilter;
        const matchesWarehouse =
          warehouseFilter === 'ALL' ||
          item.warehouseId === warehouseFilter ||
          item.warehouseName === warehouseFilter;
        return matchesClient && matchesWarehouse;
      });
    }

    return liveTransactions.filter((item) => {
      const matchesClient =
        clientFilter === 'ALL' ||
        item.clientId === clientFilter ||
        item.clientName === clientFilter;
      const matchesWarehouse =
        warehouseFilter === 'ALL' ||
        item.warehouseId === warehouseFilter ||
        item.warehouseName === warehouseFilter;
      const itemMonth = extractTransactionMonth(item.date);
      const matchesMonth = monthFilter === 'ALL' || itemMonth === monthFilter;
      return matchesClient && matchesWarehouse && matchesMonth;
    });
  }, [liveTransactions, clientFilter, warehouseFilter, monthFilter, isDailyReport, fromDateFilter, toDateFilter, clientOptions]);

  const monthDropdownOptions = useMemo(() => {
    const uniqueMonths = Array.from(
      new Set(liveTransactions.map((item) => extractTransactionMonth(item.date)).filter(Boolean))
    );
    const sortedMonths = uniqueMonths.sort((a, b) => b.localeCompare(a));
    return [{ label: 'All Months', value: 'ALL' }, ...sortedMonths.map((month) => ({
      label: new Date(`${month}-01`).toLocaleString('en-IN', { month: 'short', year: 'numeric' }),
      value: month,
    }))];
  }, [transactions]);

  const clientDropdownOptions = useMemo(() => {
    const hasAll = clientOptions.some((option) => option.value === 'ALL');
    return hasAll ? clientOptions : [{ label: 'All Clients', value: 'ALL' }, ...clientOptions];
  }, [clientOptions]);

  const warehouseDropdownOptions = useMemo(() => {
    const hasAll = warehouseOptions.some((option) => option.value === 'ALL');
    return hasAll ? warehouseOptions : [{ label: 'All Warehouses', value: 'ALL' }, ...warehouseOptions];
  }, [warehouseOptions]);

  const columns = useMemo<ColumnDef<TransactionRecord>[]>(() => [
    {
      accessorKey: 'direction',
      header: 'Type',
      cell: ({ row }) => {
        const direction = row.getValue('direction') as string;
        if (direction === 'No Data Found') {
          return <Badge variant="secondary" className="bg-slate-100 text-slate-500 whitespace-nowrap">No Data Found</Badge>;
        }
        return (
          <Badge
            variant={direction === 'INWARD' ? 'success' : 'destructive'}
            className="uppercase tracking-[0.16em] px-3 py-1 text-[11px]"
          >
            {direction}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'date',
      header: 'Date',
      cell: ({ row }) => {
        const date = row.getValue('date') as string;
        if (!date || date === '-') return <span className="text-slate-400">—</span>;
        return new Date(date).toLocaleDateString('en-IN');
      },
    },
    {
      accessorKey: 'clientName',
      header: 'Client',
      cell: ({ row }) => {
        const value = row.getValue('clientName');
        if (typeof value === 'object' || value === undefined || value === null) return <span className="font-semibold">N.A.</span>;
        return <span className="font-semibold">{String(value)}</span>;
      },
    },
    {
      accessorKey: 'commodityName',
      header: 'Commodity',
      cell: ({ row }) => {
        const value = row.getValue('commodityName');
        if (typeof value === 'object' || value === undefined || value === null || value === '-') return <span className="text-slate-400">—</span>;
        return <span className="text-indigo-600 font-medium">{String(value)}</span>;
      },
    },
    {
      accessorKey: 'warehouseName',
      header: 'Warehouse',
      cell: ({ row }) => {
        const value = row.getValue('warehouseName');
        if (typeof value === 'object' || value === undefined || value === null || value === '-') return <span className="text-slate-400">—</span>;
        return <span className="text-slate-700">{String(value)}</span>;
      },
    },
    {
      accessorKey: 'quantityMT',
      header: 'Qty (MT)',
      cell: ({ row }) => {
        const value = row.getValue('quantityMT');
        if (typeof value !== 'number') return <span className="text-slate-400">—</span>;
        return <span className="font-bold">{value.toFixed(2)}</span>;
      },
    },
    {
      accessorKey: 'bagsCount',
      header: 'Bags',
      cell: ({ row }) => {
        const value = row.getValue('bagsCount');
        if (typeof value === 'object' || value === undefined || value === null || value === '-') return <span className="text-slate-400">—</span>;
        return <span>{String(value)}</span>;
      },
    },
    {
      accessorKey: 'gatePass',
      header: 'Gate Pass',
      cell: ({ row }) => {
        const value = row.getValue('gatePass');
        if (typeof value === 'object' || value === undefined || value === null) return <span className="text-slate-600">—</span>;
        return <span className="text-slate-600">{String(value) || '—'}</span>;
      },
    },
    {
      accessorKey: 'stackNo',
      header: 'Stack No',
      cell: ({ row }) => {
        const value = row.getValue('stackNo');
        if (typeof value === 'object' || value === undefined || value === null) return <span>—</span>;
        return <span>{String(value) || '—'}</span>;
      },
    },
    {
      accessorKey: 'lotNo',
      header: 'Lot No',
      cell: ({ row }) => {
        const value = row.getValue('lotNo');
        if (typeof value === 'object' || value === undefined || value === null) return <span>—</span>;
        return <span>{String(value) || '—'}</span>;
      },
    },
    {
      accessorKey: 'createdAt',
      header: 'Created',
      cell: ({ row }) => {
        const createdAt = row.getValue('createdAt');
        if (!createdAt || createdAt === '-') return <span className="text-slate-400">—</span>;
        return new Date(createdAt as string).toLocaleDateString('en-IN');
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        const transaction = row.original as TransactionRecord;
        if (!isAdmin) {
          return null;
        }

        return (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleEditTransaction(transaction)}
            >
              Edit
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => handleDeleteTransaction(transaction)}
            >
              Delete
            </Button>
          </div>
        );
      },
    },
  ], [isAdmin, handleEditTransaction, handleDeleteTransaction]);

  const table = useReactTable({
    data: filteredTransactions,
    columns,
    state: {
      sorting,
      columnVisibility,
      globalFilter,
      pagination,
    },
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const exportToCSV = () => {
    try {
      const exportData = filteredTransactions.map((item) => ({
        'Direction': item.direction,
        'Date': item.date ? new Date(item.date).toLocaleDateString('en-IN') : '-',
        'Client': item.clientName,
        'Commodity': item.commodityName,
        'Warehouse': item.warehouseName,
        'Qty (MT)': item.quantityMT !== null ? item.quantityMT : '-',
        'Bags': item.bagsCount != null ? item.bagsCount : 'N.A.',
        'Gate Pass': item.gatePass || '',
        'Stack No': item.stackNo || '',
        'Lot No': item.lotNo || '',
        'Created': item.createdAt ? new Date(item.createdAt).toLocaleDateString('en-IN') : '-',
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Transactions');

      const maxWidths = exportData.reduce((acc: number[], row) => {
        Object.entries(row).forEach(([key, val], idx) => {
          const length = Math.max(key.length, String(val).length);
          acc[idx] = Math.max(acc[idx] || 0, length);
        });
        return acc;
      }, [] as number[]);
      worksheet['!cols'] = maxWidths.map((w: number) => ({ wch: w + 2 }));

      XLSX.writeFile(workbook, `Transactions_${new Date().toISOString().split('T')[0]}.csv`);
      toast.success('CSV exported successfully');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export CSV');
    }
  };

  if (isLoading) {
    return <div className="text-center py-8 text-slate-500">Loading transactions...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Transactions Report</h2>
          <p className="text-slate-500 font-medium">All inward and outward transactions</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setIsDailyReport(!isDailyReport)}
            variant={isDailyReport ? "default" : "outline"}
            className={`font-bold flex items-center gap-2 ${isDailyReport ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : ''}`}
          >
            Daily Report
          </Button>
          <Button
            onClick={exportToCSV}
            disabled={transactions.length === 0}
            className="font-bold bg-emerald-600 hover:bg-emerald-700 flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-4">
        <div className={`grid gap-4 ${isDailyReport ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Client</label>
            <Select value={clientFilter} onValueChange={setClientFilter} disabled={isLoadingClients}>
              <SelectTrigger className="font-semibold text-slate-700 w-full">
                <SelectValue placeholder="All Clients" />
              </SelectTrigger>
              <SelectContent>
                {clientDropdownOptions.map((client) => (
                  <SelectItem key={client.value} value={client.value} className="font-medium">
                    {getDropdownDisplayName(client, clientDropdownOptions, isAdmin)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Warehouse</label>
            <Select value={warehouseFilter} onValueChange={setWarehouseFilter} disabled={isLoadingWarehouses}>
              <SelectTrigger className="font-semibold text-slate-700 w-full">
                <SelectValue placeholder="All Warehouses" />
              </SelectTrigger>
              <SelectContent>
                {warehouseDropdownOptions.map((warehouse) => (
                  <SelectItem key={warehouse.value} value={warehouse.value} className="font-medium">
                    {warehouse.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isDailyReport ? (
            <>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">From Date</label>
                <Input
                  type="date"
                  value={fromDateFilter}
                  onChange={(e) => setFromDateFilter(e.target.value)}
                  className="w-full text-slate-700 font-semibold"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">To Date</label>
                <Input
                  type="date"
                  value={toDateFilter}
                  onChange={(e) => setToDateFilter(e.target.value)}
                  className="w-full text-slate-700 font-semibold"
                />
              </div>
            </>
          ) : (
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Month</label>
              <Select value={monthFilter} onValueChange={setMonthFilter}>
                <SelectTrigger className="font-semibold text-slate-700 w-full">
                  <SelectValue placeholder="All Months" />
                </SelectTrigger>
                <SelectContent>
                  {monthDropdownOptions.map((month) => (
                    <SelectItem key={month.value} value={month.value} className="font-medium">
                      {month.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Search</label>
            <Input
              placeholder="Search by client, commodity, warehouse..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="w-full"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <p className="text-sm font-bold text-slate-500">
            Showing <span className="text-slate-900">{table.getRowModel().rows.length}</span> of{' '}
            <span className="text-slate-900">{transactions.length}</span> transactions
          </p>
          <div className="flex items-center gap-4">
            <p className="text-xs text-slate-400">
              Page {pagination.pageIndex + 1} of {table.getPageCount()}
            </p>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPagination(prev => ({ ...prev, pageIndex: prev.pageIndex - 1 }))}
                disabled={!table.getCanPreviousPage()}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPagination(prev => ({ ...prev, pageIndex: prev.pageIndex + 1 }))}
                disabled={!table.getCanNextPage()}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="font-bold">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className="hover:bg-slate-50">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="text-sm">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-32 text-center">
                  <p className="text-slate-500">No transactions found</p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
