'use client';

import { useState, useMemo } from 'react';
import ClientList from './client-list';
import ClientForm from './client-form';
import { ClientBulkUpload } from './client-bulk-upload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserPlus2, Upload, X, Search } from 'lucide-react';
import { getClients, deleteClient } from '@/app/actions/client-actions';
import { toast, Toaster } from 'react-hot-toast';
import { useColdTranslation } from '@/components/providers/cold-language-provider';

export default function ClientListWrapper({ initialClients, initialCommodities, isColdStorage = false }: { initialClients: any[]; initialCommodities: any[]; isColdStorage?: boolean }) {
  const { t } = useColdTranslation();
  const [clients, setClients] = useState(initialClients);
  const [searchQuery, setSearchQuery] = useState('');
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
      const res = await deleteClient(id, isColdStorage);
      if (res.success) {
        toast.success(t('clients.deleteSuccess'));
        refreshData();
      } else {
        toast.error(res.error || t('clients.deleteFailed'));
      }
    }
  };

  const filteredClients = useMemo(() => {
    if (!isColdStorage || !searchQuery.trim()) return clients;
    const q = searchQuery.trim().toLowerCase();
    return clients.filter((c: any) => {
      if (!c) return false;
      const nameMatch = c.name && String(c.name).toLowerCase().includes(q);
      const customIdMatch = c.customClientId && String(c.customClientId).toLowerCase().includes(q);
      const clientIdMatch = c.clientId && String(c.clientId).toLowerCase().includes(q);
      const idMatch = c._id && String(c._id).toLowerCase().includes(q);
      return Boolean(nameMatch || customIdMatch || clientIdMatch || idMatch);
    });
  }, [clients, searchQuery, isColdStorage]);

  return (
    <div className="space-y-4">
      <Toaster />
      <div className={isColdStorage ? "flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4" : "flex justify-between items-center"}>
        <h2 className="text-xl font-semibold">{t('clients.businessPartners')}</h2>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {isColdStorage && !isBulkUploading && !isAdding && !editingClient && (
            <div className="relative w-full sm:w-64 md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                type="text"
                placeholder={t('clients.searchPlaceholder') || "Search by client name or ID..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-8 h-9 text-sm bg-white"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
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
          <ClientBulkUpload onSuccess={refreshData} isColdStorage={isColdStorage} />
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
          clients={filteredClients}
          commodities={initialCommodities}
          searchQuery={isColdStorage ? searchQuery : undefined}
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
              customClientId: client.customClientId || '',
            });
          }}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
