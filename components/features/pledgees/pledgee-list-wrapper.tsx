'use client';

import { useState } from 'react';
import PledgeeList from './pledgee-list';
import PledgeeForm from './pledgee-form';
import { Button } from '@/components/ui/button';
import { Plus, X } from 'lucide-react';
import { getPledgees } from '@/app/actions/pledgee-actions';

export default function PledgeeListWrapper({ initialPledgees }: { initialPledgees: any[] }) {
  const [pledgees, setPledgees] = useState(initialPledgees);
  const [isAdding, setIsAdding] = useState(false);
  const [editingPledgee, setEditingPledgee] = useState<any>(null);

  const refreshData = async () => {
    const data = await getPledgees();
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
          className={!isAdding ? "bg-indigo-600 hover:bg-indigo-700 text-white" : ""}
        >
          {isAdding ? <><X className="mr-2 h-4 w-4" /> Cancel</> : <><Plus className="mr-2 h-4 w-4" /> Add Pledgee</>}
        </Button>
      </div>

      {(isAdding || editingPledgee) && (
        <div className="mb-6">
          <PledgeeForm
            pledgee={editingPledgee}
            onSuccess={refreshData}
          />
        </div>
      )}

      {!isAdding && !editingPledgee && (
        <PledgeeList
          pledgees={pledgees}
          onEdit={(pledgee) => {
            setIsAdding(false);
            setEditingPledgee(pledgee);
          }}
        />
      )}
    </div>
  );
}
