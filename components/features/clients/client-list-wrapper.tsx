'use client';

import { useState } from 'react';
import ClientList from './client-list';
import ClientForm from './client-form';
import { Button } from '@/components/ui/button';
import { UserPlus2, X } from 'lucide-react';
import { getClients } from '@/app/actions/client-actions';
import { Toaster } from 'react-hot-toast';

export default function ClientListWrapper({ initialClients }: { initialClients: any[] }) {
  const [clients, setClients] = useState(initialClients);
  const [isAdding, setIsAdding] = useState(false);
  const [editingClient, setEditingClient] = useState<any>(null);

  const refreshData = async () => {
    const data = await getClients();
    setClients(data);
    setIsAdding(false);
    setEditingClient(null);
  };

  return (
    <div className="space-y-4">
      <Toaster />
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Business Partners</h2>
        <Button 
          onClick={() => {
            setEditingClient(null);
            setIsAdding(!isAdding);
          }}
          variant={isAdding ? "outline" : "default"}
        >
          {isAdding ? <><X className="mr-2 h-4 w-4" /> Cancel</> : <><UserPlus2 className="mr-2 h-4 w-4" /> Register Client</>}
        </Button>
      </div>

      {(isAdding || editingClient) && (
        <div className="mb-6">
          <ClientForm 
            client={editingClient} 
            onSuccess={refreshData} 
          />
        </div>
      )}

      <ClientList 
        clients={clients} 
        onEdit={(client) => {
          setIsAdding(false);
          setEditingClient({
            id: client._id,
            name: client.name,
            address: client.address,
            clientType: client.clientType,
            mobile: client.mobile,
            panNumber: client.panNumber || '',
            aadharNumber: client.aadharNumber || '',
            gstNumber: client.gstNumber || ''
          });
        }} 
      />
    </div>
  );
}
