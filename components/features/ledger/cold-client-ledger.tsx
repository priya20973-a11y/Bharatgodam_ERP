'use client';

import { useState, useEffect } from 'react';
import { getColdClientLedger } from '@/app/actions/cold-ledger-actions';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useColdTranslation } from '@/components/providers/cold-language-provider';
import { ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';

interface ColdClientLedgerProps {
  clientId: string;
  clientName: string;
}

export function ColdClientLedger({ clientId, clientName }: ColdClientLedgerProps) {
  const { t, formatNumber } = useColdTranslation();
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<any[]>([]);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const data = await getColdClientLedger(clientId);
        setTransactions(data);
      } catch (err) {
        console.error('Failed to load ledger', err);
      } finally {
        setLoading(false);
      }
    }
    if (clientId) loadData();
  }, [clientId]);

  let runningBalance = 0;
  let runningBags = 0;
  let totalInwardQty = 0;
  let totalOutwardQty = 0;

  const cleanFormatNum = (num: any) => {
    const n = Number(num || 0);
    const rounded = Math.round(n * 100) / 100;
    return formatNumber(Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(2));
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">
            {transactions.length > 0 && transactions[0].isPurchaseStock ? (
              <span className="text-purple-700">Warehouse ({clientName}) - Purchase Stock Ledger</span>
            ) : (
              `${clientName} - Transaction Ledger`
            )}
          </h2>
          <p className="text-sm text-slate-600 mt-1">Chronological view of all Inward and Outward transactions.</p>
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
                <TableHead className="text-right">Net Wt. Change</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="text-right">Bags Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center h-24">Loading ledger...</TableCell>
                </TableRow>
              ) : transactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center h-24">No transactions found.</TableCell>
                </TableRow>
              ) : (
                transactions.map((tx) => {
                  let inQty = 0;
                  let outQty = 0;

                  let displayBags = Number(tx.totalBags || tx.bagsCount || 0);

                  if (tx.type === 'INWARD' || tx.type === 'TRANSFER IN') {
                    if (tx.isPurchaseStock) {
                      const pQty = Number((tx.stockType === 'Both' ? (tx.purchaseQuantityKg ?? 0) : (tx.purchaseQuantityKg ?? tx.quantityKg ?? 0)) ?? 0);
                      const pBags = Number((tx.stockType === 'Both' ? (tx.purchaseBagsCount ?? 0) : (tx.purchaseBagsCount ?? tx.totalBags ?? tx.bagsCount ?? 0)) ?? 0);
                      inQty = pQty;
                      runningBalance += pQty;
                      runningBags += pBags;
                      totalInwardQty += pQty;
                    } else {
                      if (tx.stockType === 'Purchase') {
                        // Stock Type = Purchase:
                        // Inward Quantity column = Net Weight / Purchase Quantity.
                        // Do NOT add or deduct Purchase Quantity from Remaining Balance.
                        inQty = Number(tx.quantityKg ?? tx.purchaseQuantityKg ?? 0);
                        totalInwardQty += inQty;
                        // runningBalance & runningBags remain unchanged for Purchase stock in client ledger
                      } else if (tx.stockType === 'Both') {
                        // Stock Type = Both:
                        // Inward Quantity column = Net Weight = 1100 KG
                        // Self Qty = 616 KG, Purchase Qty = 484 KG
                        // Balance += Self Qty only (616 KG)
                        // Purchase Qty is display-only (484 KG)
                        inQty = Number(tx.quantityKg ?? 0);
                        const selfQty = Number(tx.selfQuantityKg ?? 0);
                        const selfBags = Number(tx.selfBagsCount ?? 0);
                        runningBalance += selfQty;
                        runningBags += selfBags;
                        totalInwardQty += inQty;
                      } else {
                        // Stock Type = Self:
                        // Inward Quantity column = Net Weight.
                        // Add Net Weight to Remaining Balance.
                        inQty = Number(tx.quantityKg ?? tx.selfQuantityKg ?? 0);
                        runningBalance += inQty;
                        runningBags += displayBags;
                        totalInwardQty += inQty;
                      }
                    }
                  } else {
                    const oQty = Number(tx.quantityKg || 0);
                    outQty = oQty;
                    runningBalance -= oQty;
                    runningBags -= displayBags;
                    totalOutwardQty += oQty;
                  }

                  return (
                    <TableRow key={tx._id} className="hover:bg-slate-50">
                      <TableCell className="font-medium">{new Date(tx.date).toLocaleDateString('en-GB')}</TableCell>
                      <TableCell>
                        {tx.isPurchaseStock ? (
                          <Badge 
                            variant="outline" 
                            className={tx.type === 'TRANSFER IN' || tx.type === 'TRANSFER OUT' || tx.type === 'PURCHASE TRANSFER' ? "bg-cyan-50 text-cyan-700 border-cyan-200" : "bg-purple-50 text-purple-700 border-purple-200"}
                          >
                            {tx.type === 'INWARD' || tx.type === 'TRANSFER IN' ? <ArrowDownToLine className="w-3 h-3 mr-1" /> : <ArrowUpFromLine className="w-3 h-3 mr-1" />}
                            Purchase Stock ({tx.type === 'INWARD' || tx.type === 'TRANSFER IN' ? 'In' : 'Out'})
                          </Badge>
                        ) : (
                          <div className="flex flex-col gap-1 items-start">
                            <Badge 
                              variant="outline" 
                              className={tx.type === 'TRANSFER IN' || tx.type === 'TRANSFER OUT' || tx.type === 'PURCHASE TRANSFER' ? 'bg-cyan-50 text-cyan-700 border-cyan-200' : (tx.type === 'INWARD' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200')}
                            >
                              {tx.type === 'INWARD' || tx.type === 'TRANSFER IN' ? <ArrowDownToLine className="w-3 h-3 mr-1" /> : <ArrowUpFromLine className="w-3 h-3 mr-1" />}
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
                        {inQty > 0 ? cleanFormatNum(inQty) : '-'}
                      </TableCell>
                      <TableCell className="text-right text-rose-600 font-medium">
                        {outQty > 0 ? cleanFormatNum(outQty) : '-'}
                      </TableCell>
                      <TableCell className="text-right text-slate-600 font-medium">
                        {tx.type === 'OUTWARD' && tx.plusMinus !== null ? cleanFormatNum(tx.plusMinus) : '-'}
                      </TableCell>
                      <TableCell className="text-right font-bold text-slate-900">
                        {cleanFormatNum(runningBalance)}
                      </TableCell>
                      <TableCell className="text-right text-slate-600">
                        {cleanFormatNum(runningBags)}
                      </TableCell>
                    </TableRow>
                  );
                })
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
                    <p className="text-2xl font-bold text-emerald-600 mt-1">{formatNumber(totalInwardQty.toFixed(2))}</p>
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
                    <p className="text-2xl font-bold text-rose-600 mt-1">{formatNumber(totalOutwardQty.toFixed(2))}</p>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center">
                    <ArrowUpFromLine className="w-5 h-5 text-rose-600" />
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-slate-900 shadow-sm border-slate-800">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-400 font-medium">Net Balance</p>
                    <p className="text-2xl font-bold text-white mt-1">{formatNumber(runningBalance.toFixed(2))}</p>
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
