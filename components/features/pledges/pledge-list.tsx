'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, CheckCircle, Clock } from 'lucide-react';
import { getPledges, releasePledge } from '@/app/actions/pledge-actions';
import { toast } from 'sonner';
import PartialReleaseModal from './partial-release-modal';
import ReleaseHistoryModal from './release-history-modal';

export default function PledgeList() {
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
      const data = await getPledges();
      setPledges(data);
    } catch (error) {
      toast.error('Failed to load pledges');
    } finally {
      setLoading(false);
    }
  };

  const handleRelease = async (id: string) => {
    if (!confirm('Are you sure you want to release this pledge? This will make the stock available for outward again.')) return;
    
    setReleasing(id);
    try {
      const res = await releasePledge(id);
      if (res.success) {
        toast.success('Pledge released successfully');
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
      <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-100">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Pledges & Loans</h1>
          <p className="text-sm text-slate-500">Manage stock pledged against loans</p>
        </div>
        <Link href="/dashboard/pledges/new">
          <Button className="bg-orange-600 hover:bg-orange-700">
            <Plus className="mr-2 h-4 w-4" /> Create Pledge
          </Button>
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center">
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search pledges..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 bg-slate-50 border-slate-200"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Pledge No.</th>
                <th className="px-6 py-4">Client</th>
                <th className="px-6 py-4">Lender / Bank</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Loan Amount</th>
                <th className="px-6 py-4">Stock Status (MT / Bags)</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-slate-500">
                    Loading pledges...
                  </td>
                </tr>
              ) : filteredPledges.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-slate-500">
                    No pledges found. Create a new pledge to get started.
                  </td>
                </tr>
              ) : (
                filteredPledges.map((pledge) => (
                  <tr key={pledge._id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4 font-medium text-slate-900">
                      {pledge.pledgeNo}
                    </td>
                    <td className="px-6 py-4">
                      {pledge.clientId?.name || 'Unknown'}
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {pledge.lenderName}
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      <div className="font-medium text-slate-800">{new Date(pledge.loanDate).toLocaleDateString()}</div>
                      {pledge.repaymentDate && (
                        <div className="text-xs text-orange-600 font-medium">
                          Repay: {new Date(pledge.repaymentDate).toLocaleDateString()}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 font-medium">
                      ₹{pledge.loanAmount.toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      {(() => {
                        const totalMt = pledge.items.reduce((sum: number, item: any) => sum + item.pledgedQuantity, 0);
                        const totalBags = pledge.items.reduce((sum: number, item: any) => sum + item.pledgedBags, 0);
                        const relMt = pledge.items.reduce((sum: number, item: any) => sum + (item.releasedQuantity || 0), 0);
                        const relBags = pledge.items.reduce((sum: number, item: any) => sum + (item.releasedBags || 0), 0);
                        const remMt = totalMt - relMt;
                        const remBags = totalBags - relBags;

                        return (
                          <div className="text-xs space-y-1">
                            <div className="text-slate-500">Total: {totalMt.toFixed(2)} / {totalBags}</div>
                            {relMt > 0 && <div className="text-amber-600">Released: {relMt.toFixed(2)} / {relBags}</div>}
                            <div className="font-semibold text-slate-900">Rem: {remMt.toFixed(2)} / {remBags}</div>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-6 py-4">
                      {pledge.status === 'ACTIVE' ? (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                          <Clock className="w-3 h-3 mr-1" /> Active
                        </Badge>
                      ) : pledge.status === 'PARTIAL' ? (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                          <Clock className="w-3 h-3 mr-1" /> Partial
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                          <CheckCircle className="w-3 h-3 mr-1" /> Released
                        </Badge>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right space-y-1">
                      {(pledge.status === 'ACTIVE' || pledge.status === 'PARTIAL') && (
                        <div className="flex flex-col gap-1 items-end">
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200 w-28"
                            onClick={() => setPartialReleasePledge(pledge)}
                          >
                            Partial Release
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 border-emerald-200 w-28"
                            onClick={() => handleRelease(pledge._id)}
                            disabled={releasing === pledge._id}
                          >
                            {releasing === pledge._id ? 'Releasing...' : 'Full Release'}
                          </Button>
                        </div>
                      )}
                      
                      <div className="flex flex-col gap-1 items-end mt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-slate-600 hover:text-slate-800 hover:bg-slate-100 border-slate-200 w-28"
                          onClick={() => setHistoryPledge(pledge)}
                        >
                          History
                        </Button>
                      </div>
                      
                      {pledge.status === 'RELEASED' && (
                        <span className="text-xs text-slate-400">
                          Released on {new Date(pledge.releaseDate).toLocaleDateString()}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {partialReleasePledge && (
        <PartialReleaseModal 
          pledge={partialReleasePledge} 
          onClose={() => setPartialReleasePledge(null)}
          onSuccess={() => {
            setPartialReleasePledge(null);
            fetchPledges();
          }}
        />
      )}

      {historyPledge && (
        <ReleaseHistoryModal 
          pledge={historyPledge}
          onClose={() => setHistoryPledge(null)}
        />
      )}
    </div>
  );
}
