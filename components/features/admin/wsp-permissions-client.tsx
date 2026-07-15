'use client';

import { useState } from 'react';
import { updateWspPermission } from '@/app/actions/wsp-permission-actions';
import { WspModuleId, WSP_MODULE_NAMES } from '@/lib/wsp-permissions';
import { toast } from 'react-hot-toast';
import { Search } from 'lucide-react';

interface WspData {
  id: string;
  companyName: string;
  email: string;
  wspPermissions: Record<string, boolean>;
}

export default function WspPermissionsClient({ initialWsps }: { initialWsps: WspData[] }) {
  const [wsps, setWsps] = useState<WspData[]>(initialWsps);
  const [searchTerm, setSearchTerm] = useState('');
  const [updating, setUpdating] = useState<string | null>(null);

  const modules = Object.entries(WSP_MODULE_NAMES) as [WspModuleId, string][];

  const handleToggle = async (wspId: string, moduleId: WspModuleId, currentValue: boolean) => {
    // Default is true if undefined, so if it's undefined, it's currently true, so next is false
    const newValue = !currentValue; 
    setUpdating(`${wspId}-${moduleId}`);
    
    // Optimistic UI update
    setWsps(prev => prev.map(wsp => {
      if (wsp.id === wspId) {
        return {
          ...wsp,
          wspPermissions: {
            ...wsp.wspPermissions,
            [moduleId]: newValue
          }
        };
      }
      return wsp;
    }));

    try {
      const result = await updateWspPermission(wspId, moduleId, newValue);
      if (result.success) {
        toast.success(`Permission updated for ${WSP_MODULE_NAMES[moduleId]}`);
      } else {
        toast.error(result.message || 'Failed to update permission');
        // Revert optimistic update
        setWsps(prev => prev.map(wsp => {
          if (wsp.id === wspId) {
            return {
              ...wsp,
              wspPermissions: {
                ...wsp.wspPermissions,
                [moduleId]: currentValue
              }
            };
          }
          return wsp;
        }));
      }
    } catch (error) {
      toast.error('An unexpected error occurred');
    } finally {
      setUpdating(null);
    }
  };

  const filteredWsps = wsps.filter(wsp => 
    wsp.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    wsp.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200">
      <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
        <div className="relative max-w-sm w-full">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-md leading-5 bg-white placeholder-slate-500 focus:outline-none focus:placeholder-slate-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            placeholder="Search WSPs by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider sticky left-0 bg-slate-50 z-10 border-r border-slate-200 shadow-[1px_0_0_0_#e2e8f0]">
                WSP details
              </th>
              {modules.map(([id, name]) => (
                <th key={id} scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider min-w-[160px]">
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {filteredWsps.length === 0 ? (
              <tr>
                <td colSpan={modules.length + 1} className="px-6 py-12 text-center text-slate-500">
                  No Dry Storage WSPs found.
                </td>
              </tr>
            ) : (
              filteredWsps.map((wsp) => (
                <tr key={wsp.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap sticky left-0 bg-white border-r border-slate-200 z-10 shadow-[1px_0_0_0_#e2e8f0]">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-slate-900">{wsp.companyName}</span>
                      <span className="text-xs text-slate-500">{wsp.email}</span>
                    </div>
                  </td>
                  
                  {modules.map(([id]) => {
                    // Default to true if not explicitly false
                    const currentValue = wsp.wspPermissions?.[id] !== false;
                    const isUpdating = updating === `${wsp.id}-${id}`;
                    
                    return (
                      <td key={id} className="px-6 py-4 whitespace-nowrap">
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            className="sr-only peer"
                            checked={currentValue}
                            disabled={isUpdating}
                            onChange={() => handleToggle(wsp.id, id, currentValue)}
                          />
                          <div className={`w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${currentValue ? 'bg-blue-600' : ''} ${isUpdating ? 'opacity-50' : ''}`}></div>
                        </label>
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
