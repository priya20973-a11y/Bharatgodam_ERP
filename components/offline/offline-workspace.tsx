'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ColdOutwardForm from '@/components/features/outward/cold-outward-form';
import {
  enqueueOfflineTransaction,
  getLatestAuthSnapshot,
  getOfflineTransactions,
  getReferenceRecords,
  updateOfflineTransaction,
  type OfflineAuthSnapshot,
  type OfflineTransaction,
} from '@/lib/offline-db';
import { submitOfflineTransactionDraft } from '@/lib/offline-inward-sync';
import { removeOfflineDraft, retryOfflineDraftSync } from '@/lib/offline-draft-sync';

interface OfflineWarehouse {
  _id: string;
  name: string;
  chambers?: Array<{
    name?: string;
    chamberNo?: number;
    floors?: Array<{
      name?: string;
      floorNo?: number;
      stacks?: Array<{ name?: string; stackNo?: number }>;
    }>;
  }>;
}

interface OfflineInward {
  _id: string;
  qrId?: string;
  lotNo?: string;
  quantityKg: number;
  bagsCount?: number;
  clientId: { _id?: string; name?: string } | string;
  commodityId: { _id?: string; name?: string } | string;
  warehouseId: { _id?: string; name?: string } | string;
  stackAllocations?: Array<Record<string, unknown>>;
  availableAllocations?: OfflineOutwardAllocation[];
  uniqueKey?: string;
  availableQty?: number;
  [key: string]: unknown;
}

interface OfflineOutwardAllocation {
  chamberName?: string;
  chamberNo?: number | string;
  floorNo?: number | string;
  stackNo?: number | string;
  allocatedWeight?: number;
  availableQty?: number;
  bagsCount?: number;
  [key: string]: unknown;
}

interface OfflineOutwardStockGroup {
  ownerId: string;
  isWarehouse: boolean;
  inwards: OfflineInward[];
}

interface OfflineStackAllocationDraft {
  id: string;
  chamberNo: string;
  floorNo: string;
  stackNo: string;
  allocatedWeight: string;
  allocatedBags: string;
}

function createEmptyStackAllocation(): OfflineStackAllocationDraft {
  return {
    id: crypto.randomUUID(),
    chamberNo: '',
    floorNo: '',
    stackNo: '',
    allocatedWeight: '',
    allocatedBags: '',
  };
}

function recordId(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && '_id' in value) {
    return String((value as { _id: unknown })._id);
  }
  return '';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? value as Record<string, unknown>
    : {};
}

function canUseOfflinePermission(
  user: OfflineAuthSnapshot,
  module: 'inward' | 'outward',
): boolean {
  const role = user.role?.toUpperCase();
  if (role === 'ADMIN' || role === 'SUPER_ADMIN' || (role === 'WSP' && !user.isStaff)) {
    return true;
  }
  return user.isStaff === true && user.permissions?.[module]?.create === true;
}

export default function OfflineWorkspace() {
  const [user, setUser] = useState<OfflineAuthSnapshot>();
  const [warehouses, setWarehouses] = useState<OfflineWarehouse[]>([]);
  const [clients, setClients] = useState<Array<Record<string, unknown>>>([]);
  const [commodities, setCommodities] = useState<Array<Record<string, unknown>>>([]);
  const [inwards, setInwards] = useState<OfflineInward[]>([]);
  const [outwardStock, setOutwardStock] = useState<OfflineOutwardStockGroup[]>([]);
  const [transactions, setTransactions] = useState<OfflineTransaction[]>([]);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [submittingDraftId, setSubmittingDraftId] = useState<string>();
  const [editingTransaction, setEditingTransaction] = useState<OfflineTransaction>();
  const [mode, setMode] = useState<'inward' | 'outward'>('inward');

  const [warehouseId, setWarehouseId] = useState('');
  const [clientId, setClientId] = useState('');
  const [commodityId, setCommodityId] = useState('');
  const [lotNo, setLotNo] = useState('');
  const [truckNo, setTruckNo] = useState('');
  const [inwardWeight, setInwardWeight] = useState('');
  const [inwardBags, setInwardBags] = useState('');
  const [inwardStackAllocations, setInwardStackAllocations] = useState<OfflineStackAllocationDraft[]>([
    {
      id: 'initial-stack',
      chamberNo: '',
      floorNo: '',
      stackNo: '',
      allocatedWeight: '',
      allocatedBags: '',
    },
  ]);

  const refreshTransactions = useCallback(async (userId: string) => {
    setTransactions(await getOfflineTransactions(userId));
  }, []);

  useEffect(() => {
    let active = true;
    async function loadWorkspace() {
      try {
        const snapshot = await getLatestAuthSnapshot();
        if (!active) return;
        if (!snapshot || new Date(snapshot.expiresAt).getTime() <= Date.now()) {
          setError('Offline access is unavailable or expired. Reconnect and sign in online.');
          return;
        }
        const [cachedWarehouses, cachedClients, cachedCommodities, cachedInwards, cachedOutwardStock] =
          await Promise.all([
            getReferenceRecords<OfflineWarehouse>(snapshot.userId, 'warehouses'),
            getReferenceRecords<Record<string, unknown>>(snapshot.userId, 'clients'),
            getReferenceRecords<Record<string, unknown>>(snapshot.userId, 'commodities'),
            getReferenceRecords<OfflineInward>(snapshot.userId, 'inwards'),
            getReferenceRecords<OfflineOutwardStockGroup>(snapshot.userId, 'outwardStock'),
          ]);
        if (!active) return;
        setUser(snapshot);
        setWarehouses(cachedWarehouses);
        setClients(cachedClients);
        setCommodities(cachedCommodities);
        setInwards(cachedInwards);
        setOutwardStock(cachedOutwardStock);
        await refreshTransactions(snapshot.userId);
      } catch (loadError) {
        console.error('Unable to open the offline workspace:', loadError);
        if (active) setError('Offline storage could not be opened on this device.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadWorkspace();
    return () => {
      active = false;
    };
  }, [refreshTransactions]);

  useEffect(() => {
    if (!user) return;
    const refresh = () => void refreshTransactions(user.userId);
    window.addEventListener('offline-transactions-updated', refresh);
    return () => window.removeEventListener('offline-transactions-updated', refresh);
  }, [refreshTransactions, user]);

  const selectedWarehouse = warehouses.find((warehouse) => warehouse._id === warehouseId);
  const visibleTransactions = transactions.filter((transaction) => {
    if (!user || transaction.deleted) return false;
    return canUseOfflinePermission(
      user,
      transaction.type === 'COLD_INWARD' ? 'inward' : 'outward',
    );
  });
  const pendingCount = visibleTransactions.filter((transaction) =>
    transaction.status !== 'SYNCED' &&
    !(
      transaction.status === 'DRAFT' &&
      transaction.draftSyncState === 'SYNCED' &&
      !transaction.lastError &&
      !transaction.submissionUncertain
    ),
  ).length;
  const effectiveOutwardStock = useMemo(() => {
    const groups = outwardStock.map((group) => ({
      ...group,
      inwards: group.inwards.map((inward) => ({
        ...inward,
        availableAllocations: (inward.availableAllocations || []).map((allocation) => ({ ...allocation })),
      })),
    }));

    transactions.forEach((transaction) => {
      if (
        transaction.type !== 'COLD_OUTWARD' ||
        transaction.deleted ||
        transaction.status === 'SYNCED' ||
        transaction.transactionId === editingTransaction?.transactionId
      ) return;
      const items = Array.isArray(transaction.payload.items)
        ? transaction.payload.items.map(asRecord)
        : [];
      items.forEach((item) => {
        const inwardId = recordId(item.inwardId);
        const stackKey = `${item.chamberName || item.chamberNo}_${item.floorNo}_${item.stackNo}`;
        groups.forEach((group) => {
          const inward = group.inwards.find((entry) => entry._id === inwardId);
          if (!inward) return;
          const allocation = inward.availableAllocations.find((entry) =>
            `${entry.chamberName || entry.chamberNo}_${entry.floorNo}_${entry.stackNo}` === stackKey,
          );
          if (!allocation) return;
          allocation.availableQty = Math.max(
            0,
            Number(allocation.availableQty ?? allocation.allocatedWeight) - (Number(item.quantityKg) || 0),
          );
          allocation.bagsCount = Math.max(
            0,
            Number(allocation.bagsCount) - (Number(item.bagsCount) || 0),
          );
          inward.availableAllocations = inward.availableAllocations.filter(
            (entry) => Number(entry.availableQty ?? entry.allocatedWeight) > 0,
          );
          inward.availableQty = inward.availableAllocations.reduce(
            (total, entry) => total + Number(entry.availableQty ?? entry.allocatedWeight),
            0,
          );
        });
      });
    });

    return groups.map((group) => ({
      ...group,
      inwards: group.inwards.filter((inward) => Number(inward.availableQty) > 0),
    }));
  }, [editingTransaction?.transactionId, outwardStock, transactions]);

  const resumeTransaction = useCallback((transaction: OfflineTransaction) => {
    if (transaction.status === 'SYNCED' || transaction.status === 'SYNCING') return;
    if (transaction.submissionUncertain) {
      setNotice('This submission may already have reached the server. Retry it unchanged to confirm before editing.');
      return;
    }

    const payload = transaction.payload;
    if (transaction.type === 'COLD_OUTWARD') {
      const savedItems = Array.isArray(payload.items) ? payload.items.map(asRecord) : [];
      const cachedIds = new Set(
        outwardStock.flatMap((group) => group.inwards.map((inward) => inward._id)),
      );
      if (savedItems.some((item) => !cachedIds.has(recordId(item.inwardId)))) {
        setNotice('This outward draft references stock that is not cached on this device. View or retry the saved draft, but do not edit it until stock data is downloaded again.');
        return;
      }
      setEditingTransaction(transaction);
      setMode('outward');
      setNotice('Resuming saved Outward draft.');
      return;
    }

    setEditingTransaction(transaction);
    setNotice('Resuming saved Inward draft.');

    if (transaction.type === 'COLD_INWARD') {
      const common = asRecord(payload.common);
      const savedClients = Array.isArray(payload.clients)
        ? payload.clients.map(asRecord)
        : [];
      const savedClient = savedClients[0] || {};
      const savedStacks = Array.isArray(savedClient.stacks)
        ? savedClient.stacks.map(asRecord)
        : [];
      const stackWeight = savedStacks.reduce(
        (total, stack) => total + (Number(stack.allocatedWeight) || 0),
        0,
      );
      const stackBags = savedStacks.reduce(
        (total, stack) => total + (Number(stack.allocatedBags) || 0),
        0,
      );
      const grossWeight = Number(common.grossWeight) || 0;
      const emptyWeight = Number(common.emptyWeight) || 0;

      setMode('inward');
      setWarehouseId(recordId(payload.warehouseId) || recordId(common.warehouseId));
      setClientId(recordId(savedClient.clientId));
      setCommodityId(recordId(savedClient.commodityId) || recordId(common.commodityId));
      setLotNo(String(savedClient.lotNo || ''));
      setTruckNo(String(common.truckNo || ''));
      setInwardWeight(String(
        stackWeight ||
        Number(savedClient.quantityKg) ||
        (grossWeight > emptyWeight ? grossWeight - emptyWeight : 0) ||
        Number(savedClient.grossWeight) ||
        '',
      ));
      setInwardBags(String(
        savedStacks.length > 0
          ? stackBags
          : Number(savedClient.bagsCount) || '',
      ));
      setInwardStackAllocations(savedStacks.length > 0
        ? savedStacks.map((stack) => ({
          id: crypto.randomUUID(),
          chamberNo: String(stack.chamberNo ?? stack.chamberName ?? ''),
          floorNo: String(stack.floorNo ?? ''),
          stackNo: String(stack.stackNo ?? ''),
          allocatedWeight: String(stack.allocatedWeight ?? ''),
          allocatedBags: String(stack.allocatedBags ?? stack.bagsCount ?? ''),
        }))
        : [createEmptyStackAllocation()]);
      return;
    }
  }, [outwardStock]);

  useEffect(() => {
    if (loading || !user || editingTransaction || transactions.length === 0) return;
    const transactionId = new URLSearchParams(window.location.search).get('resume');
    if (!transactionId) return;
    const transaction = transactions.find((entry) => entry.transactionId === transactionId);
    if (!transaction) return;
    const timeoutId = window.setTimeout(() => {
      resumeTransaction(transaction);
      window.history.replaceState({}, '', '/offline');
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [editingTransaction, loading, resumeTransaction, transactions, user]);

  async function queueTransaction(
    type: OfflineTransaction['type'],
    payload: Record<string, unknown>,
  ): Promise<boolean> {
    if (!user || submittingRef.current) return false;
    if (editingTransaction && editingTransaction.type !== type) {
      setNotice('Stop editing the current transaction before saving a different transaction.');
      return false;
    }
    submittingRef.current = true;
    setSubmitting(true);
    try {
      if (editingTransaction) {
        await updateOfflineTransaction(editingTransaction.transactionId, {
          payload,
          status: 'DRAFT',
          attempts: 0,
          nextAttemptAt: new Date().toISOString(),
          lastError: undefined,
          submissionUncertain: false,
          serverResult: undefined,
          draftSyncState: 'PENDING_SYNC',
          draftSyncError: undefined,
        });
        setEditingTransaction(undefined);
      } else {
        await enqueueOfflineTransaction({
          transactionId: crypto.randomUUID(),
          userId: user.userId,
          type,
          payload,
          status: 'DRAFT',
        });
      }
      await refreshTransactions(user.userId);
      window.dispatchEvent(new Event('offline-transactions-updated'));
      window.dispatchEvent(new Event('offline-draft-sync-requested'));
      setNotice('Saved as a draft. It will be shared across your devices when online; final submission remains manual.');
      return true;
    } catch (queueError) {
      console.error('Unable to save the offline transaction:', queueError);
      setNotice('The transaction was not saved. Check device storage and try again.');
      return false;
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const saveOutwardDraft = useCallback(async (
    payload: Record<string, unknown>,
    transactionId: string,
  ): Promise<boolean> => {
    if (!user || !canUseOfflinePermission(user, 'outward') || submittingRef.current) {
      setNotice('Your cached permissions do not allow this outward draft to be saved.');
      return false;
    }
    if (editingTransaction && (
      editingTransaction.type !== 'COLD_OUTWARD' ||
      editingTransaction.transactionId !== transactionId
    )) {
      setNotice('Stop editing the current transaction before saving another outward draft.');
      return false;
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      if (editingTransaction) {
        await updateOfflineTransaction(transactionId, {
          payload,
          status: 'DRAFT',
          attempts: 0,
          nextAttemptAt: new Date().toISOString(),
          lastError: undefined,
          submissionUncertain: false,
          serverResult: undefined,
          draftSyncState: 'PENDING_SYNC',
          draftSyncError: undefined,
        });
        setEditingTransaction(undefined);
      } else {
        await enqueueOfflineTransaction({
          transactionId,
          userId: user.userId,
          type: 'COLD_OUTWARD',
          payload,
          status: 'DRAFT',
        });
      }
      await refreshTransactions(user.userId);
      window.dispatchEvent(new Event('offline-transactions-updated'));
      window.dispatchEvent(new Event('offline-draft-sync-requested'));
      setNotice('Outward saved as a draft. It will be shared across your devices when online; final submission remains manual.');
      return true;
    } catch (saveError) {
      console.error('Unable to save the offline outward draft:', saveError);
      setNotice('The outward draft was not saved. Check device storage and try again.');
      return false;
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [editingTransaction, refreshTransactions, user]);

  const outwardFormInwards = effectiveOutwardStock.flatMap((group) => group.inwards);
  const outwardFormMode = {
    inwards: outwardFormInwards,
    draft: editingTransaction?.type === 'COLD_OUTWARD' ? editingTransaction : undefined,
    onSaveDraft: saveOutwardDraft,
  };

  function updateInwardStack(
    index: number,
    updates: Partial<OfflineStackAllocationDraft>,
  ) {
    setInwardStackAllocations((current) =>
      current.map((allocation, allocationIndex) =>
        allocationIndex === index ? { ...allocation, ...updates } : allocation,
      ),
    );
  }

  function addInwardStack() {
    setInwardStackAllocations((current) => [...current, createEmptyStackAllocation()]);
  }

  function removeInwardStack(index: number) {
    setInwardStackAllocations((current) =>
      current.filter((_, allocationIndex) => allocationIndex !== index),
    );
  }

  async function submitInward(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !canUseOfflinePermission(user, 'inward')) {
      setNotice('Your cached permissions do not allow inward transactions.');
      return;
    }
    const weight = Number(inwardWeight);
    const bags = Number(inwardBags);
    if (!warehouseId || !clientId || !commodityId || !lotNo.trim() || !truckNo.trim() ||
      !(weight > 0) || !(bags > 0) || !Number.isInteger(bags)) {
      setNotice('Complete all required inward fields with positive weight and bag counts.');
      return;
    }
    const client = clients.find((item) => String(item._id) === clientId);
    const allowedCommodities = client?.commodityIds;
    if (Array.isArray(allowedCommodities) && allowedCommodities.length > 0 &&
      !allowedCommodities.map(String).includes(commodityId)) {
      setNotice('This commodity is not assigned to the selected client in the cached data.');
      return;
    }
    if (inwards.some((inward) => inward.lotNo?.toLowerCase() === lotNo.trim().toLowerCase()) ||
      transactions.some((transaction) => {
        const payload = transaction.payload as { clients?: Array<{ lotNo?: string }> };
        return transaction.type === 'COLD_INWARD' &&
          transaction.transactionId !== editingTransaction?.transactionId &&
          transaction.status !== 'SYNCED' &&
          payload.clients?.some((item) => item.lotNo?.toLowerCase() === lotNo.trim().toLowerCase());
      })) {
      setNotice('This lot number already exists locally. Choose a different lot number.');
      return;
    }

    const selectedClient = clients.find((item) => String(item._id) === clientId);
    if (!selectedClient || !selectedWarehouse) {
      setNotice('The selected client or warehouse is not present in the cached data.');
      return;
    }

    const stackLocations = new Set<string>();
    const stackAllocations: Array<Record<string, unknown>> = [];
    const previousPayload = editingTransaction?.type === 'COLD_INWARD'
      ? editingTransaction.payload
      : {};
    const previousClients = Array.isArray(previousPayload.clients)
      ? previousPayload.clients.map(asRecord)
      : [];
    const previousStacks = Array.isArray(previousClients[0]?.stacks)
      ? (previousClients[0].stacks as unknown[]).map(asRecord)
      : [];
    for (const [index, allocation] of inwardStackAllocations.entries()) {
      const chamber = selectedWarehouse.chambers?.find(
        (item) => String(item.chamberNo ?? item.name) === allocation.chamberNo ||
          item.name === allocation.chamberNo,
      );
      const floor = chamber?.floors?.find(
        (item) => String(item.floorNo ?? item.name) === allocation.floorNo ||
          item.name === allocation.floorNo,
      );
      const stack = floor?.stacks?.find(
        (item) => String(item.stackNo ?? item.name) === allocation.stackNo ||
          item.name === allocation.stackNo,
      );

      if (!chamber || !floor || !stack) {
        setNotice('Choose a cached chamber, floor, and stack for every allocation.');
        return;
      }

      const locationKey = [
        chamber.chamberNo ?? chamber.name,
        floor.floorNo ?? floor.name,
        stack.stackNo ?? stack.name,
      ].join(':');
      if (stackLocations.has(locationKey)) {
        setNotice('Choose a different rack for each stack allocation.');
        return;
      }
      stackLocations.add(locationKey);

      const allocatedWeight = inwardStackAllocations.length === 1
        ? weight
        : Number(allocation.allocatedWeight);
      const allocatedBags = inwardStackAllocations.length === 1
        ? bags
        : Number(allocation.allocatedBags);
      if (!(allocatedWeight > 0) || !Number.isInteger(allocatedBags) || allocatedBags < 0) {
        setNotice('Each stack needs a positive weight and a whole-number bag allocation.');
        return;
      }

      stackAllocations.push({
        ...(previousStacks[index] || {}),
        chamberName: chamber.name || `Chamber ${chamber.chamberNo ?? ''}`.trim(),
        chamberNo: chamber.chamberNo ?? allocation.chamberNo,
        floorNo: floor.floorNo ?? allocation.floorNo,
        stackNo: stack.stackNo ?? allocation.stackNo,
        allocatedWeight,
        allocatedBags,
      });
    }

    if (inwardStackAllocations.length > 1) {
      const allocatedWeight = stackAllocations.reduce(
        (total, allocation) => total + Number(allocation.allocatedWeight),
        0,
      );
      const allocatedBags = stackAllocations.reduce(
        (total, allocation) => total + Number(allocation.allocatedBags),
        0,
      );
      if (Math.abs(allocatedWeight - weight) > 0.01 || allocatedBags !== bags) {
        setNotice('Stack allocations must add up to the total inward weight and bags.');
        return;
      }
    }

    const previousCommon = asRecord(previousPayload.common);
    const previousClient = previousClients[0] || {};
    const clientPayload = {
      ...previousClient,
      clientId,
      commodityId,
      lotNo: lotNo.trim(),
      stockType: previousClient.stockType ||
        (selectedClient.clientType === 'PURCHASE' ? 'Purchase' : 'Self'),
      bagsCount: bags,
      stacks: stackAllocations,
    };
    const payload = {
      ...previousPayload,
      common: {
        ...previousCommon,
        date: previousCommon.date || new Date().toISOString().slice(0, 10),
        warehouseId,
        truckNo: truckNo.trim(),
        grossWeight: Number(previousCommon.grossWeight) > 0
          ? previousCommon.grossWeight
          : weight,
        emptyWeight: previousCommon.emptyWeight ?? 0,
        sameCommodity: previousCommon.sameCommodity ?? true,
        commodityId: previousCommon.commodityId || commodityId,
      },
      warehouseId,
      clients: [clientPayload, ...previousClients.slice(1)],
    };
    await queueTransaction('COLD_INWARD', payload);
  }

  async function submitTransactionDraft(transaction: OfflineTransaction) {
    const transactionId = transaction.transactionId;
    if (!user || submittingDraftId) return;
    const transactionType = transaction.type === 'COLD_OUTWARD' ? 'outward' : 'inward';
    const confirmation = transactionType === 'outward'
      ? 'Submit this outward transaction now? The server will revalidate available stock.'
      : 'Submit this inward transaction now? This creates the final transaction.';
    if (!window.confirm(confirmation)) return;
    setSubmittingDraftId(transactionId);
    try {
      const result = await submitOfflineTransactionDraft(
        transactionId,
        user.userId,
        transaction.type,
      );
      setNotice(result.success
        ? `${transaction.type === 'COLD_INWARD' ? 'Inward' : 'Outward'} submitted successfully.`
        : result.error || 'Submission failed. The Draft is still saved on this device.');
      await refreshTransactions(user.userId);
    } catch (submitError) {
      console.error('Unable to submit the offline transaction draft:', submitError);
      setNotice('The Draft remains on this device, but its submission status could not be updated.');
    } finally {
      setSubmittingDraftId(undefined);
    }
  }

  async function deleteTransactionDraft(transaction: OfflineTransaction) {
    if (!window.confirm('Delete this draft from all devices?')) return;
    try {
      await removeOfflineDraft(transaction);
      await refreshTransactions(transaction.userId);
      setNotice('Draft deleted.');
    } catch (deleteError) {
      console.error('Unable to delete offline draft:', deleteError);
      setNotice('The draft could not be deleted. It remains available for retry.');
    }
  }

  async function retryDraftUpload(transaction: OfflineTransaction) {
    try {
      await retryOfflineDraftSync(transaction);
      setNotice('Retrying shared draft synchronization.');
    } catch (retryError) {
      console.error('Unable to retry shared draft synchronization:', retryError);
      setNotice('The draft could not be queued for synchronization.');
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 text-slate-900 sm:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-blue-700">Bharatgodam ERP</p>
            <h1 className="text-2xl font-bold">Cold storage offline workspace</h1>
          </div>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">
            Offline · {pendingCount} pending
          </span>
        </header>

        {loading ? (
          <p role="status">Loading this device&apos;s offline workspace…</p>
        ) : error ? (
          <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950">
            {error}
          </section>
        ) : user ? (
          <>
            <section className="rounded-lg border bg-white p-4 shadow-sm">
              <p className="font-medium">{user.fullName || user.email || 'Authorized user'}</p>
              <p className="mt-1 text-sm text-slate-600">
                Offline authorization expires {new Date(user.expiresAt).toLocaleString()}.
                Data reflects the last successful authorized download.
              </p>
            </section>

            <nav className="flex gap-2" aria-label="Offline transaction type">
              {canUseOfflinePermission(user, 'inward') && (
                <button type="button" disabled={editingTransaction?.type === 'COLD_OUTWARD'} onClick={() => setMode('inward')}
                  className={`rounded-md px-4 py-2 font-semibold ${mode === 'inward' ? 'bg-blue-700 text-white' : 'border bg-white'}`}>
                  Inward
                </button>
              )}
              {canUseOfflinePermission(user, 'outward') && (
                <button type="button" disabled={editingTransaction?.type === 'COLD_INWARD'} onClick={() => setMode('outward')}
                  className={`rounded-md px-4 py-2 font-semibold ${mode === 'outward' ? 'bg-blue-700 text-white' : 'border bg-white'}`}>
                  Outward
                </button>
              )}
            </nav>

            {mode === 'inward' && canUseOfflinePermission(user, 'inward') && (
              <form onSubmit={submitInward} className="grid gap-3 rounded-lg border bg-white p-4 sm:grid-cols-2">
                <h2 className="font-semibold sm:col-span-2">
                  {editingTransaction?.type === 'COLD_INWARD' ? 'Resume inward draft' : 'New inward (saved locally)'}
                </h2>
                <select required value={warehouseId} onChange={(event) => {
                  setWarehouseId(event.target.value);
                  setInwardStackAllocations([createEmptyStackAllocation()]);
                }} className="rounded border p-2">
                  <option value="">Select warehouse</option>
                  {warehouses.map((warehouse) => <option key={warehouse._id} value={warehouse._id}>{warehouse.name}</option>)}
                </select>
                <select required value={clientId} onChange={(event) => setClientId(event.target.value)} className="rounded border p-2">
                  <option value="">Select client / farmer</option>
                  {clients.map((client) => <option key={String(client._id)} value={String(client._id)}>{String(client.name || client._id)}</option>)}
                </select>
                <select required value={commodityId} onChange={(event) => setCommodityId(event.target.value)} className="rounded border p-2">
                  <option value="">Select commodity</option>
                  {commodities.map((commodity) => <option key={String(commodity._id)} value={String(commodity._id)}>{String(commodity.name || commodity._id)}</option>)}
                </select>
                <input required value={lotNo} onChange={(event) => setLotNo(event.target.value)} placeholder="Lot number" className="rounded border p-2" />
                <input required value={truckNo} onChange={(event) => setTruckNo(event.target.value)} placeholder="Truck number" className="rounded border p-2" />
                <input required type="number" min="0.01" step="0.01" value={inwardWeight} onChange={(event) => setInwardWeight(event.target.value)} placeholder="Net weight (kg)" className="rounded border p-2" />
                <input required type="number" min="1" step="1" value={inwardBags} onChange={(event) => setInwardBags(event.target.value)} placeholder="Bags" className="rounded border p-2" />
                <section className="space-y-3 sm:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold">Stack allocations</h3>
                    <button type="button" onClick={addInwardStack} className="rounded border px-3 py-2 text-sm font-medium">
                      Add another stack
                    </button>
                  </div>
                  {inwardStackAllocations.length > 1 && (
                    <p className="text-sm text-slate-600">
                      Enter each stack&apos;s share. Allocated weights and bags must add up to the inward totals above.
                    </p>
                  )}
                  {inwardStackAllocations.map((allocation, index) => {
                    const chamber = selectedWarehouse?.chambers?.find(
                      (item) => String(item.chamberNo ?? item.name) === allocation.chamberNo ||
                        item.name === allocation.chamberNo,
                    );
                    const floor = chamber?.floors?.find(
                      (item) => String(item.floorNo ?? item.name) === allocation.floorNo ||
                        item.name === allocation.floorNo,
                    );

                    return (
                      <fieldset key={allocation.id} className="grid gap-3 rounded border p-3 sm:grid-cols-2">
                        <legend className="px-1 text-sm font-medium">Stack {index + 1}</legend>
                        <select
                          required
                          aria-label={`Chamber for stack ${index + 1}`}
                          value={allocation.chamberNo}
                          onChange={(event) => updateInwardStack(index, {
                            chamberNo: event.target.value,
                            floorNo: '',
                            stackNo: '',
                          })}
                          className="rounded border p-2"
                        >
                          <option value="">Select chamber</option>
                          {selectedWarehouse?.chambers?.map((item, chamberIndex) => (
                            <option key={`${item.chamberNo}-${chamberIndex}`} value={String(item.chamberNo ?? item.name)}>
                              {item.name || `Chamber ${item.chamberNo}`}
                            </option>
                          ))}
                        </select>
                        <select
                          required
                          aria-label={`Floor for stack ${index + 1}`}
                          value={allocation.floorNo}
                          onChange={(event) => updateInwardStack(index, {
                            floorNo: event.target.value,
                            stackNo: '',
                          })}
                          className="rounded border p-2"
                        >
                          <option value="">Select floor</option>
                          {chamber?.floors?.map((item, floorIndex) => (
                            <option key={`${item.floorNo}-${floorIndex}`} value={String(item.floorNo ?? item.name)}>
                              {item.name || `Floor ${item.floorNo}`}
                            </option>
                          ))}
                        </select>
                        <select
                          required
                          aria-label={`Rack / stack ${index + 1}`}
                          value={allocation.stackNo}
                          onChange={(event) => updateInwardStack(index, { stackNo: event.target.value })}
                          className="rounded border p-2"
                        >
                          <option value="">Select rack / stack</option>
                          {floor?.stacks?.map((item, stackIndex) => (
                            <option key={`${item.stackNo}-${stackIndex}`} value={String(item.stackNo ?? item.name)}>
                              {item.name || `Stack ${item.stackNo}`}
                            </option>
                          ))}
                        </select>
                        {inwardStackAllocations.length > 1 && (
                          <>
                            <input
                              required
                              type="number"
                              min="0.01"
                              step="0.01"
                              aria-label={`Allocated weight for stack ${index + 1}`}
                              placeholder={`Stack ${index + 1} allocated weight (kg)`}
                              value={allocation.allocatedWeight}
                              onChange={(event) => updateInwardStack(index, { allocatedWeight: event.target.value })}
                              className="rounded border p-2"
                            />
                            <input
                              required
                              type="number"
                              min="0"
                              step="1"
                              aria-label={`Allocated bags for stack ${index + 1}`}
                              placeholder={`Stack ${index + 1} allocated bags`}
                              value={allocation.allocatedBags}
                              onChange={(event) => updateInwardStack(index, { allocatedBags: event.target.value })}
                              className="rounded border p-2"
                            />
                          </>
                        )}
                        {inwardStackAllocations.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeInwardStack(index)}
                            className="justify-self-start rounded border border-rose-300 px-3 py-1.5 text-sm text-rose-700"
                          >
                            Remove stack
                          </button>
                        )}
                      </fieldset>
                    );
                  })}
                </section>
                <button disabled={submitting} className="rounded bg-blue-700 px-4 py-2 font-semibold text-white disabled:opacity-60 sm:col-span-2">
                  {submitting
                    ? 'Saving…'
                    : editingTransaction?.type === 'COLD_INWARD' ? 'Save Draft Changes' : 'Save inward offline'}
                </button>
              </form>
            )}

            {mode === 'outward' && canUseOfflinePermission(user, 'outward') && (
              outwardFormInwards.length > 0 ? (
                <ColdOutwardForm
                  key={editingTransaction?.type === 'COLD_OUTWARD' ? editingTransaction.transactionId : 'new-outward'}
                  clients={clients}
                  commodities={commodities}
                  warehouses={warehouses}
                  onSuccess={() => undefined}
                  offlineMode={outwardFormMode}
                />
              ) : (
                <p className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
                  No available outward stock is cached on this device. Open the ERP online, wait for the authorized stock download to finish, then reopen Offline Outward.
                </p>
              )
            )}

            {notice && <p role="status" className="rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">{notice}</p>}

            <section className="rounded-lg border bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">Saved transactions: {visibleTransactions.length} · {pendingCount} pending sync</h2>
              </div>
              {visibleTransactions.length === 0 ? (
                <p className="mt-2 text-sm text-slate-600">No saved transactions are available.</p>
              ) : (
                <ul className="mt-3 divide-y">
                  {visibleTransactions.map((transaction) => (
                    <li key={transaction.transactionId} className="py-3 text-sm">
                      <div className="flex flex-wrap justify-between gap-2">
                        <span className="font-medium">{transaction.type.replace('COLD_', '')} · {transaction.transactionId}</span>
                        <span>{transaction.status === 'SYNCED'
                          ? 'Synced'
                          : transaction.status === 'FAILED' || transaction.lastError
                            || transaction.draftSyncState === 'FAILED'
                            ? 'Sync Failed'
                            : transaction.draftSyncState === 'SYNCED'
                              ? 'Synced'
                            : transaction.status === 'PENDING_SYNC' || transaction.status === 'SYNCING'
                              || transaction.draftSyncState === 'PENDING_SYNC'
                              || transaction.draftSyncState === 'SYNCING'
                              ? 'Pending Sync'
                              : 'Draft'}
                        </span>
                      </div>
                      <p className="mt-1 text-slate-600">{new Date(transaction.createdAt).toLocaleString()}</p>
                      {transaction.lastError && <p className="mt-1 text-rose-700">{transaction.lastError}</p>}
                      {transaction.draftSyncError && <p className="mt-1 text-rose-700">{transaction.draftSyncError}</p>}
                      <details className="mt-2 rounded border bg-slate-50 p-3">
                        <summary className="cursor-pointer font-semibold text-blue-800">View Transaction</summary>
                        <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-white p-3 text-xs">
                          {JSON.stringify(transaction.payload, null, 2)}
                        </pre>
                      </details>
                      {transaction.submissionUncertain && (
                        <p className="mt-1 text-amber-800">
                          Retry this unchanged draft to confirm whether the server saved it before editing.
                        </p>
                      )}
                      {transaction.status !== 'SYNCED' && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={
                              Boolean(editingTransaction) ||
                              transaction.submissionUncertain === true ||
                              transaction.status === 'SYNCING' ||
                              submittingDraftId === transaction.transactionId
                            }
                            onClick={() => resumeTransaction(transaction)}
                            className="rounded border px-3 py-1.5 font-semibold disabled:opacity-60"
                          >
                            Resume Transaction
                          </button>
                          <button
                            type="button"
                            disabled={
                              submittingDraftId === transaction.transactionId ||
                              editingTransaction?.transactionId === transaction.transactionId
                            }
                            onClick={() => void submitTransactionDraft(transaction)}
                            className="rounded border border-blue-300 px-3 py-1.5 font-semibold text-blue-800 disabled:opacity-60"
                          >
                            {submittingDraftId === transaction.transactionId ? 'Submitting…' : 'Submit Transaction'}
                          </button>
                          {transaction.draftSyncState === 'FAILED' && (
                            <button
                              type="button"
                              disabled={
                                (typeof navigator !== 'undefined' && !navigator.onLine) ||
                                submittingDraftId === transaction.transactionId
                              }
                              onClick={() => void retryDraftUpload(transaction)}
                              className="rounded border border-amber-300 px-3 py-1.5 font-semibold text-amber-900 disabled:opacity-60"
                            >
                              Retry Draft Sync
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={submittingDraftId === transaction.transactionId}
                            onClick={() => void deleteTransactionDraft(transaction)}
                            className="rounded border border-rose-300 px-3 py-1.5 font-semibold text-rose-700 disabled:opacity-60"
                          >
                            Delete Draft
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
              Locally queued transactions are private to this browser profile until the server confirms synchronization. Conflicts and rejected records remain on this device for review.
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
