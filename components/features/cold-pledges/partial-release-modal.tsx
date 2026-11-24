'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { X, Loader2 } from 'lucide-react';
import { partialReleaseColdPledge } from '@/app/actions/cold-pledge-actions';
import { toast } from 'sonner';

interface PartialReleaseModalProps {
  pledge: any;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ColdPartialReleaseModal({ pledge, onClose, onSuccess }: PartialReleaseModalProps) {
  const [loading, setLoading] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [releaseDate, setReleaseDate] = useState(new Date().toISOString().split('T')[0]);
  
  const initialReleases = pledge.items.map((item: any) => ({
    inwardId: item.inwardId,
    inwardLabel: item.inwardLabel,
    availableQty: item.pledgedQuantity - (item.releasedQuantity || 0),
    availableBags: item.pledgedBags - (item.releasedBags || 0),
    releaseQty: 0,
    releaseBags: 0,
    commodityId: item.commodityId,
  }));

  const [releases, setReleases] = useState(initialReleases);

  const handleQtyChange = (index: number, value: string) => {
    const val = parseFloat(value) || 0;
    const newReleases = [...releases];
    newReleases[index].releaseQty = val;
    setReleases(newReleases);
  };

  const handleBagsChange = (index: number, value: string) => {
    const val = parseInt(value, 10) || 0;
    const newReleases = [...releases];
    newReleases[index].releaseBags = val;
    setReleases(newReleases);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    let hasRelease = false;
    let hasError = false;

    const itemsToRelease = releases.map((r: any) => {
      if (r.releaseQty > r.availableQty) {
        toast.error(`Release quantity exceeds available pledged quantity for lot`);
        hasError = true;
      }
      if (r.releaseQty > 0 || r.releaseBags > 0) hasRelease = true;
      return {
        inwardId: r.inwardId,
        releasedQuantity: r.releaseQty,
        releasedBags: r.releaseBags
      };
    });

    if (hasError) return;
    if (!hasRelease) return toast.error('Please enter at least one quantity to release.');
    if (!releaseDate) return toast.error('Release date is required.');

    setLoading(true);
    try {
      const res = await partialReleaseColdPledge(pledge._id, itemsToRelease, remarks, releaseDate);
      if (res.success) {
        toast.success('Stock partially released successfully');
        onSuccess();
      } else {
        toast.error(res.error || 'Failed to release stock');
      }
    } catch (error: any) {
      toast.error(error.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-xl font-bold text-slate-800">Partial Release - {pledge.pledgeNo}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-5 w-5" /></Button>
        </div>
        <div className="p-4 overflow-y-auto">
          <form id="partial-release-form" onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <h3 className="font-semibold text-slate-800">Select Quantities to Release</h3>
              {releases.map((item: any, idx: number) => {
                if (item.availableQty <= 0 && item.availableBags <= 0) return null;
                return (
                  <div key={idx} className="bg-slate-50 border rounded-lg p-3 space-y-3">
                    <div className="font-medium text-slate-900 border-b pb-1">
                      {item.inwardLabel || 'Inward Lot'}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs text-slate-500">
                          Release Qty (Kg) (Max: {item.availableQty.toLocaleString('en-IN')} Kg)
                        </Label>
                        <Input
                          type="number"
                          step="any"
                          min="0"
                          max={item.availableQty}
                          value={item.releaseQty || ''}
                          onChange={(e) => handleQtyChange(idx, e.target.value)}
                          placeholder="0"
                          className="bg-white mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">
                          Release Bags (Max: {item.availableBags})
                        </Label>
                        <Input
                          type="number"
                          step="1"
                          min="0"
                          max={item.availableBags}
                          value={item.releaseBags || ''}
                          onChange={(e) => handleBagsChange(idx, e.target.value)}
                          placeholder="0"
                          className="bg-white mt-1"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="space-y-2">
              <Label>Release Date</Label>
              <Input
                type="date"
                value={releaseDate}
                onChange={(e) => setReleaseDate(e.target.value)}
                required
                className="bg-white"
              />
            </div>

            <div className="space-y-2">
              <Label>Remarks / Release Reason (Optional)</Label>
              <Input
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="e.g. Loan partially repaid"
                className="bg-white"
              />
            </div>
          </form>
        </div>
        <div className="p-4 border-t flex justify-end space-x-2 bg-slate-50">
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button form="partial-release-form" type="submit" disabled={loading} className="bg-cyan-700 hover:bg-cyan-800 text-white">
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Release Stock
          </Button>
        </div>
      </div>
    </div>
  );
}
