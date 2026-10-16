'use client';

import { useState, useEffect, useMemo } from 'react';
import { getColdClientLedger } from '@/app/actions/cold-ledger-actions';
import { getClients } from '@/app/actions/client-actions';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useColdTranslation } from '@/components/providers/cold-language-provider';
import { ArrowDownToLine, ArrowUpFromLine, Calendar, X, ArrowLeft } from 'lucide-react';

interface ColdClientLedgerProps {
  clientId: string;
  clientName: string;
  clients?: any[];
  onSelectClient?: (client: any) => void;
  onBack?: () => void;
}

export function ColdClientLedger({ 
  clientId, 
  clientName, 
  clients = [], 
  onSelectClient,
  onBack 
}: ColdClientLedgerProps) {
  const { t, formatNumber } = useColdTranslation();
  const [activeClientId, setActiveClientId] = useState(clientId);
  const [activeClientName, setActiveClientName] = useState(clientName);
  const [allClients, setAllClients] = useState<any[]>(clients);
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<any[]>([]);

  // Date filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Sync props when changed from parent
  useEffect(() => {
    setActiveClientId(clientId);
    setActiveClientName(clientName);
  }, [clientId, clientName]);

  // Load clients if not passed
  useEffect(() => {
    if (clients && clients.length > 0) {
      setAllClients(clients);
    } else {
      getClients().then(setAllClients).catch(console.error);
    }
  }, [clients]);

  // Load transactions when active client changes
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const data = await getColdClientLedger(activeClientId);
        setTransactions(data);
      } catch (err) {
        console.error('Failed to load ledger', err);
      } finally {
        setLoading(false);
      }
    }
    if (activeClientId) loadData();
  }, [activeClientId]);

  const clientOptions = useMemo(() => {
    return allClients.map((c: any) => ({
      value: c._id,
      label: `${c.name}${c.type ? ` (${c.type})` : ''}${c.mobile ? ` - ${c.mobile}` : ''}`
    }));
  }, [allClients]);

  const handleClientChange = (newClientId: string) => {
    const selected = allClients.find((c: any) => c._id === newClientId);
    if (selected) {
      setActiveClientId(selected._id);
      setActiveClientName(selected.name);
      onSelectClient?.(selected);
    }
  };

  const cleanFormatNum = (num: any) => {
    const n = Number(num || 0);
    const rounded = Math.round(n * 100) / 100;
    return formatNumber(Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(2));
  };

  // Process transactions with date filtering and calculate running balances
  const processedData = useMemo(() => {
    let openingBal = 0;
    let openingBagsCount = 0;
    let totalIn = 0;
    let totalOut = 0;
    let runBal = 0;
    let runBags = 0;

    const startMs = startDate ? new Date(startDate).setHours(0, 0, 0, 0) : null;
    const endMs = endDate ? new Date(endDate).setHours(23, 59, 59, 999) : null;

    const visibleTx: any[] = [];

    for (const tx of transactions) {
      let inQty = 0;
      let outQty = 0;
      const displayBags = Number(tx.totalBags || tx.bagsCount || 0);

      if (tx.type === 'C/o ENTRY') {
        // C/o is display/reference only. Do NOT affect balances.
        inQty = Number(tx.quantityKg ?? tx.selfQuantityKg ?? 0);
      } else if (tx.type === 'INWARD' || tx.type === 'TRANSFER IN') {
        if (tx.isPurchaseStock) {
          const pQty = Number((tx.stockType === 'Both' ? (tx.purchaseQuantityKg ?? 0) : (tx.purchaseQuantityKg ?? tx.quantityKg ?? 0)) ?? 0);
          const pBags = Number((tx.stockType === 'Both' ? (tx.purchaseBagsCount ?? 0) : (tx.purchaseBagsCount ?? tx.totalBags ?? tx.bagsCount ?? 0)) ?? 0);
          inQty = pQty;
          runBal += pQty;
          runBags += pBags;
        } else {
          if (tx.stockType === 'Purchase') {
            inQty = Number(tx.quantityKg ?? tx.purchaseQuantityKg ?? 0);
          } else if (tx.stockType === 'Both') {
            inQty = Number(tx.quantityKg ?? 0);
            const selfQty = Number(tx.selfQuantityKg ?? 0);
            const selfBags = Number(tx.selfBagsCount ?? 0);
            runBal += selfQty;
            runBags += selfBags;
          } else {
            inQty = Number(tx.quantityKg ?? tx.selfQuantityKg ?? 0);
            runBal += inQty;
            runBags += displayBags;
          }
        }
      } else {
        const oQty = Number(tx.quantityKg || 0);
        outQty = oQty;
        runBal -= oQty;
        runBags -= displayBags;
      }

      const txDateMs = new Date(tx.date).getTime();

      // If before startDate, it contributes to opening balance
      if (startMs !== null && txDateMs < startMs) {
        openingBal = runBal;
        openingBagsCount = runBags;
        continue;
      }

      // If after endDate, exclude from visible range
      if (endMs !== null && txDateMs > endMs) {
        continue;
      }

      // Inside date window
      if (tx.type === 'INWARD' || tx.type === 'TRANSFER IN') {
        totalIn += inQty;
      } else if (tx.type !== 'C/o ENTRY') {
        totalOut += outQty;
      }

      visibleTx.push({
        ...tx,
        inQty,
        outQty,
        displayBags,
        currentBal: runBal,
        currentBags: runBags,
      });
    }

    return {
      hasDateFilter: startMs !== null || endMs !== null,
      openingBalance: openingBal,
      openingBags: openingBagsCount,
      visibleTransactions: visibleTx,
      closingBalance: runBal,
      closingBags: runBags,
      totalInwardQty: totalIn,
      totalOutwardQty: totalOut,
    };
  }, [transactions, startDate, endDate]);

  return (
    <div className="space-y-6">
      {/* Top Controls: Searchable Client Filter & Date Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1">
          {onBack && (
            <Button variant="outline" size="sm" onClick={onBack} className="self-start sm:self-auto shrink-0">
              <ArrowLeft className="mr-2 h-4 w-4" /> {t('ledger.backToDirectory') || 'Back to Directory'}
            </Button>
          )}
          <div className="flex-1 max-w-sm">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
              {t('ledger.client') || 'Client'}
            </label>
            <SearchableSelect
              options={clientOptions}
              value={activeClientId}
              onValueChange={handleClientChange}
              placeholder="Search client by name..."
              className="w-full"
            />
          </div>
        </div>

        {/* Date Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
            <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <span className="text-xs font-medium text-slate-500">From:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-transparent text-xs text-slate-800 font-medium focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
            <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <span className="text-xs font-medium text-slate-500">To:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-transparent text-xs text-slate-800 font-medium focus:outline-none"
            />
          </div>
          {(startDate || endDate) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setStartDate('');
                setEndDate('');
              }}
              className="h-8 text-xs text-slate-600 hover:text-slate-900"
              title="Clear date filters"
            >
              <X className="h-3.5 w-3.5 mr-1" /> Clear Dates
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {transactions.length > 0 && transactions[0].isPurchaseStock ? (
                <span className="text-purple-700">Warehouse ({activeClientName}) - Purchase Stock Ledger</span>
              ) : (
                `${activeClientName} - Transaction Ledger`
              )}
            </h2>
            <p className="text-sm text-slate-600 mt-1">Chronological view of all Inward and Outward transactions.</p>
          </div>
          {processedData.hasDateFilter && (
            <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 self-start sm:self-auto text-xs">
              Filtered ({processedData.visibleTransactions.length} of {transactions.length} records)
            </Badge>
          )}
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-100">
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Commodity</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-right">Inward</TableHead>
                <TableHead className="text-right">Outward</TableHead>
                <TableHead className="text-right">Net Loss</TableHead>
                <TableHead className="text-right">Net Wt. Loss</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="text-right">Bags Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center h-24 text-slate-500">Loading ledger...</TableCell>
                </TableRow>
              ) : (
                <>
                  {/* Opening Balance Row if Start Date filter is applied */}
                  {processedData.hasDateFilter && startDate && (
                    <TableRow className="bg-amber-50/60 font-medium text-slate-800 border-b border-amber-200/60">
                      <TableCell className="font-semibold text-slate-900">
                        Before {new Date(startDate).toLocaleDateString('en-GB')}
                      </TableCell>
                      <TableCell colSpan={3}>
                        <Badge variant="outline" className="bg-amber-100/80 text-amber-900 border-amber-300 text-[10px]">
                          OPENING BALANCE
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-slate-400">-</TableCell>
                      <TableCell className="text-right text-slate-400">-</TableCell>
                      <TableCell className="text-right text-slate-400">-</TableCell>
                      <TableCell className="text-right text-slate-400">-</TableCell>
                      <TableCell className="text-right font-bold text-slate-900">
                        {cleanFormatNum(processedData.openingBalance)}
                      </TableCell>
                      <TableCell className="text-right text-slate-700 font-semibold">
                        {cleanFormatNum(processedData.openingBags)}
                      </TableCell>
                    </TableRow>
                  )}

                  {processedData.visibleTransactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center h-24 text-slate-500">
                        {processedData.hasDateFilter
                          ? 'No transactions found matching the selected date range.'
                          : 'No transactions found.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    processedData.visibleTransactions.map((tx) => (
                      <TableRow key={tx._id} className="hover:bg-slate-50">
                        <TableCell className="font-medium">{new Date(tx.date).toLocaleDateString('en-GB')}</TableCell>
                        <TableCell>
                          {tx.isPurchaseStock ? (
                            <Badge 
                              variant="outline" 
                              className={tx.type === 'TRANSFER IN' || tx.type === 'TRANSFER OUT' || tx.type === 'PURCHASE TRANSFER' ? "bg-cyan-50 text-cyan-700 border-cyan-200" : "bg-purple-50 text-purple-700 border-purple-200"}
                            >
                              {tx.type === 'C/o ENTRY' || tx.type === 'INWARD' || tx.type === 'TRANSFER IN' ? <ArrowDownToLine className="w-3 h-3 mr-1" /> : <ArrowUpFromLine className="w-3 h-3 mr-1" />}
                              Purchase Stock ({tx.type === 'C/o ENTRY' || tx.type === 'INWARD' || tx.type === 'TRANSFER IN' ? 'In' : 'Out'})
                            </Badge>
                          ) : (
                            <div className="flex flex-col gap-1 items-start">
                              <Badge 
                                variant="outline" 
                                className={
                                  tx.type === 'C/o ENTRY' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                  tx.type === 'TRANSFER IN' || tx.type === 'TRANSFER OUT' || tx.type === 'PURCHASE TRANSFER' ? 'bg-cyan-50 text-cyan-700 border-cyan-200' : 
                                  tx.type === 'INWARD' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 
                                  'bg-rose-50 text-rose-700 border-rose-200'
                                }
                              >
                                {tx.type === 'C/o ENTRY' || tx.type === 'INWARD' || tx.type === 'TRANSFER IN' ? <ArrowDownToLine className="w-3 h-3 mr-1" /> : <ArrowUpFromLine className="w-3 h-3 mr-1" />}
                                {tx.type}
                              </Badge>
                              {(tx.type === 'INWARD' || tx.type === 'OUTWARD') && (tx.stockType === 'Purchase' || tx.stockType === 'Both') && (
                                <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-[10px] py-0">
                                  {tx.stockType === 'Both' ? `Self: ${cleanFormatNum(tx.selfQuantityKg)} KG | Purchase: ${cleanFormatNum(tx.purchaseQuantityKg)} KG` : 'Purchase Stock'}
                                </Badge>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>{tx.commodity || '-'}</TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div className="font-semibold">{tx.warehouse}</div>
                            <div className="text-slate-500 text-xs">{tx.location}</div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-emerald-600 font-medium">
                          {tx.inQty > 0 ? (
                            <div className="flex flex-col items-end">
                              <span>{cleanFormatNum(tx.inQty)}</span>
                              {tx.type === 'C/o ENTRY' && tx.displayBags > 0 && (
                                <span className="text-xs text-amber-600 font-normal mt-0.5">
                                  {tx.displayBags} Bags
                                </span>
                              )}
                            </div>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-right text-rose-600 font-medium">
                          {tx.outQty > 0 ? cleanFormatNum(tx.outQty) : '-'}
                        </TableCell>
                        <TableCell className="text-right text-slate-600 font-medium">
                          {tx.type === 'OUTWARD' && tx.plusMinus !== null ? cleanFormatNum(tx.plusMinus) : '-'}
                        </TableCell>
                        <TableCell className="text-right text-red-600 font-medium">
                          {tx.type === 'OUTWARD' && tx.netWeightLoss ? cleanFormatNum(tx.netWeightLoss) : '-'}
                        </TableCell>
                        <TableCell className="text-right font-bold text-slate-900">
                          {cleanFormatNum(tx.currentBal)}
                        </TableCell>
                        <TableCell className="text-right text-slate-600">
                          {cleanFormatNum(tx.currentBags)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </>
              )}
            </TableBody>
          </Table>
        </div>
        
        {!loading && transactions.length > 0 && (
          <div className="bg-slate-50 border-t border-slate-200 p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="bg-white shadow-sm border-slate-200">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500 font-medium">Total Inward</p>
                    <p className="text-2xl font-bold text-emerald-600 mt-1">{formatNumber(processedData.totalInwardQty.toFixed(2))}</p>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                    <ArrowDownToLine className="w-5 h-5 text-emerald-600" />
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-white shadow-sm border-slate-200">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500 font-medium">Total Outward</p>
                    <p className="text-2xl font-bold text-rose-600 mt-1">{formatNumber(processedData.totalOutwardQty.toFixed(2))}</p>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center">
                    <ArrowUpFromLine className="w-5 h-5 text-rose-600" />
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-slate-900 shadow-sm border-slate-800">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-400 font-medium">Net Balance & Bags</p>
                    <p className="text-2xl font-bold text-white mt-1">
                      {formatNumber(processedData.closingBalance.toFixed(2))}
                      <span className="text-sm text-slate-400 ml-2 font-normal">KG</span>
                    </p>
                    <p className="text-xl font-bold text-indigo-300 mt-1">
                      {cleanFormatNum(processedData.closingBags)}
                      <span className="text-sm text-slate-400 ml-2 font-normal">Bags</span>
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center">
                    <span className="text-lg font-bold text-white">∑</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
