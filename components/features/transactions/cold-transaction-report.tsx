'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Download, Trash2, Edit, Search, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
    if (type === 'OWNERSHIP TRANSFER') {
      toast.error('Cannot delete ownership transfers from this report.');
      return;
    }
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
    const rows = filteredTransactions.map(txn => {
      let typeLabel = txn.type === 'INWARD' ? t('transactions.inward') : t('transactions.outward');
      if (txn.type === 'OWNERSHIP TRANSFER') typeLabel = 'OWNERSHIP TRANSFER';

      let clientLabel = txn.client?.name || '';
      if (txn.type === 'OWNERSHIP TRANSFER') {
        if (txn.transferType === 'Purchase') {
          clientLabel = `${txn.previousClient?.name || ''} -> Warehouse (${txn.warehouse?.name || ''})`;
        } else {
          clientLabel = `${txn.client?.name || ''} (From: ${txn.previousClient?.name || ''})`;
        }
      } else if (txn.client?.clientType === 'PURCHASE') {
        clientLabel = `Warehouse (${txn.client?.name})`;
      }

      return [
        typeLabel,
        txn.date ? format(new Date(txn.date), 'yyyy-MM-dd') : '',
        clientLabel,
        `${txn.commodity?.name || ''} (${txn.commodity?.type || ''})`,
        txn.warehouse?.name || '',
        txn.gradingType === 'Wet' ? 'Wet' : txn.gradingType === 'Grading' ? 'Grading' : '-',
        txn.chamberNo,
        txn.floorNo,
        txn.stackNo,
        formatNumber(txn.quantityKg),
        formatNumber(txn.totalBags ?? ((txn.bagsCount || 0) + (txn.jin || 0) + (txn.mixed || 0)))
      ];
    });
    
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
    const queryType = type === 'OWNERSHIP TRANSFER' ? 'transfer' : type.toLowerCase();
    window.open(`/api/cold/receipt/html?id=${id}&type=${queryType}`, '_blank');
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
                    {txn.type === 'OWNERSHIP TRANSFER' ? (
                      <span className="px-2 py-1 rounded text-xs font-medium bg-cyan-50 text-cyan-700 border border-cyan-200">
                        OWNERSHIP TRANSFER
                      </span>
                    ) : txn.client?.clientType === 'PURCHASE' ? (
                      <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                        Purchase Stock ({txn.type === 'INWARD' ? 'In' : 'Out'})
                      </Badge>
                    ) : (
                      <div className="flex flex-col gap-1 items-start">
                        <Badge variant="outline" className={txn.type === 'INWARD' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}>
                          {txn.type === 'INWARD' ? <ArrowDownToLine className="w-3 h-3 mr-1" /> : <ArrowUpFromLine className="w-3 h-3 mr-1" />}
                          {txn.type === 'INWARD' ? t('transactions.inward') : t('transactions.outward')}
                        </Badge>
                        {(txn.stockType === 'Purchase' || txn.stockType === 'Both') && (
                          <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-[10px] py-0">
                            {txn.stockType === 'Both' ? 'Self + Purchase' : 'Purchase Stock'}
                          </Badge>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-slate-600">
                    {txn.date ? format(new Date(txn.date), 'dd/MM/yyyy') : '-'}
                  </TableCell>
                  <TableCell className="font-medium text-slate-900">
                    {txn.type === 'OWNERSHIP TRANSFER' ? (
                      txn.transferType === 'Purchase' ? (
                        <div>
                          <span>{txn.previousClient?.name || '-'}</span>
                          <div className="text-xs font-normal text-slate-500 mt-0.5">
                            → Warehouse ({txn.warehouse?.name || '-'})
                          </div>
                        </div>
                      ) : (
                        <div>
                          <span>{txn.client?.name || '-'}</span>
                          <div className="text-xs font-normal text-slate-500 mt-0.5">
                            From: {txn.previousClient?.name || '-'}
                          </div>
                        </div>
                      )
                    ) : txn.client?.clientType === 'PURCHASE' ? (
                      <span className="text-purple-700 font-bold">Warehouse ({txn.client?.name})</span>
                    ) : (
                      txn.client?.name || '-'
                    )}
                    {txn.farmerName && <div className="text-xs font-normal text-slate-500 mt-0.5">{t('outward.farmerPrefix')}{txn.farmerName}</div>}
                  </TableCell>
                  <TableCell className="text-slate-700">{txn.commodity?.name} ({txn.commodity?.type})</TableCell>
                  <TableCell className="text-slate-600 text-xs">
                    <div className="space-y-1">
                      <span className="font-semibold text-slate-800">{txn.warehouse?.name}</span>
                      {txn.stackAllocations && txn.stackAllocations.length > 0 ? (
                        txn.stackAllocations.map((s: any, idx: number) => (
                          <Link 
                            key={idx}
                            href={`/cold/floor-mapping?warehouseId=${txn.warehouse?._id}&chamberNo=${s.chamberNo || s.chamberName}&floorNo=${s.floorNo}&stackNo=${s.stackNo}`}
                            className="hover:text-blue-600 hover:underline transition-colors block text-[11px]"
                          >
                            C{String(s.chamberName || s.chamberNo).replace(/^Chamber\s+/i, '')}.F{s.floorName || s.floorNo}.S{s.stackNo}
                            {s.allocatedWeight ? ` (${s.allocatedWeight} KG${s.bagsCount ? `, ${s.bagsCount} bags` : ''})` : ''}
                          </Link>
                        ))
                      ) : (
                        <Link 
                          href={`/cold/floor-mapping?warehouseId=${txn.warehouse?._id}&chamberNo=${txn.chamberNo}&floorNo=${txn.floorNo}&stackNo=${txn.stackNo}`}
                          className="hover:text-blue-600 hover:underline transition-colors block text-[11px]"
                        >
                          C{txn.chamberNo}.F{txn.floorNo}.S{txn.stackNo}
                        </Link>
                      )}
                    </div>
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
                    {txn.type !== 'OWNERSHIP TRANSFER' && (
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
                    )}
                    {txn.type !== 'OWNERSHIP TRANSFER' && (
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="text-rose-500 hover:bg-rose-50"
                        onClick={() => handleDelete(txn._id, txn.type)}
                        title={t('transactions.delete')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
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
