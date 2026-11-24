'use client';

import { useState } from 'react';
import ColdAssayerList from './assayer-list';
import ColdAssayerForm from './assayer-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, X, Search } from 'lucide-react';
import { getColdAssayers } from '@/app/actions/cold-assayer-actions';

export default function ColdAssayerListWrapper({ initialAssayers }: { initialAssayers: any[] }) {
  const [assayers, setAssayers] = useState(initialAssayers);
  const [isAdding, setIsAdding] = useState(false);
  const [editingAssayer, setEditingAssayer] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const refreshData = async () => {
    const data = await getColdAssayers();
    setAssayers(data);
    setIsAdding(false);
    setEditingAssayer(null);
  };

  const filteredAssayers = assayers.filter(a => {
    const query = searchQuery.toLowerCase();
    return (
      (a.name && a.name.toLowerCase().includes(query)) ||
      (a.licenceNumber && a.licenceNumber.toLowerCase().includes(query))
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-xl font-semibold text-slate-800">Assayers</h2>
        
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search name or licence..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 bg-white"
            />
          </div>
          
          <Button
            onClick={() => {
              setEditingAssayer(null);
              setIsAdding(!isAdding);
            }}
            variant={isAdding ? "outline" : "default"}
            className={!isAdding ? "bg-cyan-700 hover:bg-cyan-800 text-white whitespace-nowrap" : "whitespace-nowrap"}
          >
            {isAdding ? <><X className="mr-2 h-4 w-4" /> Cancel</> : <><Plus className="mr-2 h-4 w-4" /> Add Assayer</>}
          </Button>
        </div>
      </div>

      {(isAdding || editingAssayer) && (
        <div className="mb-6">
          <ColdAssayerForm
            assayer={editingAssayer}
            onSuccess={refreshData}
            onCancel={() => {
              setIsAdding(false);
              setEditingAssayer(null);
            }}
          />
        </div>
      )}

      {!isAdding && !editingAssayer && (
        <ColdAssayerList
          assayers={filteredAssayers}
          onEdit={(assayer) => {
            setIsAdding(false);
            setEditingAssayer(assayer);
          }}
          onRefresh={refreshData}
        />
      )}
    </div>
  );
}
