import {
  deleteOfflineTransaction,
  getOfflineTransactions,
  markOfflineDraftDeleted,
  mergeSharedOfflineDrafts,
  updateOfflineTransaction,
  type OfflineTransaction,
  type SharedOfflineDraft,
} from '@/lib/offline-db';

interface DraftListResponse {
  allowedTypes?: OfflineTransaction['type'][];
  drafts?: SharedOfflineDraft[];
  submittedTransactionIds?: string[];
  error?: string;
}

interface DraftMutationResponse {
  success?: boolean;
  draft?: SharedOfflineDraft;
  error?: string;
}

const activeSyncs = new Map<string, Promise<void>>();

async function readJson<T>(response: Response): Promise<T> {
  try {
    return await response.json() as T;
  } catch {
    throw new Error(`The draft server returned an invalid response (${response.status}).`);
  }
}

async function deleteSharedDraft(transactionId: string): Promise<void> {
  const response = await fetch('/api/offline/drafts', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    credentials: 'same-origin',
    body: JSON.stringify({ transactionId }),
  });
  if (response.status === 404) return;
  const result = await readJson<DraftMutationResponse>(response);
  if (!response.ok || !result.success) {
    throw new Error(result.error || `Draft deletion failed (${response.status}).`);
  }
}

async function uploadDraft(entry: OfflineTransaction): Promise<SharedOfflineDraft> {
  const response = await fetch('/api/offline/drafts', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    credentials: 'same-origin',
    body: JSON.stringify({
      transactionId: entry.transactionId,
      type: entry.type,
      payload: entry.payload,
      ...(entry.serverRevision === undefined ? {} : { expectedRevision: entry.serverRevision }),
    }),
  });
  const result = await readJson<DraftMutationResponse>(response);
  if (!response.ok || !result.success || !result.draft) {
    throw new Error(result.error || `Draft upload failed (${response.status}).`);
  }
  return result.draft;
}

async function refreshSharedDrafts(userId: string): Promise<void> {
  const response = await fetch('/api/offline/drafts', {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  const result = await readJson<DraftListResponse>(response);
  if (
    !response.ok ||
    !Array.isArray(result.drafts) ||
    !Array.isArray(result.allowedTypes) ||
    !Array.isArray(result.submittedTransactionIds)
  ) {
    throw new Error(result.error || `Shared draft refresh failed (${response.status}).`);
  }
  await mergeSharedOfflineDrafts(
    userId,
    result.drafts,
    result.allowedTypes,
    result.submittedTransactionIds,
  );
}

async function syncDraftsForUser(userId: string): Promise<void> {
  const entries = await getOfflineTransactions(userId);
  const now = Date.now();

  for (const entry of entries) {
    if (entry.deleted && entry.draftSyncState === 'DELETE_PENDING') {
      try {
        await deleteSharedDraft(entry.transactionId);
        await deleteOfflineTransaction(entry.transactionId);
      } catch (error) {
        console.error(`Unable to delete shared offline draft ${entry.transactionId}:`, error);
      }
      continue;
    }

    if (entry.status !== 'DRAFT' || entry.deleted) continue;
    const staleSync =
      entry.draftSyncState === 'SYNCING' &&
      now - new Date(entry.updatedAt).getTime() > 5 * 60 * 1000;
    if (
      entry.draftSyncState !== 'PENDING_SYNC' &&
      entry.draftSyncState !== 'FAILED' &&
      !staleSync
    ) continue;
    if (new Date(entry.nextAttemptAt).getTime() > now) continue;

    await updateOfflineTransaction(entry.transactionId, {
      draftSyncState: 'SYNCING',
      draftSyncError: undefined,
    });

    try {
      const saved = await uploadDraft(entry);
      await updateOfflineTransaction(entry.transactionId, {
        draftSyncState: 'SYNCED',
        draftSyncError: undefined,
        serverRevision: saved.revision,
        attempts: 0,
        nextAttemptAt: new Date().toISOString(),
      });
    } catch (error) {
      const attempts = entry.attempts + 1;
      const message = error instanceof Error ? error.message : 'Draft upload failed.';
      await updateOfflineTransaction(entry.transactionId, {
        draftSyncState: 'FAILED',
        draftSyncError: message,
        attempts,
        nextAttemptAt: new Date(
          Date.now() + Math.min(60_000, 1_000 * (2 ** Math.min(attempts - 1, 6))),
        ).toISOString(),
      });
      console.error(`Unable to upload shared offline draft ${entry.transactionId}:`, error);
    }
  }

  await refreshSharedDrafts(userId);
  window.dispatchEvent(new Event('offline-transactions-updated'));
}

export function syncOfflineDrafts(userId: string): Promise<void> {
  const existingSync = activeSyncs.get(userId);
  if (existingSync) return existingSync;

  const sync = syncDraftsForUser(userId).finally(() => {
    if (activeSyncs.get(userId) === sync) activeSyncs.delete(userId);
  });
  activeSyncs.set(userId, sync);
  return sync;
}

export async function removeOfflineDraft(entry: OfflineTransaction): Promise<void> {
  await markOfflineDraftDeleted(entry.transactionId);
  if (navigator.onLine && entry.serverRevision) {
    try {
      await deleteSharedDraft(entry.transactionId);
      await deleteOfflineTransaction(entry.transactionId);
    } catch (error) {
      window.dispatchEvent(new Event('offline-draft-sync-requested'));
      window.dispatchEvent(new Event('offline-transactions-updated'));
      throw error;
    }
  } else if (entry.serverRevision) {
    window.dispatchEvent(new Event('offline-draft-sync-requested'));
  }
  window.dispatchEvent(new Event('offline-transactions-updated'));
}

export async function retryOfflineDraftSync(entry: OfflineTransaction): Promise<void> {
  await updateOfflineTransaction(entry.transactionId, {
    draftSyncState: 'PENDING_SYNC',
    draftSyncError: undefined,
    nextAttemptAt: new Date().toISOString(),
  });
  window.dispatchEvent(new Event('offline-transactions-updated'));
  window.dispatchEvent(new Event('offline-draft-sync-requested'));
}
