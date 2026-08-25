'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Loader2 } from 'lucide-react';
import { searchColdInwardByReceipt } from '@/app/actions/cold-inward-actions';
import { toast } from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { useColdTranslation } from '@/components/providers/cold-language-provider';

interface SearchInwardModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SearchInwardModal({ isOpen, onClose }: SearchInwardModalProps) {
  const { t } = useColdTranslation();
  const router = useRouter();
  const [receiptNo, setReceiptNo] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<any>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiptNo.trim()) return;

    setIsSearching(true);
    setSearchResult(null);
    try {
      const inward = await searchColdInwardByReceipt(receiptNo.trim());
      
      if (!inward) {
        toast.error('No inward found with this receipt number.');
      } else {
        setSearchResult(inward);
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to search inward.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelect = () => {
    if (!searchResult) return;
    
    if (searchResult.quantityKg <= 0 && searchResult.bagsCount <= 0) {
      toast.error('This inward has no available stock left.');
      return;
    }
    
    onClose();
    // Pass the receipt number in the URL to trigger the "Add" form and auto-fill
    router.push(`/cold/outward?action=add&receiptNo=${encodeURIComponent(searchResult.receiptNumber)}`);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Search Inward</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSearch} className="space-y-4 pt-4">
          <div className="flex gap-2">
            <Input
              placeholder="Enter Inward Receipt Number..."
              value={receiptNo}
              onChange={(e) => setReceiptNo(e.target.value)}
              className="flex-1 text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900"
              autoFocus
            />
            <Button type="submit" disabled={isSearching || !receiptNo.trim()}>
              {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>

          {searchResult && (
            <div className="border rounded-md p-4 bg-slate-50 dark:bg-slate-900 space-y-2 mt-4">
              <h3 className="font-medium text-slate-900 dark:text-slate-100 border-b pb-2">Inward Details</h3>
              <div className="grid grid-cols-2 gap-2 text-sm pt-2">
                <div className="text-slate-500 dark:text-slate-400">Receipt No:</div>
                <div className="font-medium text-slate-900 dark:text-slate-100">{searchResult.receiptNumber || '-'}</div>
                
                <div className="text-slate-500 dark:text-slate-400">Client:</div>
                <div className="font-medium truncate text-slate-900 dark:text-slate-100">{searchResult.clientId?.name || '-'}</div>
                
                <div className="text-slate-500 dark:text-slate-400">Commodity:</div>
                <div className="font-medium truncate text-slate-900 dark:text-slate-100">{searchResult.commodityId?.name || '-'}</div>

                <div className="text-slate-500 dark:text-slate-400">Date:</div>
                <div className="font-medium text-slate-900 dark:text-slate-100">{new Date(searchResult.date).toLocaleDateString('en-GB')}</div>
              </div>

              <div className="bg-white dark:bg-slate-800 border dark:border-slate-700 rounded p-3 mt-3">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Available Stock</span>
                </div>
                <div className="flex gap-4">
                  <div>
                    <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-500">{searchResult.quantityKg}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 ml-1">KG</span>
                  </div>
                  <div>
                    <span className="text-2xl font-bold text-slate-700 dark:text-slate-200">{searchResult.bagsCount}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 ml-1">BAGS</span>
                  </div>
                </div>
                {(searchResult.quantityKg <= 0 && searchResult.bagsCount <= 0) && (
                  <p className="text-xs text-rose-500 dark:text-rose-400 mt-2 font-medium">No stock available for outward.</p>
                )}
              </div>

              <Button 
                className="w-full mt-4" 
                onClick={handleSelect}
                type="button"
                disabled={searchResult.quantityKg <= 0 && searchResult.bagsCount <= 0}
              >
                Select for Outward
              </Button>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
