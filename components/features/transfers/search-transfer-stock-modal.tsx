'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Loader2 } from 'lucide-react';
import { searchAvailableInwardsForTransfer } from '@/app/actions/cold-transfer-actions';
import { toast } from 'react-hot-toast';
import { useColdTranslation } from '@/components/providers/cold-language-provider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface SearchTransferStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (inwardId: string, clientId: string) => void;
  onSelectMultiple?: (inwards: any[]) => void;
}

export default function SearchTransferStockModal({ isOpen, onClose, onSelect, onSelectMultiple }: SearchTransferStockModalProps) {
  const { t } = useColdTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchBy, setSearchBy] = useState<'receipt' | 'lot'>('receipt');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedInwards, setSelectedInwards] = useState<any[]>([]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setHasSearched(true);
    setSearchResults([]);
    try {
      const inwards = await searchAvailableInwardsForTransfer(searchQuery.trim(), searchBy);
      setSearchResults(inwards);
      if (inwards.length === 0) {
        toast.error('No available stock found for this query.');
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to search stock.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelect = (inward: any) => {
    onSelect(inward._id, inward.clientId._id);
    onClose();
  };

  const toggleSelection = (inward: any) => {
    if (selectedInwards.some(inv => inv._id === inward._id)) {
      setSelectedInwards(selectedInwards.filter(inv => inv._id !== inward._id));
    } else {
      setSelectedInwards([...selectedInwards, inward]);
    }
  };

  const handleSelectMultiple = () => {
    if (selectedInwards.length === 0) return;
    if (onSelectMultiple) {
      onSelectMultiple(selectedInwards);
    }
    setSelectedInwards([]);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        setSelectedInwards([]);
        onClose();
      }
    }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Search Available Stock</DialogTitle>
          <DialogDescription>Search for stock by Receipt No. or LOT No. that is available for ownership transfer.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSearch} className="space-y-4 pt-4">
          <div className="flex gap-2 items-center flex-wrap sm:flex-nowrap">
            <Select value={searchBy} onValueChange={(val: any) => setSearchBy(val)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Search By" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="receipt">Receipt No.</SelectItem>
                <SelectItem value="lot">LOT No.</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder={searchBy === 'receipt' ? "Enter Receipt No..." : "Enter LOT No..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 min-w-[200px]"
              autoFocus
            />
            <Button type="submit" disabled={isSearching || !searchQuery.trim()}>
              {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
              Search
            </Button>
          </div>

          {hasSearched && searchResults.length === 0 && !isSearching && (
            <div className="text-center py-6 text-slate-500">
              No available stock found matching '{searchQuery}'.
            </div>
          )}

          {searchResults.length > 0 && (
            <div className="space-y-3 mt-4">
              <div className="flex justify-between items-end border-b pb-2">
                <h3 className="font-medium text-slate-900">Search Results ({searchResults.length})</h3>
                {onSelectMultiple && selectedInwards.length > 0 && (
                  <Button type="button" onClick={handleSelectMultiple} className="bg-indigo-600 hover:bg-indigo-700 h-8">
                    Add Selected ({selectedInwards.length})
                  </Button>
                )}
              </div>
              <div className="grid gap-3">
                {searchResults.map((inward) => (
                  <div key={inward._id} className={`border rounded-md p-4 transition-colors ${selectedInwards.some(i => i._id === inward._id) ? 'bg-indigo-50 border-indigo-300 shadow-sm' : 'bg-slate-50 hover:bg-slate-100'}`}>
                    {onSelectMultiple && (
                      <div className="mb-3 pb-2 border-b border-slate-200/50">
                        <label className="flex items-center gap-2 cursor-pointer w-max">
                          <input 
                            type="checkbox" 
                            className="w-4 h-4 text-indigo-600 rounded border-gray-300 cursor-pointer"
                            checked={selectedInwards.some(i => i._id === inward._id)}
                            onChange={() => toggleSelection(inward)}
                          />
                          <span className="font-bold text-indigo-700 text-sm">Select for Batch Transfer</span>
                        </label>
                      </div>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm mb-3">
                      <div>
                        <div className="text-slate-500 text-xs uppercase font-bold">Receipt No</div>
                        <div className="font-medium text-slate-900">{inward.receiptNumber || '-'}</div>
                      </div>
                      <div>
                        <div className="text-slate-500 text-xs uppercase font-bold">LOT No</div>
                        <div className="font-medium text-slate-900">{inward.lotNo || '-'}</div>
                      </div>
                      <div>
                        <div className="text-slate-500 text-xs uppercase font-bold">Inward Date</div>
                        <div className="font-medium text-slate-900">{inward.date ? new Date(inward.date).toLocaleDateString('en-GB') : '-'}</div>
                      </div>
                      <div>
                        <div className="text-slate-500 text-xs uppercase font-bold">Client</div>
                        <div className="font-medium truncate text-slate-900" title={inward.clientId?.name}>{inward.clientId?.name || '-'}</div>
                      </div>
                    </div>
                    
                    <div className="bg-white border rounded p-3">
                      <div className="flex justify-between items-center mb-2 pb-2 border-b">
                        <span className="font-bold text-slate-800">
                          {inward.commodityId?.name} {inward.commodityId?.type ? `(${inward.commodityId.type})` : ''}
                        </span>
                        <div className="text-right">
                          <span className="text-indigo-700 font-bold mr-3">{inward.availableQty} {inward.commodityId?.unit || 'KG'}</span>
                          <span className="text-indigo-700 font-bold">{inward.availableBags} Bags</span>
                        </div>
                      </div>
                      
                      <div className="text-xs text-slate-600 space-y-1">
                        <div className="font-semibold text-slate-700 mb-1">Stock Locations:</div>
                        {inward.availableAllocations.map((alloc: any, idx: number) => (
                          <div key={idx} className="flex justify-between pl-2 border-l-2 border-indigo-200">
                            <span>Chamber {String(alloc.chamberName || alloc.chamberNo).replace(/^Chamber\s+/i, '')} / Floor {alloc.floorNo} / Stack {alloc.stackNo}</span>
                            <span>{alloc.allocatedWeight} {inward.commodityId?.unit || 'KG'} ({alloc.bagsCount} Bags)</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <Button 
                      className="w-full mt-3" 
                      onClick={() => handleSelect(inward)}
                      type="button"
                    >
                      Select this Stock
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
