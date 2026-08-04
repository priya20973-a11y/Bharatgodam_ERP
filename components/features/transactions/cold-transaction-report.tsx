'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Download, Trash2, Edit, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from 'react-hot-toast';
import { deleteColdTransaction } from '@/app/actions/cold-transaction-report-actions';
import { useColdTranslation } from '@/components/providers/cold-language-provider';
import ColdEditTransactionModal from './cold-edit-transaction-modal';

interface ColdTransactionReportProps {
  initialTransactions: any[];
}

export default function ColdTransactionReport({ initialTransactions }: ColdTransactionReportProps) {
  const { t, formatNumber } = useColdTranslation();
  const [transactions, setTransactions] = useState(initialTransactions);
  const [search, setSearch] = useState('');
  const [clientFilter, setClientFilter] = useState('ALL');
  const [warehouseFilter, setWarehouseFilter] = useState('ALL');
  const [monthFilter, setMonthFilter] = useState('ALL');

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingTxnId, setEditingTxnId] = useState('');
  const [editingTxnType, setEditingTxnType] = useState<'INWARD' | 'OUTWARD'>('INWARD');

  // Extract unique filters
  const clients = useMemo(() => Array.from(new Set(initialTransactions.map(txn => txn.client?.name).filter(Boolean))), [initialTransactions]);
  const warehouses = useMemo(() => Array.from(new Set(initialTransactions.map(txn => txn.warehouse?.name).filter(Boolean))), [initialTransactions]);
  const months = useMemo(() => Array.from(new Set(initialTransactions.map(txn => txn.date ? txn.date.substring(0, 7) : null).filter(Boolean))).sort().reverse(), [initialTransactions]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(txn => {
      if (clientFilter !== 'ALL' && txn.client?.name !== clientFilter) return false;
      if (warehouseFilter !== 'ALL' && txn.warehouse?.name !== warehouseFilter) return false;
      if (monthFilter !== 'ALL' && (!txn.date || !txn.date.startsWith(monthFilter))) return false;
      
      if (search) {
        const query = search.toLowerCase();
        const clientMatch = txn.client?.name?.toLowerCase().includes(query);
        const commMatch = txn.commodity?.name?.toLowerCase().includes(query);
        const typeMatch = txn.type?.toLowerCase().includes(query);
        if (!clientMatch && !commMatch && !typeMatch) return false;
      }
      return true;
    });
  }, [transactions, clientFilter, warehouseFilter, monthFilter, search]);

  const handleDelete = async (id: string, type: string) => {
    if (!confirm(t('transactions.deleteConfirm'))) return;

    try {
      const res = await deleteColdTransaction(id, type as 'INWARD' | 'OUTWARD');
      if (res.success) {
        toast.success(t('transactions.deleteSuccess'));
        setTransactions(prev => prev.filter(txn => txn._id !== id));
      } else {
        toast.error(res.error || t('transactions.deleteFailed'));
      }
    } catch (err: any) {
      toast.error(t('transactions.unexpectedError'));
    }
  };

  const exportCSV = () => {
    const headers = [
      t('transactions.typeHeader'), 
      t('transactions.dateHeader'), 
      t('transactions.clientHeader'), 
      t('transactions.commodityHeader'), 
      t('transactions.locationHeader'), 
      'Grade',
      t('inward.chamberHeader'), 
      t('inward.floorHeader'), 
      t('inward.stackHeader'), 
      t('transactions.qtyHeader'), 
      t('transactions.bagsHeader')
    ];
    const rows = filteredTransactions.map(txn => [
      txn.type === 'INWARD' ? t('transactions.inward') : t('transactions.outward'),
      txn.date ? format(new Date(txn.date), 'yyyy-MM-dd') : '',
      txn.client?.name || '',
      `${txn.commodity?.name || ''} (${txn.commodity?.type || ''})`,
      txn.warehouse?.name || '',
      txn.gradingType === 'Wet' ? 'Wet' : txn.gradingType === 'Grading' ? 'Grading' : '-',
      formatNumber(txn.chamberNo),
      formatNumber(txn.floorNo),
      formatNumber(txn.stackNo),
      formatNumber(txn.quantityKg),
      formatNumber(txn.totalBags ?? ((txn.bagsCount || 0) + (txn.jin || 0) + (txn.mixed || 0)))
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `cold_transactions_${format(new Date(), 'yyyyMMdd')}.csv`;
    link.click();
  };

  const downloadInvoice = (id: string, type: string) => {
    window.open(`/api/cold/receipt/html?id=${id}&type=${type.toLowerCase()}`, '_blank');
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
          <Input
            placeholder={t('transactions.searchTransactions')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        
        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger><SelectValue placeholder={t('transactions.allClients')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('transactions.allClients')}</SelectItem>
            {clients.map((c: any) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
          <SelectTrigger><SelectValue placeholder={t('transactions.allWarehouses')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('transactions.allWarehouses')}</SelectItem>
            {warehouses.map((w: any) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={monthFilter} onValueChange={setMonthFilter}>
          <SelectTrigger><SelectValue placeholder={t('transactions.allMonths')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('transactions.allMonths')}</SelectItem>
            {months.map((m: any) => <SelectItem key={m} value={m}>{format(new Date(`${m}-01`), 'MMM yyyy')}</SelectItem>)}
          </SelectContent>
        </Select>

        <Button variant="outline" onClick={exportCSV} className="w-full">
          <Download className="mr-2 h-4 w-4" /> {t('transactions.exportCsv')}
        </Button>
      </div>

      <div className="rounded-md border bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="font-semibold">{t('transactions.typeHeader')}</TableHead>
              <TableHead className="font-semibold">{t('transactions.dateHeader')}</TableHead>
              <TableHead className="font-semibold">{t('transactions.clientHeader')}</TableHead>
              <TableHead className="font-semibold">{t('transactions.commodityHeader')}</TableHead>
              <TableHead className="font-semibold">{t('transactions.locationHeader')}</TableHead>
              <TableHead className="font-semibold">{t('inward.grade')}</TableHead>
              <TableHead className="text-right font-semibold">{t('transactions.qtyHeader')} (KG)</TableHead>
              <TableHead className="text-right font-semibold">Units</TableHead>
              <TableHead className="text-right font-semibold">{t('transactions.actionsHeader')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTransactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-slate-500">
                  {t('transactions.noTransactions')}
                </TableCell>
              </TableRow>
            ) : (
              filteredTransactions.map((txn) => (
                <TableRow key={txn._id} className="hover:bg-slate-50/50 transition-colors">
                  <TableCell>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      txn.type === 'INWARD' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                    }`}>
                      {txn.type === 'INWARD' ? t('transactions.inward') : t('transactions.outward')}
                    </span>
                  </TableCell>
                  <TableCell className="text-slate-600">
                    {txn.date ? format(new Date(txn.date), 'dd/MM/yyyy') : '-'}
                  </TableCell>
                  <TableCell className="font-medium text-slate-900">
                    {txn.client?.name || '-'}
                    {txn.farmerName && <div className="text-xs font-normal text-slate-500 mt-0.5">{t('outward.farmerPrefix')}{txn.farmerName}</div>}
                  </TableCell>
                  <TableCell className="text-slate-700">{txn.commodity?.name} ({txn.commodity?.type})</TableCell>
                  <TableCell className="text-slate-600 text-xs">
                    <Link 
                      href={`/cold/floor-mapping?warehouseId=${txn.warehouse?._id}&chamberNo=${txn.chamberNo}&floorNo=${txn.floorNo}&stackNo=${txn.stackNo}`}
                      className="hover:text-blue-600 hover:underline transition-colors block"
                    >
                      {txn.warehouse?.name}<br/>
                      C{formatNumber(txn.chamberNo)} • F{formatNumber(txn.floorNo)} • S{formatNumber(txn.stackNo)}
                    </Link>
                  </TableCell>
                  <TableCell className="text-slate-700 text-sm">
                    {txn.gradingType === 'Wet' ? 'Wet' : txn.gradingType === 'Grading' ? 'Grading' : '-'}
                  </TableCell>
                  <TableCell className="text-right font-medium text-slate-900">{formatNumber(txn.quantityKg)}</TableCell>
                  <TableCell className="text-right text-slate-700">{formatNumber(txn.totalBags ?? ((txn.bagsCount || 0) + (txn.jin || 0) + (txn.mixed || 0)))} {txn.commodity?.unit ? txn.commodity.unit : ''}</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className="text-blue-600 hover:bg-blue-50"
                      onClick={() => downloadInvoice(txn._id, txn.type)}
                      title={t('transactions.downloadInvoice')}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className="text-slate-400 hover:text-slate-600"
                      onClick={() => {
                        setEditingTxnId(txn._id);
                        setEditingTxnType(txn.type as 'INWARD' | 'OUTWARD');
                        setEditModalOpen(true);
                      }}
                      title={t('transactions.edit')}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className="text-rose-500 hover:bg-rose-50"
                      onClick={() => handleDelete(txn._id, txn.type)}
                      title={t('transactions.delete')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {editModalOpen && (
        <ColdEditTransactionModal
          isOpen={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          transactionId={editingTxnId}
          transactionType={editingTxnType}
          onSuccess={() => {
            // Because initialTransactions comes from server component wrapper, 
            // the simplest way to refresh is full page reload or trigger a router refresh.
            // Since we're in a client component, we can use window.location.reload()
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
