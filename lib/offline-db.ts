export type OfflineTransactionStatus =
  | 'DRAFT'
  | 'PENDING_SYNC'
  | 'SYNCING'
  | 'SYNCED'
  | 'FAILED';

export type OfflineDraftSyncState =
  | 'PENDING_SYNC'
  | 'SYNCING'
  | 'SYNCED'
  | 'FAILED'
  | 'DELETE_PENDING';

export interface OfflineAuthSnapshot {
  userId: string;
  email?: string | null;
  fullName?: string | null;
  role?: string | null;
  storagePlan?: string | null;
  isStaff?: boolean;
  permissions?: Record<string, Record<string, boolean>>;
  assignedWarehouseIds?: string[];
  wspPermissions?: Record<string, unknown>;
  expiresAt: string;
  updatedAt: string;
}

export interface OfflineTransaction {
  transactionId: string;
  userId: string;
  type: 'COLD_INWARD' | 'COLD_OUTWARD';
  payload: Record<string, unknown>;
  status: OfflineTransactionStatus;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  nextAttemptAt: string;
  lastError?: string;
  submissionUncertain?: boolean;
  serverResult?: unknown;
  draftSyncState?: OfflineDraftSyncState;
  draftSyncError?: string;
  serverRevision?: number;
  deleted?: boolean;
}

export interface SharedOfflineDraft {
  transactionId: string;
  type: OfflineTransaction['type'];
  payload: Record<string, unknown>;
  status: 'DRAFT';
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface OfflineReferenceRecord {
  key: string;
  userId: string;
  kind: 'warehouses' | 'clients' | 'commodities' | 'inwards' | 'outwardStock';
  value: unknown;
  updatedAt: string;
}

const DATABASE_NAME = 'bharatgodam-offline';
const DATABASE_VERSION = 1;

let databasePromise: Promise<IDBDatabase> | undefined;

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available in this browser.'));
  }

  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains('auth')) {
          database.createObjectStore('auth', { keyPath: 'userId' });
        }
        if (!database.objectStoreNames.contains('references')) {
          const references = database.createObjectStore('references', { keyPath: 'key' });
          references.createIndex('byUser', 'userId');
          references.createIndex('byUserAndKind', ['userId', 'kind']);
        }
        if (!database.objectStoreNames.contains('transactions')) {
          const transactions = database.createObjectStore('transactions', {
            keyPath: 'transactionId',
          });
          transactions.createIndex('byUser', 'userId');
          transactions.createIndex('byUserAndStatus', ['userId', 'status']);
          transactions.createIndex('byUserAndNextAttempt', ['userId', 'nextAttemptAt']);
        }
      };

      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => {
          database.close();
          databasePromise = undefined;
        };
        resolve(database);
      };
      request.onerror = () => {
        databasePromise = undefined;
        reject(request.error ?? new Error('Unable to open the offline database.'));
      };
      request.onblocked = () => {
        reject(new Error('Offline database upgrade is blocked by another open tab.'));
      };
    });
  }

  return databasePromise;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

export async function saveAuthSnapshot(snapshot: OfflineAuthSnapshot): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction('auth', 'readwrite');
  transaction.objectStore('auth').put(snapshot);
  await transactionDone(transaction);
}

export async function getAuthSnapshot(userId: string): Promise<OfflineAuthSnapshot | undefined> {
  const database = await openDatabase();
  const transaction = database.transaction('auth', 'readonly');
  return requestResult(transaction.objectStore('auth').get(userId));
}

export async function getLatestAuthSnapshot(): Promise<OfflineAuthSnapshot | undefined> {
  const database = await openDatabase();
  const transaction = database.transaction('auth', 'readonly');
  const snapshots = await requestResult(transaction.objectStore('auth').getAll());
  return snapshots.sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  )[0];
}

export async function saveReferenceRecords(
  userId: string,
  kind: OfflineReferenceRecord['kind'],
  values: unknown[],
): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction('references', 'readwrite');
  const store = transaction.objectStore('references');
  const index = store.index('byUserAndKind');
  const keysRequest = index.getAllKeys(IDBKeyRange.only([userId, kind]));
  keysRequest.onsuccess = () => {
    keysRequest.result.forEach((key) => store.delete(key));
    const updatedAt = new Date().toISOString();
    values.forEach((value, indexValue) => {
      store.put({
        key: `${userId}:${kind}:${indexValue}`,
        userId,
        kind,
        value,
        updatedAt,
      } satisfies OfflineReferenceRecord);
    });
  };
  keysRequest.onerror = () => {
    transaction.abort();
  };
  await transactionDone(transaction);
}

export async function getReferenceRecords<T>(
  userId: string,
  kind: OfflineReferenceRecord['kind'],
): Promise<T[]> {
  const database = await openDatabase();
  const transaction = database.transaction('references', 'readonly');
  const records = await requestResult(
    transaction.objectStore('references').index('byUserAndKind').getAll(
      IDBKeyRange.only([userId, kind]),
    ),
  ) as OfflineReferenceRecord[];
  return records.map((record) => record.value as T);
}

export async function enqueueOfflineTransaction(
  entry: Omit<OfflineTransaction, 'status' | 'createdAt' | 'updatedAt' | 'attempts' | 'nextAttemptAt'> & {
    status?: OfflineTransactionStatus;
  },
): Promise<OfflineTransaction> {
  const now = new Date().toISOString();
  const transactionEntry: OfflineTransaction = {
    ...entry,
    status: entry.status ?? 'PENDING_SYNC',
    createdAt: now,
    updatedAt: now,
    attempts: 0,
    nextAttemptAt: now,
    draftSyncState: entry.draftSyncState ?? 'PENDING_SYNC',
  };
  const database = await openDatabase();
  const transaction = database.transaction('transactions', 'readwrite');
  transaction.objectStore('transactions').add(transactionEntry);
  await transactionDone(transaction);
  return transactionEntry;
}

export async function getOfflineTransactions(
  userId: string,
): Promise<OfflineTransaction[]> {
  const database = await openDatabase();
  const transaction = database.transaction('transactions', 'readonly');
  return requestResult(
    transaction.objectStore('transactions').index('byUser').getAll(userId),
  );
}

export async function mergeSharedOfflineDrafts(
  userId: string,
  drafts: SharedOfflineDraft[],
  allowedTypes: OfflineTransaction['type'][],
  submittedTransactionIds: string[] = [],
): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction('transactions', 'readwrite');
  const store = transaction.objectStore('transactions');
  const done = transactionDone(transaction);
  const request = store.index('byUser').getAll(userId);

  request.onsuccess = () => {
    const localEntries = request.result as OfflineTransaction[];
    const localById = new Map(localEntries.map((entry) => [entry.transactionId, entry]));
    const sharedIds = new Set<string>();
    const submittedIds = new Set(submittedTransactionIds);

    localEntries.forEach((entry) => {
      if (submittedIds.has(entry.transactionId) && entry.status !== 'SYNCED') {
        store.delete(entry.transactionId);
      }
    });

    drafts.forEach((draft) => {
      if (draft.status !== 'DRAFT' || !allowedTypes.includes(draft.type)) return;
      sharedIds.add(draft.transactionId);
      const local = localById.get(draft.transactionId);
      if (local?.deleted || (
        local &&
        (local.status !== 'DRAFT' || local.draftSyncState !== 'SYNCED')
      )) return;

      store.put({
        transactionId: draft.transactionId,
        userId,
        type: draft.type,
        payload: draft.payload,
        status: 'DRAFT',
        createdAt: draft.createdAt,
        updatedAt: draft.updatedAt,
        attempts: local?.attempts ?? 0,
        nextAttemptAt: local?.nextAttemptAt ?? draft.updatedAt,
        draftSyncState: 'SYNCED',
        serverRevision: draft.revision,
      } satisfies OfflineTransaction);
    });

    localEntries.forEach((entry) => {
      if (
        entry.status === 'DRAFT' &&
        entry.draftSyncState === 'SYNCED' &&
        !entry.deleted &&
        allowedTypes.includes(entry.type) &&
        !sharedIds.has(entry.transactionId)
      ) {
        store.delete(entry.transactionId);
      }
    });
  };
  request.onerror = () => transaction.abort();
  await done;
}

export async function deleteOfflineTransaction(transactionId: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction('transactions', 'readwrite');
  transaction.objectStore('transactions').delete(transactionId);
  await transactionDone(transaction);
}

export async function markOfflineDraftDeleted(transactionId: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction('transactions', 'readwrite');
  const store = transaction.objectStore('transactions');
  const request = store.get(transactionId);
  const done = transactionDone(transaction);

  request.onsuccess = () => {
    const entry = request.result as OfflineTransaction | undefined;
    if (!entry) {
      transaction.abort();
      return;
    }

    if (!entry.serverRevision) {
      store.delete(transactionId);
      return;
    }

    store.put({
      ...entry,
      deleted: true,
      draftSyncState: 'DELETE_PENDING',
      draftSyncError: undefined,
      updatedAt: new Date().toISOString(),
    });
  };
  request.onerror = () => transaction.abort();
  await done;
}

export async function claimOfflineTransactionForSubmit(
  transactionId: string,
  userId: string,
  type: OfflineTransaction['type'],
): Promise<OfflineTransaction | undefined> {
  const database = await openDatabase();
  const transaction = database.transaction('transactions', 'readwrite');
  const store = transaction.objectStore('transactions');
  const done = transactionDone(transaction);
  const request = store.get(transactionId);
  let claimed: OfflineTransaction | undefined;

  request.onsuccess = () => {
    const entry = request.result as OfflineTransaction | undefined;
    if (!entry || entry.userId !== userId || entry.type !== type) return;

    const staleSync =
      entry.status === 'SYNCING' &&
      Date.now() - new Date(entry.updatedAt).getTime() > 5 * 60 * 1000;
    if (
      entry.status !== 'DRAFT' &&
      entry.status !== 'PENDING_SYNC' &&
      entry.status !== 'FAILED' &&
      !staleSync
    ) return;

    claimed = {
      ...entry,
      status: 'SYNCING',
      updatedAt: new Date().toISOString(),
    };
    store.put(claimed);
  };
  request.onerror = () => transaction.abort();
  await done;
  return claimed;
}

export async function claimOfflineInwardDraftForSubmit(
  transactionId: string,
  userId: string,
): Promise<OfflineTransaction | undefined> {
  return claimOfflineTransactionForSubmit(transactionId, userId, 'COLD_INWARD');
}

export async function countPendingTransactions(userId: string): Promise<number> {
  const entries = await getOfflineTransactions(userId);
  return entries.filter(
    (entry) =>
      !entry.deleted &&
      entry.status !== 'SYNCED' &&
      !(
        entry.status === 'DRAFT' &&
        entry.draftSyncState === 'SYNCED' &&
        !entry.lastError &&
        !entry.submissionUncertain
      ),
  ).length;
}

export async function updateOfflineTransaction(
  transactionId: string,
  updates: Partial<OfflineTransaction>,
): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction('transactions', 'readwrite');
  const store = transaction.objectStore('transactions');
  const request = store.get(transactionId);
  const done = transactionDone(transaction);
  request.onsuccess = () => {
    if (!request.result) {
      transaction.abort();
      return;
    }
    store.put({
      ...request.result,
      ...updates,
      updatedAt: new Date().toISOString(),
    });
  };
  request.onerror = () => transaction.abort();
  await done;
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction was aborted.'));
  });
}
