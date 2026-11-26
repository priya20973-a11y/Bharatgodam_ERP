import {
  claimOfflineTransactionForSubmit,
  updateOfflineTransaction,
  type OfflineTransaction,
} from '@/lib/offline-db';

interface OfflineSyncResponse {
  success?: boolean;
  data?: unknown;
  error?: string;
}

export async function submitOfflineTransactionDraft(
  transactionId: string,
  userId: string,
  type: OfflineTransaction['type'],
): Promise<{ success: boolean; error?: string }> {
  const entry = await claimOfflineTransactionForSubmit(transactionId, userId, type);
  if (!entry) {
    return { success: false, error: 'This transaction is already being submitted or is unavailable.' };
  }

  try {
    const response = await fetch('/api/offline/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        transactionId: entry.transactionId,
        type: entry.type,
        payload: entry.payload,
      }),
    });
    const result = await response.json() as OfflineSyncResponse;

    if (!response.ok || !result.success) {
      const error = result.error || `Transaction submission failed (${response.status}).`;
      await updateOfflineTransaction(transactionId, {
        status: 'DRAFT',
        attempts: entry.attempts + 1,
        lastError: error,
        submissionUncertain:
          response.status >= 500 || response.status === 429 || response.ok,
      });
      return { success: false, error };
    }

    await updateOfflineTransaction(transactionId, {
      status: 'SYNCED',
      attempts: 0,
      serverResult: result.data,
      lastError: undefined,
      submissionUncertain: false,
    });
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Transaction submission failed.';
    await updateOfflineTransaction(transactionId, {
      status: 'DRAFT',
      attempts: entry.attempts + 1,
      lastError: message,
      submissionUncertain: true,
    });
    return { success: false, error: message };
  } finally {
    window.dispatchEvent(new Event('offline-transactions-updated'));
  }
}

export async function submitOfflineColdInwardDraft(
  transactionId: string,
  userId: string,
): Promise<{ success: boolean; error?: string }> {
  return submitOfflineTransactionDraft(transactionId, userId, 'COLD_INWARD');
}
