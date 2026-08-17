'use client';

import { useState, useEffect } from 'react';
import LotCreateForm from './lot-create-form';
import AllocationModal from './allocation-modal';
import { getColdLots } from '@/app/actions/cold-allocation-actions';
import { Button } from '@/components/ui/button';

export default function LotList({ initialLots = [], warehouses = [] }: any) {
  const [lots, setLots] = useState(initialLots || []);
  const [selectedLot, setSelectedLot] = useState<any>(null);
  const [allocOpen, setAllocOpen] = useState(false);

  const refresh = async () => {
    const res = await getColdLots();
    if (res.success) setLots(res.data);
  };

  useEffect(() => {
    setLots(initialLots || []);
  }, [initialLots]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <LotCreateForm warehouses={warehouses} commodities={[]} clients={[]} onSuccess={refresh} />
        <div className="p-4 border rounded-lg bg-white">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold">Existing Lots</h4>
            <Button onClick={refresh} variant="outline">Refresh</Button>
          </div>
          <div className="space-y-2">
            {lots.map((l: any) => (
              <div key={l._id} className="p-3 border rounded-md flex justify-between items-center">
                <div>
                  <div className="font-medium">{l.lotNo}</div>
                  <div className="text-xs text-slate-500">Total: {l.totalQuantityKg} Kg • Remaining: {l.remainingQuantityKg} Kg</div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => { setSelectedLot(l); setAllocOpen(true); }}>Allocate</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {selectedLot && (
        <AllocationModal isOpen={allocOpen} onClose={() => setAllocOpen(false)} warehouses={warehouses} lot={selectedLot} onSuccess={refresh} />
      )}
    </div>
  );
}
