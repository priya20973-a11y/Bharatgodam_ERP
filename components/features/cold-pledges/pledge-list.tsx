'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, CheckCircle, Clock, FileText, ExternalLink, RefreshCw } from 'lucide-react';
import { getColdPledges, releaseColdPledge } from '@/app/actions/cold-pledge-actions';
import { toast } from 'sonner';
import ColdPartialReleaseModal from './partial-release-modal';
import ColdReleaseHistoryModal from './release-history-modal';

function formatDateDDMMYYYY(val: string | Date | undefined | null): string {
  if (!val) return '—';
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) {
    const parts = val.split('T')[0].split('-');
    return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
  }
  const d = new Date(val);
  if (isNaN(d.getTime())) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export default function ColdPledgeList() {
  const [pledges, setPledges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [releasing, setReleasing] = useState<string | null>(null);
  const [partialReleasePledge, setPartialReleasePledge] = useState<any | null>(null);
  const [historyPledge, setHistoryPledge] = useState<any | null>(null);

  useEffect(() => {
    fetchPledges();
  }, []);

  const fetchPledges = async () => {
    try {
      const data = await getColdPledges();
      setPledges(data);
    } catch (error) {
      toast.error('Failed to load Cold Storage pledges');
    } finally {
      setLoading(false);
    }
  };

  const handleRelease = async (id: string) => {
    if (!confirm('Are you sure you want to release this pledge? This will make the pledged stock available for outward dispatch.')) return;
    
    setReleasing(id);
    try {
      const res = await releaseColdPledge(id);
      if (res.success) {
        toast.success('Pledge fully released successfully');
        await fetchPledges();
      } else {
        toast.error('Failed to release pledge');
      }
    } catch (error: any) {
      toast.error(error.message || 'Error releasing pledge');
    } finally {
      setReleasing(null);
    }
  };

  const filteredPledges = pledges.filter(p => 
    p.pledgeNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.lenderName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.clientId?.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200/80 gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Cold Storage Pledges & Loans</h1>
          <p className="text-sm text-slate-500">Manage cold storage commodity stock pledged against bank/NBFC loans</p>
        </div>
        <Link href="/cold/pledges/new">
          <Button className="bg-cyan-700 hover:bg-cyan-800 text-white">
            <Plus className="mr-2 h-4 w-4" /> Create Pledge
          </Button>
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200/80 overflow-hidden">
        <div className="p-4 border-b border-slate-200/80 flex justify-between items-center">
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search pledges..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 bg-slate-50 border-slate-200 text-sm"
            />
          </div>
          <Button variant="ghost" size="sm" onClick={fetchPledges} className="text-xs text-slate-500 hover:text-slate-800">
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 text-xs uppercase">
              <tr>
                <th className="px-6 py-4">Pledge No.</th>
                <th className="px-6 py-4">Client</th>
                <th className="px-6 py-4">Lender / Bank</th>
                <th className="px-6 py-4">Loan / Repayment Date</th>
                <th className="px-6 py-4">Loan Amount</th>
                <th className="px-6 py-4">Pledged Stock (Kg / Bags)</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-slate-500">
                    Loading pledges...
                  </td>
                </tr>
              ) : filteredPledges.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-slate-500">
                    No pledge records found.
                  </td>
                </tr>
              ) : (
                filteredPledges.map((pledge) => {
                  const totalPledgedKg = pledge.items.reduce((sum: number, i: any) => sum + (i.pledgedQuantity || 0), 0);
                  const totalPledgedBags = pledge.items.reduce((sum: number, i: any) => sum + (i.pledgedBags || 0), 0);
                  const totalReleasedKg = pledge.items.reduce((sum: number, i: any) => sum + (i.releasedQuantity || 0), 0);
                  const totalReleasedBags = pledge.items.reduce((sum: number, i: any) => sum + (i.releasedBags || 0), 0);
                  const isReleased = pledge.status === 'RELEASED';
                  const isPartial = pledge.status === 'PARTIAL';

                  return (
                    <tr key={pledge._id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-6 py-4 font-semibold text-slate-900">
                        {pledge.pledgeNo}
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-800">
                        {pledge.clientId?.name || 'Unknown'}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {pledge.lenderName}
                      </td>
                      <td className="px-6 py-4 text-slate-600 text-xs">
                        <div>Loan: {formatDateDDMMYYYY(pledge.loanDate)}</div>
                        <div className="text-slate-400 mt-0.5">Repay: {formatDateDDMMYYYY(pledge.repaymentDate)}</div>
                      </td>
                      <td className="px-6 py-4 font-semibold text-slate-900">
                        ₹{pledge.loanAmount?.toLocaleString('en-IN')}
                      </td>
                      <td className="px-6 py-4 text-xs">
                        <div className="font-semibold text-slate-800">
                          {totalPledgedKg.toLocaleString('en-IN')} Kg / {totalPledgedBags} bags
                        </div>
                        {(isPartial || isReleased) && (
                          <div className="text-emerald-700 font-medium mt-0.5">
                            Released: {totalReleasedKg.toLocaleString('en-IN')} Kg / {totalReleasedBags} bags
                          </div>
                        )}
                        <div className="text-[11px] text-slate-400 mt-1 truncate max-w-[200px]" title={pledge.items.map((i: any) => i.inwardLabel).join(', ')}>
                          {pledge.items.map((i: any) => i.inwardLabel).join(', ')}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge 
                          variant="outline" 
                          className={
                            isReleased 
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                              : isPartial 
                              ? 'bg-blue-50 text-blue-700 border-blue-200' 
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }
                        >
                          {isReleased ? <CheckCircle className="w-3 h-3 mr-1" /> : <Clock className="w-3 h-3 mr-1" />}
                          {pledge.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setHistoryPledge(pledge)}
                            className="text-cyan-700 hover:bg-cyan-50 h-8 px-2 text-xs"
                          >
                            <FileText className="w-3.5 h-3.5 mr-1" />
                            History
                          </Button>

                          {!isReleased && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPartialReleasePledge(pledge)}
                                className="text-blue-700 border-blue-200 hover:bg-blue-50 h-8 px-2 text-xs"
                              >
                                Partial Release
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={releasing === pledge._id}
                                onClick={() => handleRelease(pledge._id)}
                                className="text-emerald-700 border-emerald-200 hover:bg-emerald-50 h-8 px-2 text-xs"
                              >
                                Release All
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {partialReleasePledge && (
        <ColdPartialReleaseModal
          pledge={partialReleasePledge}
          onClose={() => setPartialReleasePledge(null)}
          onSuccess={() => {
            setPartialReleasePledge(null);
            fetchPledges();
          }}
        />
      )}

      {historyPledge && (
        <ColdReleaseHistoryModal
          pledge={historyPledge}
          onClose={() => setHistoryPledge(null)}
        />
      )}
    </div>
  );
}
