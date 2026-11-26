'use client';

import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import {
  countPendingTransactions,
  saveReferenceRecords,
  saveAuthSnapshot,
} from '@/lib/offline-db';
import { syncOfflineDrafts } from '@/lib/offline-draft-sync';

function subscribeToOnlineStatus(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function getOnlineStatus() {
  return typeof navigator === 'undefined' || navigator.onLine;
}

export default function OfflineRuntime() {
  const { data: session, status } = useSession();
  const online = useSyncExternalStore(subscribeToOnlineStatus, getOnlineStatus, () => true);
  const [pendingCount, setPendingCount] = useState(0);
  const [offlineStorageAvailable, setOfflineStorageAvailable] = useState(true);

  const refreshPendingCount = useCallback(async () => {
    const userId = session?.user?.id;
    if (!userId) {
      setPendingCount(0);
      return;
    }

    try {
      setPendingCount(await countPendingTransactions(userId));
    } catch (error) {
      console.error('Unable to read pending offline transactions:', error);
      setOfflineStorageAvailable(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      window.setTimeout(() => setOfflineStorageAvailable(false), 0);
      return;
    }

    if (process.env.NODE_ENV !== 'production') {
      void navigator.serviceWorker.getRegistrations()
        .then((registrations) =>
          Promise.all(
            registrations
              .filter((registration) =>
                [registration.active, registration.waiting, registration.installing]
                  .some((worker) =>
                    worker !== null &&
                    new URL(worker.scriptURL).pathname === '/sw.js',
                  ),
              )
              .map((registration) => registration.unregister()),
          ),
        )
        .catch((error) => {
          console.error('Unable to remove the development service worker:', error);
        });
      return;
    }

    if (!window.isSecureContext) {
      window.setTimeout(() => setOfflineStorageAvailable(false), 0);
      return;
    }

    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .catch((error) => {
        console.error('Unable to register the offline service worker:', error);
        setOfflineStorageAvailable(false);
      });
  }, []);

  useEffect(() => {
    if (status !== 'authenticated' || !session?.user?.id || !session.expires) return;

    const user = session.user as typeof session.user & {
      isStaff?: boolean;
      permissions?: Record<string, Record<string, boolean>>;
      assignedWarehouseIds?: string[];
      wspPermissions?: Record<string, unknown>;
    };
    const snapshot = {
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      storagePlan: user.storagePlan,
      isStaff: user.isStaff,
      permissions: user.permissions,
      assignedWarehouseIds: user.assignedWarehouseIds,
      wspPermissions: user.wspPermissions,
      expiresAt: session.expires,
      updatedAt: new Date().toISOString(),
    };

    saveAuthSnapshot(snapshot)
      .then(() => setOfflineStorageAvailable(true))
      .catch((error) => {
        console.error('Unable to save the offline authorization snapshot:', error);
        setOfflineStorageAvailable(false);
      });
  }, [session, status]);

  useEffect(() => {
    const userId = session?.user?.id;
    if (status !== 'authenticated' || !userId || !online) return;
    const authenticatedUserId = userId;

    const controller = new AbortController();
    async function prepareOfflineData() {
      try {
        const response = await fetch('/api/offline/bootstrap', {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) {
          if (response.status !== 403) {
            throw new Error(`Offline data download failed (${response.status}).`);
          }
          return;
        }

        const data = await response.json();
        if (data.userId !== authenticatedUserId) {
          throw new Error('Offline data belongs to a different authenticated user.');
        }

        await Promise.all([
          saveReferenceRecords(authenticatedUserId, 'warehouses', data.warehouses),
          saveReferenceRecords(authenticatedUserId, 'clients', data.clients),
          saveReferenceRecords(authenticatedUserId, 'commodities', data.commodities),
          saveReferenceRecords(authenticatedUserId, 'inwards', data.inwards),
          saveReferenceRecords(authenticatedUserId, 'outwardStock', data.outwardStock || []),
        ]);
        setOfflineStorageAvailable(true);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error('Unable to download authorized offline data:', error);
        setOfflineStorageAvailable(false);
      }
    }

    void prepareOfflineData();
    return () => controller.abort();
  }, [online, session?.user?.id, status]);

  useEffect(() => {
    const userId = session?.user?.id;
    if (status !== 'authenticated' || !userId || !online) return;

    const sync = () => {
      void syncOfflineDrafts(userId).catch((error) => {
        console.error('Unable to synchronize shared offline drafts:', error);
      });
    };
    const timeoutId = window.setTimeout(sync, 0);
    const intervalId = window.setInterval(sync, 30_000);
    window.addEventListener('offline-draft-sync-requested', sync);
    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
      window.removeEventListener('offline-draft-sync-requested', sync);
    };
  }, [online, session?.user?.id, status]);

  useEffect(() => {
    const startupTimeout = window.setTimeout(() => void refreshPendingCount(), 0);
    const intervalId = window.setInterval(() => void refreshPendingCount(), 5000);
    return () => {
      window.clearTimeout(startupTimeout);
      window.clearInterval(intervalId);
    };
  }, [refreshPendingCount]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-3 right-3 z-[100] flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold shadow-lg ${
        online ? 'bg-emerald-700 text-white' : 'bg-amber-700 text-white'
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${online ? 'bg-emerald-200' : 'bg-amber-200'}`} />
      <span>{online ? 'Online' : 'Offline'}</span>
      {pendingCount > 0 && <span>· {pendingCount} pending</span>}
      {!offlineStorageAvailable && <span>· Offline storage unavailable</span>}
      {(!online || pendingCount > 0) && (
        <a href="/offline" className="underline underline-offset-2">
          {online ? 'Review drafts' : 'Open offline workspace'}
        </a>
      )}
    </div>
  );
}
