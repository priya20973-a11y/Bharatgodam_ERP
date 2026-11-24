'use client';

import { useState } from 'react';
import ColdPledgeeList from './pledgee-list';
import ColdPledgeeForm from './pledgee-form';
import { Button } from '@/components/ui/button';
import { Plus, X } from 'lucide-react';
import { getColdPledgees } from '@/app/actions/cold-pledgee-actions';

export default function ColdPledgeeListWrapper({ initialPledgees }: { initialPledgees: any[] }) {
  const [pledgees, setPledgees] = useState(initialPledgees);
  const [isAdding, setIsAdding] = useState(false);
  const [editingPledgee, setEditingPledgee] = useState<any>(null);

  const refreshData = async () => {
    const data = await getColdPledgees();
    setPledgees(data);
    setIsAdding(false);
    setEditingPledgee(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-slate-800">Pledgees</h2>
        <Button
          onClick={() => {
            setEditingPledgee(null);
            setIsAdding(!isAdding);
          }}
          variant={isAdding ? "outline" : "default"}
          className={!isAdding ? "bg-cyan-700 hover:bg-cyan-800 text-white" : ""}
        >
          {isAdding ? <><X className="mr-2 h-4 w-4" /> Cancel</> : <><Plus className="mr-2 h-4 w-4" /> Add Pledgee</>}
        </Button>
      </div>

      {(isAdding || editingPledgee) && (
        <div className="mb-6">
          <ColdPledgeeForm
            pledgee={editingPledgee}
            onSuccess={refreshData}
            onCancel={() => {
              setIsAdding(false);
              setEditingPledgee(null);
            }}
          />
        </div>
      )}

      {!isAdding && !editingPledgee && (
        <ColdPledgeeList
          pledgees={pledgees}
          onEdit={(pledgee) => {
            setIsAdding(false);
            setEditingPledgee(pledgee);
          }}
          onRefresh={refreshData}
        />
      )}
    </div>
  );
}
