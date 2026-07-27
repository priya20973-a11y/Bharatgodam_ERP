'use client';

import React, { useState, useMemo } from 'react';
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
import { Download, ChevronLeft, ChevronRight } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'react-hot-toast';

interface TransactionRecord {
  _id: string;
  direction: 'INWARD' | 'OUTWARD';
  date: string;
  clientName: string;
  clientId: string;
  commodityName: string;
  commodityId: string;
  warehouseName: string;
  warehouseId: string;
  quantityKg: number;
  bagsCount?: number;
  chamberNo?: string;
  floorNo?: string;
  stackNo?: string;
  lotNo?: string;
  gatePass?: string;
  status?: string;
  createdAt: string;
}

interface ColdTransactionsReportProps {
  transactions: TransactionRecord[];
  isAdmin?: boolean;
}

export default function ColdTransactionsReport({ transactions, isAdmin = false }: ColdTransactionsReportProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    chamberNo: true,
    floorNo: true,
    stackNo: true,
    lotNo: false,
    bagsCount: true,
    gatePass: false,
  });
  
  const [globalFilter, setGlobalFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('ALL');
  const [warehouseFilter, setWarehouseFilter] = useState('ALL');
  const [monthFilter, setMonthFilter] = useState('ALL');
  
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 20,
  });

  const extractTransactionMonth = (dateValue?: string) => {
    if (!dateValue) return '';
    const parsed = new Date(dateValue);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString().slice(0, 7);
  };

  const filteredTransactions = useMemo(() => {
    return transactions.filter((item) => {
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
  }, [transactions, clientFilter, warehouseFilter, monthFilter]);

  const monthDropdownOptions = useMemo(() => {
    const uniqueMonths = Array.from(
      new Set(transactions.map((item) => extractTransactionMonth(item.date)).filter(Boolean))
    );
    const sortedMonths = uniqueMonths.sort((a, b) => b.localeCompare(a));
    return [{ label: 'All Months', value: 'ALL' }, ...sortedMonths.map((month) => ({
      label: new Date(`${month}-01`).toLocaleString('en-IN', { month: 'short', year: 'numeric' }),
      value: month,
    }))];
  }, [transactions]);

  const clientDropdownOptions = useMemo(() => {
    const uniqueClients = new Map();
    transactions.forEach(t => {
      if (t.clientId && t.clientName) {
        uniqueClients.set(t.clientId, t.clientName);
      }
    });
    const options = Array.from(uniqueClients.entries()).map(([value, label]) => ({ label, value }));
    options.sort((a, b) => a.label.localeCompare(b.label));
    return [{ label: 'All Clients', value: 'ALL' }, ...options];
  }, [transactions]);

  const warehouseDropdownOptions = useMemo(() => {
    const uniqueWarehouses = new Map();
    transactions.forEach(t => {
      if (t.warehouseId && t.warehouseName) {
        uniqueWarehouses.set(t.warehouseId, t.warehouseName);
      }
    });
    const options = Array.from(uniqueWarehouses.entries()).map(([value, label]) => ({ label, value }));
    options.sort((a, b) => a.label.localeCompare(b.label));
    return [{ label: 'All Warehouses', value: 'ALL' }, ...options];
  }, [transactions]);

  const columns = useMemo<ColumnDef<TransactionRecord>[]>(() => [
    {
      accessorKey: 'direction',
      header: 'Type',
      cell: ({ row }) => {
        const direction = row.getValue('direction') as string;
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
        return new Date(date).toLocaleDateString('en-IN');
      },
    },
    {
      accessorKey: 'clientName',
      header: 'Client',
      cell: ({ row }) => {
        const value = row.getValue('clientName');
        return <span className="font-semibold">{String(value || 'N.A.')}</span>;
      },
    },
    {
      accessorKey: 'farmerName',
      header: 'Farmer',
      cell: ({ row }) => {
        const farmerName = row.original.farmerName;
        const farmerId = row.original.farmerId;
        if (!farmerName) return <span className="text-slate-400">—</span>;
        return (
          <span className="font-medium text-slate-700">
            {farmerName} {farmerId ? `- ${farmerId}` : ''}
          </span>
        );
      },
    },
    {
      accessorKey: 'commodityName',
      header: 'Commodity',
      cell: ({ row }) => {
        const value = row.getValue('commodityName');
        return <span className="text-indigo-600 font-medium">{String(value || 'N.A.')}</span>;
      },
    },
    {
      accessorKey: 'warehouseName',
      header: 'Warehouse',
      cell: ({ row }) => {
        const value = row.getValue('warehouseName');
        return <span className="text-slate-700">{String(value || 'N.A.')}</span>;
      },
    },
    {
      accessorKey: 'quantityKg',
      header: 'Qty (Kg)',
      cell: ({ row }) => {
        const value = row.getValue('quantityKg');
        if (typeof value !== 'number') return null;
        return <span className="font-bold">{value.toFixed(2)}</span>;
      },
    },
    {
      accessorKey: 'chamberNo',
      header: 'Chamber',
      cell: ({ row }) => {
        const value = row.getValue('chamberNo');
        return <span>{value ? String(value) : '—'}</span>;
      },
    },
    {
      accessorKey: 'floorNo',
      header: 'Floor',
      cell: ({ row }) => {
        const value = row.getValue('floorNo');
        return <span>{value ? String(value) : '—'}</span>;
      },
    },
    {
      accessorKey: 'stackNo',
      header: 'Stack No',
      cell: ({ row }) => {
        const value = row.getValue('stackNo');
        return <span>{value ? String(value) : '—'}</span>;
      },
    },
    {
      accessorKey: 'bagsCount',
      header: 'Bags',
      cell: ({ row }) => {
        const value = row.getValue('bagsCount');
        return <span>{value ? String(value) : 'N.A.'}</span>;
      },
    },
    {
      accessorKey: 'lotNo',
      header: 'Lot No',
      cell: ({ row }) => {
        const value = row.getValue('lotNo');
        return <span>{value ? String(value) : '—'}</span>;
      },
    },
    {
      accessorKey: 'gatePass',
      header: 'Gate Pass',
      cell: ({ row }) => {
        const value = row.getValue('gatePass');
        return <span className="text-slate-600">{value ? String(value) : '—'}</span>;
      },
    },
    {
      accessorKey: 'createdAt',
      header: 'Created',
      cell: ({ row }) => {
        const createdAt = row.getValue('createdAt');
        if (!createdAt) return null;
        return new Date(createdAt as string).toLocaleDateString('en-IN');
      },
    },
  ], []);

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
        'Date': new Date(item.date).toLocaleDateString('en-IN'),
        'Client': item.clientName,
        'Commodity': item.commodityName,
        'Warehouse': item.warehouseName,
        'Qty (Kg)': item.quantityKg,
        'Chamber No': item.chamberNo || '',
        'Floor No': item.floorNo || '',
        'Stack No': item.stackNo || '',
        'Bags': item.bagsCount != null ? item.bagsCount : 'N.A.',
        'Gate Pass': item.gatePass || '',
        'Lot No': item.lotNo || '',
        'Created': new Date(item.createdAt).toLocaleDateString('en-IN'),
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

      XLSX.writeFile(workbook, `Cold_Transactions_${new Date().toISOString().split('T')[0]}.csv`);
      toast.success('CSV exported successfully');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export CSV');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Cold Transactions Report</h2>
          <p className="text-slate-500 font-medium">All inward and outward transactions</p>
        </div>
        <Button
          onClick={exportToCSV}
          disabled={transactions.length === 0}
          className="font-bold bg-emerald-600 hover:bg-emerald-700 flex items-center gap-2"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Search */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-4">
        <div className="grid gap-4 lg:grid-cols-4">
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Client</label>
            <Select value={clientFilter} onValueChange={setClientFilter}>
              <SelectTrigger className="font-semibold text-slate-700 w-full">
                <SelectValue placeholder="All Clients" />
              </SelectTrigger>
              <SelectContent>
                {clientDropdownOptions.map((client) => (
                  <SelectItem key={client.value} value={client.value} className="font-medium">
                    {client.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Warehouse</label>
            <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
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

          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Search</label>
            <Input
              placeholder="Search by client, commodity..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="w-full font-medium"
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
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => table.nextPage()}
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
