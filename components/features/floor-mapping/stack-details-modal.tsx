'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getStackDetails } from '@/app/actions/cold-stack-actions';
import { Package, Users, Contact2, History, ArrowDownToLine, ArrowUpFromLine, Plus, Minus, Printer } from 'lucide-react';
import Link from 'next/link';
import { useColdTranslation } from '@/components/providers/cold-language-provider';

interface StackDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  warehouseId: string;
  chamberNo: string;
  floorNo: number;
  stackNo: number;
}

export default function StackDetailsModal({ isOpen, onClose, warehouseId, chamberNo, floorNo, stackNo }: StackDetailsModalProps) {
  const { t } = useColdTranslation();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setError(null);
      getStackDetails(warehouseId, chamberNo, floorNo, stackNo)
        .then(res => {
          if (res.success) {
            setData(res.data);
          } else {
            setError(res.error || 'Failed to fetch stack details');
          }
          setLoading(false);
        })
        .catch(err => {
          setError(err.message || 'An unexpected error occurred');
          setLoading(false);
        });
    }
  }, [isOpen, warehouseId, chamberNo, floorNo, stackNo]);

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'Empty': return 'bg-slate-200 text-slate-700';
      case 'Partial': return 'bg-amber-200 text-amber-900';
      case 'Full': return 'bg-red-200 text-red-900';
      case 'Blocked': return 'bg-slate-700 text-slate-200';
      default: return 'bg-slate-200 text-slate-700';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-6xl bg-white text-slate-900 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex justify-between items-center pr-4">
            <DialogTitle className="text-xl font-bold text-slate-900">{t('floorMapping.stackNo')} {stackNo} {t('floorMapping.viewDetails').replace('View ', '')}</DialogTitle>
            {data && (
              <div className="flex items-center gap-3">
                <span className={`text-xs uppercase tracking-wider font-bold px-3 py-1 rounded-full ${getStatusBadgeColor(data.status)}`}>
                  {t(`floorMapping.${data.status.toLowerCase()}`)}
                </span>
                
                {data.status === 'Empty' && (
                  <Link href={`/cold/inward?action=add&warehouseId=${warehouseId}&chamberNo=${chamberNo}&floorNo=${floorNo}&stackNo=${stackNo}`}>
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 font-bold">
                      <Plus className="w-4 h-4 mr-1" /> Add Inward
                    </Button>
                  </Link>
                )}
                
                {data.status === 'Partial' && (
                  <>
                    <Link href={`/cold/inward?action=add&warehouseId=${warehouseId}&chamberNo=${chamberNo}&floorNo=${floorNo}&stackNo=${stackNo}`}>
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 font-bold">
                        <Plus className="w-4 h-4 mr-1" /> Add Inward
                      </Button>
                    </Link>
                    <Link href={`/cold/outward?action=add&warehouseId=${warehouseId}&chamberNo=${chamberNo}&floorNo=${floorNo}&stackNo=${stackNo}`}>
                      <Button size="sm" className="bg-rose-600 hover:bg-rose-700 font-bold">
                        <Minus className="w-4 h-4 mr-1" /> Add Outward
                      </Button>
                    </Link>
                  </>
                )}

                {data.status === 'Full' && (
                  <Link href={`/cold/outward?action=add&warehouseId=${warehouseId}&chamberNo=${chamberNo}&floorNo=${floorNo}&stackNo=${stackNo}`}>
                    <Button size="sm" className="bg-rose-600 hover:bg-rose-700 font-bold">
                      <Minus className="w-4 h-4 mr-1" /> Add Outward
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </div>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center p-12">
            <div className="animate-spin h-8 w-8 border-4 border-blue-600 rounded-full border-t-transparent"></div>
          </div>
        ) : error ? (
          <div className="text-center p-12 text-rose-500 font-medium whitespace-pre-wrap">{error}</div>
        ) : !data ? (
          <div className="text-center p-12 text-slate-500">Failed to load details</div>
        ) : (
          <div className="space-y-6 mt-4">
            {/* Summary Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-lg border">
              <div className="space-y-1">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">{t('floorMapping.capacity')}</span>
                <div className="font-semibold text-slate-900">{data.capacity.toLocaleString()} Kg</div>
              </div>
              <div className="space-y-1">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">{t('floorMapping.usedCapacity')}</span>
                <div className="font-semibold text-blue-700">{data.usedCapacity.toLocaleString()} Kg</div>
              </div>
              <div className="space-y-1">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">{t('floorMapping.availableCapacity')}</span>
                <div className="font-semibold text-emerald-700">{data.availableCapacity.toLocaleString()} Kg</div>
              </div>
              <div className="space-y-1">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Fill Rate</span>
                <div className="font-semibold text-slate-900">{Math.round((data.usedCapacity / data.capacity) * 100)}%</div>
              </div>
            </div>

            {/* Current Stock Distribution */}
            <div className="space-y-3 pt-2">
              <h4 className="flex items-center text-sm font-bold text-slate-900">
                <Package className="w-4 h-4 mr-2" /> Current Stock Distribution
              </h4>
              
              {data.currentStock && data.currentStock.length > 0 ? (
                <div className="rounded-md border border-slate-300 overflow-hidden">
                  <table className="min-w-full divide-y divide-slate-300">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider">Client / Owner</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider">Commodity</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider">Stock Type</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider text-right">Quantity</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200 text-sm text-slate-800 font-medium">
                      {data.currentStock.map((stock: any, i: number) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-4 py-3 whitespace-nowrap">{stock.clientName}</td>
                          <td className="px-4 py-3 whitespace-nowrap">{stock.commodityName}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${stock.stockType === 'Purchase' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-700'}`}>
                              {stock.stockType}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-right font-bold text-slate-700">
                            {stock.quantity.toLocaleString()} {stock.unit}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center p-6 bg-slate-50 rounded-lg border border-dashed border-slate-300 text-slate-600 font-medium">
                  No stock currently available in this stack.
                </div>
              )}
            </div>

            {/* Active Stocks / Inward Transactions */}
            <div className="space-y-3">
              <h4 className="flex items-center text-sm font-bold text-slate-900">
                <Package className="w-4 h-4 mr-2" /> Active Stock Details
              </h4>
              
              {data.activeStocks && data.activeStocks.length > 0 ? (
                <div className="rounded-md border border-slate-300 overflow-hidden">
                  <table className="min-w-full divide-y divide-slate-300">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider">{t('inward.dateHeader')}</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider">{t('inward.clientNameHeader')}</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider">{t('inward.farmerName')}</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider">{t('inward.refPersons')}</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider">{t('inward.commodityHeader')}</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider">{t('inward.quantityHeader')}</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider">L/B</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider">S/B</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider">M/B</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider">T/B</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider">{t('inward.truckNo')}</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200 text-sm text-slate-800 font-medium">
                      {data.activeStocks.map((stock: any) => (
                        <tr key={stock.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 whitespace-nowrap">{new Date(stock.date).toLocaleDateString('en-GB')}</td>
                          <td className="px-4 py-3 whitespace-nowrap">{stock.client}</td>
                          <td className="px-4 py-3 whitespace-nowrap">{stock.farmer}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-slate-600 max-w-[150px] truncate" title={stock.referencePersons}>{stock.referencePersons}</td>
                          <td className="px-4 py-3 whitespace-nowrap">{stock.commodity}</td>
                          <td className="px-4 py-3 whitespace-nowrap font-bold text-blue-700">{stock.quantity.toLocaleString()}</td>
                          <td className="px-4 py-3 whitespace-nowrap font-medium text-slate-700">{stock.largeBags}</td>
                          <td className="px-4 py-3 whitespace-nowrap font-medium text-slate-700">{stock.smallBags}</td>
                          <td className="px-4 py-3 whitespace-nowrap font-medium text-slate-700">{stock.mixedBags}</td>
                          <td className="px-4 py-3 whitespace-nowrap font-bold text-slate-900">{stock.totalBags}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-slate-500">{stock.truckNo}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center p-6 bg-slate-50 rounded-lg border border-dashed border-slate-300 text-slate-600 font-medium">
                  {t('floorMapping.noActiveStocks')}
                </div>
              )}
            </div>

            {/* Transaction History */}
            <div className="space-y-3 pt-4 border-t border-slate-300">
              <h4 className="flex items-center text-sm font-bold text-slate-900">
                <History className="w-4 h-4 mr-2" /> {t('floorMapping.transactionHistory')}
              </h4>
              
              {data.transactions.length > 0 ? (
                <div className="rounded-md border border-slate-300 overflow-hidden">
                  <table className="min-w-full divide-y divide-slate-300">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider">{t('inward.dateHeader')}</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider">Type</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider">Receipt</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider">{t('inward.quantityHeader')}</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 uppercase tracking-wider">{t('inward.clientNameHeader')}</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200 text-sm text-slate-800 font-medium">
                      {data.transactions.map((tItem: any) => (
                        <tr key={tItem.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 whitespace-nowrap">{new Date(tItem.date).toLocaleDateString('en-GB')}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
                              tItem.type === 'INWARD' ? 'bg-emerald-100 text-emerald-900' : 'bg-rose-100 text-rose-900'
                            }`}>
                              {tItem.type === 'INWARD' ? <ArrowDownToLine className="w-3 h-3 mr-1" /> : <ArrowUpFromLine className="w-3 h-3 mr-1" />}
                              {t(`receipt.${tItem.type.toLowerCase()}`) || tItem.type}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">{tItem.receiptNo}</td>
                          <td className="px-4 py-3 whitespace-nowrap">{tItem.quantity.toLocaleString()}</td>
                          <td className="px-4 py-3 whitespace-nowrap">{tItem.client}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center p-8 bg-slate-50 rounded-lg border border-dashed text-slate-500">
                  No transactions found for this stack.
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
