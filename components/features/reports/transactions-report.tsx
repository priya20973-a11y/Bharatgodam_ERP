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
import { getClientOptions, getWarehouseOptions, logTransactionsExportCSV } from '@/app/actions/reports';
import { Download, ChevronLeft, ChevronRight, ArrowUpDown, Edit, Truck, ShieldCheck } from 'lucide-react';
import { toast } from 'react-hot-toast';
import TransactionEditModal from './transaction-edit-modal';


import { getDropdownDisplayName } from '@/lib/utils';
import { useRouter } from 'next/navigation';

export interface TransactionRecord {
  _id: string;
  sourceType?: string;
  sourceId?: string;
  direction: 'INWARD' | 'OUTWARD' | 'No Data Found';
  date: string;
  clientName: string;
  clientId: string;
  clientIdentifier?: string;
  commodityName: string;
  commodityId: string;
  warehouseName: string;
  warehouseId: string;
  quantityMT: number;
  actualWeight?: number;
  netWeightLoss?: number;
  rentTotal?: number;
  bagsCount?: number;
  bags?: number | string;
  gatePass?: string;
  partyName?: string;
  stackNo?: string;
  lotNo?: string;
  status?: string;
  createdAt: string;
  vehicleNumber?: string;
  transportationName?: string;
  driverName?: string;
  note?: string;
  notes?: string;
  receiptNumber?: string;
  variety?: string;
  packagingMaterial?: string;
  packagingSize?: string;
  gslNo?: string;
}

interface TransactionsReportProps {
  transactions: TransactionRecord[];
  isAdmin?: boolean;
  canEdit?: boolean;
  isLoading?: boolean;
  wspName?: string;
}

export const parseTransactionTimestamp = (dateVal: any): number => {
  if (!dateVal) return 0;
  if (dateVal instanceof Date) {
    const t = dateVal.getTime();
    return Number.isNaN(t) ? 0 : t;
  }
  const str = String(dateVal).trim();
  if (!str || str === '-') return 0;

  const parsed = new Date(str).getTime();
  if (!Number.isNaN(parsed)) return parsed;

  const parts = str.split(/[-/]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      const dt = new Date(y, m, d).getTime();
      if (!Number.isNaN(dt)) return dt;
    } else if (parts[2].length === 4) {
      const d = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const y = parseInt(parts[2], 10);
      const dt = new Date(y, m, d).getTime();
      if (!Number.isNaN(dt)) return dt;
    }
  }

  return 0;
};

export const sortTransactionsDesc = (txns: TransactionRecord[]): TransactionRecord[] => {
  return [...txns].sort((a, b) => {
    const timeA = parseTransactionTimestamp(a.date) || parseTransactionTimestamp(a.createdAt);
    const timeB = parseTransactionTimestamp(b.date) || parseTransactionTimestamp(b.createdAt);
    if (timeB !== timeA) {
      return timeB - timeA;
    }
    const createA = parseTransactionTimestamp(a.createdAt);
    const createB = parseTransactionTimestamp(b.createdAt);
    if (createB !== createA) {
      return createB - createA;
    }
    return String(b._id || '').localeCompare(String(a._id || ''));
  });
};

export default function TransactionsReport({
  transactions,
  isAdmin = false,
  canEdit = false,
  isLoading = false,
  wspName = '',
}: TransactionsReportProps) {
  const router = useRouter();
  const hasEditPermission = isAdmin || canEdit;
  const [editingTransaction, setEditingTransaction] = useState<TransactionRecord | null>(null);
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'date', desc: true },
  ]);
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
  const [liveTransactions, setLiveTransactions] = useState<TransactionRecord[]>(() => sortTransactionsDesc(transactions));
  const [isDailyReport, setIsDailyReport] = useState(false);
  const [reportType, setReportType] = useState<'transaction' | 'statement'>('transaction');
  const [fromDateFilter, setFromDateFilter] = useState(() => new Date().toISOString().split('T')[0]);
  const [toDateFilter, setToDateFilter] = useState(() => new Date().toISOString().split('T')[0]);

  useEffect(() => {
    setLiveTransactions(sortTransactionsDesc(transactions));
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

  const handleEditTransaction = (transaction: TransactionRecord) => {
    setEditingTransaction(transaction);
  };

  const handleSaveSuccess = (updatedRecord: TransactionRecord) => {
    setLiveTransactions((current) => {
      const updatedList = current.map((item) =>
        item._id === updatedRecord._id
          ? { ...item, ...updatedRecord }
          : item
      );
      return sortTransactionsDesc(updatedList);
    });
    router.refresh();
  };

  const handleDownloadReceipt = async (transaction: TransactionRecord) => {
    try {
      if (transaction.direction === 'INWARD') {
        window.open(`/api/receipt/html?id=${transaction._id}`, '_blank');
      } else {
        // Fallback or outward if applicable, though typically only Inward has receipt here
        toast.error('Dynamic receipt generation is supported for Inwards only.');
      }
    } catch (error) {
       console.error(error);
       toast.error('Failed to open receipt');
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
      
      const filteredDaily = combinedDaily.filter((item) => {
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

      return sortTransactionsDesc(filteredDaily);
    }

    const filteredStandard = liveTransactions.filter((item) => {
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

    return sortTransactionsDesc(filteredStandard);
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

  const statementData = useMemo(() => {
    if (reportType !== 'statement') return null;

    let maxDateStr = '9999-12-31';
    if (isDailyReport) {
      maxDateStr = toDateFilter;
    } else if (monthFilter !== 'ALL') {
      const year = parseInt(monthFilter.split('-')[0]);
      const month = parseInt(monthFilter.split('-')[1]);
      const lastDay = new Date(year, month, 0).getDate();
      maxDateStr = `${monthFilter}-${lastDay}`;
    }

    const relevantTransactions = liveTransactions.filter((item) => {
      const itemDate = item.date ? new Date(item.date).toISOString().split('T')[0] : '';
      return itemDate <= maxDateStr;
    }).filter(item => {
      const matchesClient = clientFilter === 'ALL' || item.clientId === clientFilter || item.clientName === clientFilter;
      const matchesWarehouse = warehouseFilter === 'ALL' || item.warehouseId === warehouseFilter || item.warehouseName === warehouseFilter;
      
      if (globalFilter) {
        const lowerSearch = globalFilter.toLowerCase();
        const matchesGlobal = (item.clientName || '').toLowerCase().includes(lowerSearch) ||
                              (item.commodityName || '').toLowerCase().includes(lowerSearch) ||
                              (item.warehouseName || '').toLowerCase().includes(lowerSearch);
        if (!matchesGlobal) return false;
      }
      return matchesClient && matchesWarehouse;
    });

    const commoditiesMap = new Map<string, Map<string, number>>();
    const allClientsSet = new Set<string>();

    relevantTransactions.forEach(item => {
      if (!item.commodityName || !item.clientName || item.direction === 'No Data Found') return;
      const commodity = item.commodityName;
      const client = item.clientName;
      
      if (!commoditiesMap.has(commodity)) {
        commoditiesMap.set(commodity, new Map());
      }
      
      const clientMap = commoditiesMap.get(commodity)!;
      const currentQty = clientMap.get(client) || 0;
      
      allClientsSet.add(client);
      
      if (item.direction === 'INWARD') {
        clientMap.set(client, currentQty + (item.quantityMT || 0));
      } else if (item.direction === 'OUTWARD') {
        clientMap.set(client, currentQty - (item.quantityMT || 0));
      }
    });

    const clientsList = Array.from(allClientsSet).sort();
    const rows = Array.from(commoditiesMap.entries()).map(([commodity, clientMap]) => {
      let rowTotal = 0;
      const clientData: Record<string, number> = {};
      clientsList.forEach(c => {
        const qty = clientMap.get(c) || 0;
        clientData[c] = qty;
        rowTotal += qty;
      });
      return { commodity, clientData, rowTotal };
    }).sort((a, b) => a.commodity.localeCompare(b.commodity));

    const colTotals: Record<string, number> = {};
    let grandTotal = 0;
    clientsList.forEach(c => {
      const totalForClient = rows.reduce((sum, r) => sum + r.clientData[c], 0);
      colTotals[c] = totalForClient;
      grandTotal += totalForClient;
    });

    return { clientsList, rows, colTotals, grandTotal };
  }, [liveTransactions, reportType, isDailyReport, toDateFilter, monthFilter, clientFilter, warehouseFilter, globalFilter]);

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
      header: ({ column }) => {
        return (
          <button
            type="button"
            className="flex items-center gap-1 font-bold text-slate-700 hover:text-indigo-600 transition-colors"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Date
            <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
          </button>
        );
      },
      sortingFn: (rowA, rowB, columnId) => {
        const timeA = parseTransactionTimestamp(rowA.getValue(columnId)) || parseTransactionTimestamp(rowA.original.createdAt);
        const timeB = parseTransactionTimestamp(rowB.getValue(columnId)) || parseTransactionTimestamp(rowB.original.createdAt);
        if (timeA !== timeB) return timeA - timeB;
        const createA = parseTransactionTimestamp(rowA.original.createdAt);
        const createB = parseTransactionTimestamp(rowB.original.createdAt);
        if (createA !== createB) return createA - createB;
        return String(rowA.original._id || '').localeCompare(String(rowB.original._id || ''));
      },
      cell: ({ row }) => {
        const date = row.getValue('date') as string;
        if (!date || date === '-') return <span className="text-slate-400">—</span>;
        const parsed = new Date(date);
        return !Number.isNaN(parsed.getTime()) ? parsed.toLocaleDateString('en-IN') : date;
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
      header: 'Inward Qty (MT)',
      cell: ({ row }) => {
        const value = row.getValue('quantityMT');
        if (typeof value !== 'number') return <span className="text-slate-400">—</span>;
        return <span className="font-bold">{value.toFixed(2)}</span>;
      },
    },
    {
      accessorKey: 'actualWeight',
      header: 'Actual Wt (MT)',
      cell: ({ row }) => {
        const direction = row.getValue('direction') as string;
        if (direction !== 'OUTWARD') return <span className="text-slate-300">—</span>;
        
        const value = row.getValue('actualWeight');
        if (typeof value !== 'number') return <span className="text-slate-400">—</span>;
        return <span className="font-medium text-slate-700">{value.toFixed(2)}</span>;
      },
    },
    {
      accessorKey: 'netWeightLoss',
      header: 'Net Loss (MT)',
      cell: ({ row }) => {
        const direction = row.getValue('direction') as string;
        if (direction !== 'OUTWARD') return <span className="text-slate-300">—</span>;
        
        const value = row.getValue('netWeightLoss');
        if (typeof value !== 'number') return <span className="text-slate-400">—</span>;
        return <span className="font-medium text-red-600">{value.toFixed(2)}</span>;
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
      accessorKey: 'packagingMaterial',
      header: 'Pkg Material',
      cell: ({ row }) => {
        const value = row.getValue('packagingMaterial');
        if (typeof value === 'object' || value === undefined || value === null || value === '') return <span className="text-slate-400">—</span>;
        return <span>{String(value)}</span>;
      },
    },
    {
      accessorKey: 'packagingSize',
      header: 'Pkg Size',
      cell: ({ row }) => {
        const value = row.getValue('packagingSize');
        if (typeof value === 'object' || value === undefined || value === null || value === '') return <span className="text-slate-400">—</span>;
        return <span>{String(value)}</span>;
      },
    },
    {
      accessorKey: 'gslNo',
      header: 'GSL No.',
      cell: ({ row }) => {
        const value = row.getValue('gslNo');
        if (typeof value === 'object' || value === undefined || value === null || value === '') return <span className="text-slate-400">—</span>;
        return <span>{String(value)}</span>;
      },
    },
    {
      accessorKey: 'vehicleNumber',
      header: 'Vehicle No.',
      cell: ({ row }) => {
        const value = row.getValue('vehicleNumber');
        if (typeof value === 'object' || value === undefined || value === null || value === '') return <span className="text-slate-400">—</span>;
        return <span>{String(value)}</span>;
      },
    },
    {
      accessorKey: 'transportationName',
      header: 'Transport',
      cell: ({ row }) => {
        const value = row.getValue('transportationName');
        if (typeof value === 'object' || value === undefined || value === null || value === '') return <span className="text-slate-400">—</span>;
        return <span>{String(value)}</span>;
      },
    },
    {
      accessorKey: 'driverName',
      header: 'Driver Details',
      cell: ({ row }) => {
        const value = row.getValue('driverName');
        if (typeof value === 'object' || value === undefined || value === null || value === '') return <span className="text-slate-400">—</span>;
        return <span>{String(value)}</span>;
      },
    },
    {
      accessorKey: 'note',
      header: 'Note',
      cell: ({ row }) => {
        const value = row.getValue('note') || (row.original as any).notes;
        if (typeof value === 'object' || value === undefined || value === null || value === '') return <span className="text-slate-400">—</span>;
        return <span>{String(value)}</span>;
      },
    },
    {
      accessorKey: 'partyName',
      header: 'Party Name',
      cell: ({ row }) => {
        const value = row.getValue('partyName');
        if (typeof value === 'object' || value === undefined || value === null || value === '') return <span className="text-slate-400">—</span>;
        return <span>{String(value)}</span>;
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

        return (
          <div className="flex flex-wrap gap-2">
            {transaction.direction === 'INWARD' && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-indigo-700 border-indigo-200 hover:bg-indigo-50 h-8 text-xs font-semibold"
                  onClick={() => window.open(`/api/dry-storage/receipts/daily-report?id=${transaction.sourceId || transaction._id}`, '_blank')}
                  title="Daily Truck Transaction Report"
                >
                  <Truck className="w-3.5 h-3.5 mr-1 text-indigo-600" /> Daily Report
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-slate-800 border-slate-300 hover:bg-slate-100 h-8 text-xs font-semibold"
                  onClick={() => window.open(`/api/dry-storage/receipts/gate-pass?id=${transaction.sourceId || transaction._id}`, '_blank')}
                  title="Gate Pass"
                >
                  <ShieldCheck className="w-3.5 h-3.5 mr-1 text-slate-700" /> Gate Pass
                </Button>
              </>
            )}
            {transaction.direction === 'INWARD' && transaction.receiptNumber && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => handleDownloadReceipt(transaction)}
                title="Open Storage Receipt"
              >
                <Download className="w-3.5 h-3.5 mr-1" /> Storage Receipt
              </Button>
            )}
            {hasEditPermission && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleEditTransaction(transaction)}
                className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 border-indigo-200 flex items-center gap-1"
                title="Edit Transaction"
              >
                <Edit className="w-3.5 h-3.5" />
                Edit
              </Button>
            )}
            {isAdmin && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleDeleteTransaction(transaction)}
              >
                Delete
              </Button>
            )}
          </div>
        );
      },
    },
  ], [isAdmin, hasEditPermission, handleEditTransaction, handleDeleteTransaction]);

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

  const exportToCSV = async () => {
    try {
      const XLSX = await import('xlsx');
      if (reportType === 'statement' && statementData) {

        const exportData = statementData.rows.map(row => {
          const rowData: Record<string, any> = { 'Commodity': row.commodity };
          statementData.clientsList.forEach(c => {
            rowData[c] = Number(row.clientData[c].toFixed(2));
          });
          rowData['Total'] = Number(row.rowTotal.toFixed(2));
          return rowData;
        });

        const totalsRow: Record<string, any> = { 'Commodity': 'Total' };
        statementData.clientsList.forEach(c => {
          totalsRow[c] = Number(statementData.colTotals[c].toFixed(2));
        });
        totalsRow['Total'] = Number(statementData.grandTotal.toFixed(2));
        exportData.push(totalsRow);

        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Statement');
        
        const maxWidths = exportData.reduce((acc: number[], row) => {
          Object.entries(row).forEach(([key, val], idx) => {
            const length = Math.max(key.length, String(val).length);
            acc[idx] = Math.max(acc[idx] || 0, length);
          });
          return acc;
        }, [] as number[]);
        worksheet['!cols'] = maxWidths.map((w: number) => ({ wch: w + 2 }));

        XLSX.writeFile(workbook, `Statement_${new Date().toISOString().split('T')[0]}.csv`);
        toast.success('CSV exported successfully');
        await logTransactionsExportCSV();
        return;
      }
      const exportData = filteredTransactions.map((item) => ({
        'Direction': item.direction,
        'Date': item.date ? new Date(item.date).toLocaleDateString('en-IN') : '-',
        'Client': item.clientName,
        'Commodity': item.commodityName,
        'Warehouse': item.warehouseName,
        'Inward Qty (MT)': item.quantityMT !== null ? item.quantityMT : '-',
        'Actual Wt (MT)': item.direction === 'OUTWARD' && item.actualWeight != null ? item.actualWeight : '-',
        'Net Loss (MT)': item.direction === 'OUTWARD' && item.netWeightLoss != null ? item.netWeightLoss : '-',
        'Bags': item.bagsCount != null ? item.bagsCount : 'N.A.',
        'Packaging Material': item.packagingMaterial || '',
        'Packaging Size': item.packagingSize || '',
        'GSL No': item.gslNo || '',
        'Gate Pass': item.gatePass || '',
        'Vehicle Number': item.vehicleNumber || '',
        'Transportation': item.transportationName || '',
        'Driver Name': item.driverName || '',
        'Note': item.notes || item.note || '',
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
      await logTransactionsExportCSV();
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
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              onClick={() => setReportType('transaction')}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${reportType === 'transaction' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Transaction View
            </button>
            <button
              onClick={() => setReportType('statement')}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${reportType === 'statement' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Statement View
            </button>
          </div>
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

      {reportType === 'statement' && statementData ? (
        <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto print:overflow-visible">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 print:hidden">
            <p className="text-sm font-bold text-slate-500">
              Daily Statement as of <span className="text-slate-900">{isDailyReport ? toDateFilter : (monthFilter !== 'ALL' ? monthFilter : 'All Time')}</span>
            </p>
            <Button
              onClick={() => window.print()}
              variant="outline"
              size="sm"
              className="font-bold flex items-center gap-2"
            >
              Print / PDF
            </Button>
          </div>
          
          <div className="print:block" id="print-area">
            <style dangerouslySetInnerHTML={{ __html: `
              @media print {
                body * { visibility: hidden; }
                #print-area, #print-area * { visibility: visible; }
                #print-area { position: absolute; left: 0; top: 0; width: 100%; }
                @page { size: landscape; margin: 10mm; }
              }
            `}} />
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 font-bold text-slate-700">Commodity</th>
                  {statementData.clientsList.map(client => (
                    <th key={client} className="px-4 py-3 font-bold text-slate-700 text-right">{client}</th>
                  ))}
                  <th className="px-4 py-3 font-black text-indigo-700 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {statementData.rows.length > 0 ? statementData.rows.map(row => (
                  <tr key={row.commodity} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{row.commodity}</td>
                    {statementData.clientsList.map(client => (
                      <td key={client} className="px-4 py-3 text-right text-slate-600">
                        {row.clientData[client] ? row.clientData[client].toFixed(2) : '-'}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-right font-bold text-indigo-700">{row.rowTotal.toFixed(2)}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={statementData.clientsList.length + 2} className="px-4 py-8 text-center text-slate-500">
                      No stock data found for selected filters
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                <tr>
                  <td className="px-4 py-3 font-black text-slate-900">Total</td>
                  {statementData.clientsList.map(client => (
                    <td key={client} className="px-4 py-3 text-right font-black text-slate-900">
                      {statementData.colTotals[client] ? statementData.colTotals[client].toFixed(2) : '-'}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right font-black text-indigo-700">{statementData.grandTotal.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : (
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
      )}

      {/* Transaction Edit Modal */}
      <TransactionEditModal
        isOpen={!!editingTransaction}
        transaction={editingTransaction}
        onClose={() => setEditingTransaction(null)}
        onSaveSuccess={handleSaveSuccess}
      />
    </div>
  );
}
