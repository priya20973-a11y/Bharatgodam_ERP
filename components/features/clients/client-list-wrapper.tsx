'use client';

import { useState } from 'react';
import ClientList from './client-list';
import ClientForm from './client-form';
import { ClientBulkUpload } from './client-bulk-upload';
import { Button } from '@/components/ui/button';
import { UserPlus2, Upload, X } from 'lucide-react';
import { getClients, deleteClient } from '@/app/actions/client-actions';
import { toast, Toaster } from 'react-hot-toast';
import { useColdTranslation } from '@/components/providers/cold-language-provider';

export default function ClientListWrapper({ initialClients, initialCommodities, isColdStorage = false }: { initialClients: any[]; initialCommodities: any[]; isColdStorage?: boolean }) {
  const { t } = useColdTranslation();
  const [clients, setClients] = useState(initialClients);
  const [isAdding, setIsAdding] = useState(false);
  const [isBulkUploading, setIsBulkUploading] = useState(false);
  const [editingClient, setEditingClient] = useState<any>(null);

  const refreshData = async () => {
    const data = await getClients();
    setClients(data);
    setIsAdding(false);
    setIsBulkUploading(false);
    setEditingClient(null);
  };

  const handleDelete = async (id: string) => {
    if (confirm(t('clients.deleteConfirm'))) {
      const res = await deleteClient(id);
      if (res.success) {
        toast.success(t('clients.deleteSuccess'));
        refreshData();
      } else {
        toast.error(res.error || t('clients.deleteFailed'));
      }
    }
  };

  return (
    <div className="space-y-4">
      <Toaster />
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">{t('clients.businessPartners')}</h2>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => {
              setEditingClient(null);
              setIsAdding(false);
              setIsBulkUploading(!isBulkUploading);
            }}
            variant={isBulkUploading ? "outline" : "secondary"}
          >
            {isBulkUploading ? <><X className="mr-2 h-4 w-4" /> {t('common.cancel')}</> : <><Upload className="mr-2 h-4 w-4" /> Bulk Upload</>}
          </Button>
          <Button
            onClick={() => {
              setEditingClient(null);
              setIsBulkUploading(false);
              setIsAdding(!isAdding);
            }}
            variant={isAdding ? "outline" : "default"}
          >
            {isAdding ? <><X className="mr-2 h-4 w-4" /> {t('common.cancel')}</> : <><UserPlus2 className="mr-2 h-4 w-4" /> {t('clients.registerClient')}</>}
          </Button>
        </div>
      </div>

      {isBulkUploading && (
        <div className="mb-6">
          <ClientBulkUpload onSuccess={refreshData} />
        </div>
      )}

      {(isAdding || editingClient) && (
        <div className="mb-6">
          <ClientForm
            client={editingClient}
            availableCommodities={initialCommodities}
            onSuccess={refreshData}
            isColdStorage={isColdStorage}
          />
        </div>
      )}

      {!isBulkUploading && !isAdding && !editingClient && (
        <ClientList
          clients={clients}
          commodities={initialCommodities}
          onEdit={(client) => {
            setIsAdding(false);
            setIsBulkUploading(false);
            setEditingClient({
              id: client._id,
              name: client.name,
              address: client.address,
              clientType: client.clientType,
              mobile: client.mobile,
              panNumber: client.panNumber || '',
              aadharNumber: client.aadharNumber || '',
              gstNumber: client.gstNumber || '',
              commodityIds: client.commodityIds || [],
              email: client.email || client.userEmail || '',
              state: client.state || '',
            });
          }}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
