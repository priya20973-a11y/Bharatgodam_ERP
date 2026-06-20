'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X } from 'lucide-react';
import { getCommodityOptions, getClientOptions, getWarehouseOptions } from '@/app/actions/reports';
import { useSession } from 'next-auth/react';
import { getDropdownDisplayName } from '@/lib/utils';

interface DataTableToolbarProps {
  filters: {
    warehouse?: string;
    commodity?: string;
    direction?: string;
    clientName?: string;
    startDate?: string;
    endDate?: string;
  };
  onFilterChange: (key: string, value: any) => void;
  onReset: () => void;
  isPending: boolean;
}

export function DataTableToolbar({ 
  filters, 
  onFilterChange, 
  onReset, 
  isPending 
}: DataTableToolbarProps) {
  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.role === 'ADMIN';
  
  const [commodityOptions, setCommodityOptions] = useState<{label: string, value: string; wspName?: string}[]>([]);
  const [clientOptions, setClientOptions] = useState<{label: string, value: string; wspName?: string}[]>([]);
  const [warehouseOptions, setWarehouseOptions] = useState<{label: string, value: string}[]>([]);
  const [isFetchingCommodities, setIsFetchingCommodities] = useState(true);
  const [isFetchingClients, setIsFetchingClients] = useState(true);
  const [isFetchingWarehouses, setIsFetchingWarehouses] = useState(true);

  useEffect(() => {
    const load = async () => {
      setIsFetchingCommodities(true);
      setIsFetchingClients(true);
      setIsFetchingWarehouses(true);
      try {
        const [commodityData, clientData, warehouseData] = await Promise.all([
          getCommodityOptions(),
          getClientOptions(),
          getWarehouseOptions()
        ]);
        setCommodityOptions(commodityData);
        setClientOptions(clientData);
        setWarehouseOptions(warehouseData);
        setIsFetchingCommodities(false);
        setIsFetchingClients(false);
        setIsFetchingWarehouses(false);
      } catch (error) {
        console.error('Failed to load options:', error);
        setIsFetchingCommodities(false);
        setIsFetchingClients(false);
        setIsFetchingWarehouses(false);
      }
    };
    load();
  }, []);

  // Check if any filter is active
  const isFiltered = filters.warehouse !== 'ALL' || filters.commodity !== 'ALL' || filters.direction !== 'ALL' || filters.clientName !== 'ALL' || filters.startDate !== '' || filters.endDate !== '';

  const handleWarehouseChange = (val: string) => {
    onFilterChange('warehouse', val);
  };

  const handleCommodityChange = (val: string) => {
    onFilterChange('commodity', val);
  };

  const handleDirectionChange = (val: string) => {
    onFilterChange('direction', val);
  };

  const handleClientChange = (val: string) => {
    onFilterChange('clientName', val);
  };

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 sticky top-4 z-10">
      <div className="flex flex-col sm:flex-row gap-4 items-end">
        <div className="space-y-1.5 w-full sm:w-auto">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Flow</label>
          <Select value={filters.direction || 'ALL'} onValueChange={handleDirectionChange} disabled={isPending}>
            <SelectTrigger className="font-semibold text-slate-700 w-full sm:w-[200px]">
              <SelectValue placeholder="All Flows" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL" className="font-medium">All Flows</SelectItem>
              <SelectItem value="INWARD" className="font-medium">Inward</SelectItem>
              <SelectItem value="OUTWARD" className="font-medium">Outward</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5 w-full sm:w-auto">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Client</label>
          <Select value={filters.clientName || 'ALL'} onValueChange={handleClientChange} disabled={isPending || isFetchingClients}>
            <SelectTrigger className="font-semibold text-slate-700 w-full sm:w-[200px]">
              {isFetchingClients ? (
                <span className="animate-pulse text-slate-400">Loading master DB...</span>
              ) : (
                <SelectValue placeholder="All Clients" />
              )}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL" className="font-medium">All Clients</SelectItem>
              {clientOptions.map((c) => (
                <SelectItem key={c.value} value={c.value} className="font-medium">
                  {getDropdownDisplayName(c, clientOptions, isAdmin)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5 w-full sm:w-auto">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Warehouse</label>
          <Select value={filters.warehouse || 'ALL'} onValueChange={handleWarehouseChange} disabled={isPending || isFetchingWarehouses}>
            <SelectTrigger className="font-semibold text-slate-700 w-full sm:w-[200px]">
              {isFetchingWarehouses ? (
                <span className="animate-pulse text-slate-400">Loading master DB...</span>
              ) : (
                <SelectValue placeholder="All Warehouses" />
              )}
            </SelectTrigger>
            <SelectContent>
              {warehouseOptions.map((w) => (
                <SelectItem key={w.value} value={w.value} className="font-medium">
                  {w.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5 w-full sm:w-auto">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Commodity</label>
          <Select value={filters.commodity || 'ALL'} onValueChange={handleCommodityChange} disabled={isPending || isFetchingCommodities}>
            <SelectTrigger className="font-semibold text-indigo-600 w-full sm:w-[200px]">
              {isFetchingCommodities ? (
                <span className="animate-pulse text-slate-400">Loading master DB...</span>
              ) : (
                <SelectValue placeholder="All Commodities" />
              )}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL" className="font-medium">All Commodities</SelectItem>
              {commodityOptions.map((c) => (
                <SelectItem key={c.value} value={c.value} className="font-medium">
                  {getDropdownDisplayName(c, commodityOptions, isAdmin)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5 w-full sm:w-auto">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Start Date</label>
          <Input 
            type="date" 
            value={filters.startDate || ''} 
            onChange={(e) => onFilterChange('startDate', e.target.value)}
            className="font-medium w-full sm:w-[150px]"
            disabled={isPending}
          />
        </div>

        <div className="space-y-1.5 w-full sm:w-auto">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">End Date</label>
          <Input 
            type="date" 
            value={filters.endDate || ''} 
            onChange={(e) => onFilterChange('endDate', e.target.value)}
            className="font-medium w-full sm:w-[150px]"
            disabled={isPending}
          />
        </div>

        {isFiltered && (
          <Button 
            variant="ghost" 
            onClick={onReset} 
            className="text-slate-500 font-bold hover:bg-slate-100 hover:text-slate-900"
            disabled={isPending}
          >
            <X className="h-4 w-4 mr-2" /> Reset Filters
          </Button>
        )}
      </div>
    </div>
  );
}
