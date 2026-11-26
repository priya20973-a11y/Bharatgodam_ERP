import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import {
  getColdInwards,
} from '@/app/actions/cold-inward-actions';
import { getAvailableInwardsForClient } from '@/app/actions/cold-outward-actions';
import { getColdTransfers } from '@/app/actions/cold-transfer-actions';
import { getColdWarehouses } from '@/app/actions/cold-warehouse-actions';
import { getClients } from '@/app/actions/client-actions';
import { fetchColdCommodities } from '@/app/actions/cold-commodities';

export const dynamic = 'force-dynamic';

type IdReference = string | { _id: string } | null | undefined;

function referenceId(reference: IdReference): string {
  return typeof reference === 'string' ? reference : reference?._id || '';
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const canCreateInward = hasPermission(session, 'inward', 'create');
    const canCreateOutward = hasPermission(session, 'outward', 'create');
    if (!canCreateInward && !canCreateOutward) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [warehouses, clients, commodities, inwardResult] = await Promise.all([
      getColdWarehouses({ includeInactive: false }),
      getClients(),
      fetchColdCommodities(),
      getColdInwards({ limit: -1 }),
    ]);

    const outwardStock: Array<{
      ownerId: string;
      isWarehouse: boolean;
      inwards: Array<Record<string, unknown> & { _id: string }>;
    }> = [];
    if (canCreateOutward) {
      const clientRecords = clients as Array<{ _id: string }>;
      const warehouseRecords = warehouses as Array<{ _id: string }>;
      const owners = [
        ...clientRecords.map((client) => ({ id: String(client._id), isWarehouse: false })),
        ...warehouseRecords.map((warehouse) => ({ id: String(warehouse._id), isWarehouse: true })),
      ];
      const transfers = await getColdTransfers() as Array<{
        _id: string;
        toClientId?: IdReference;
        newInwardId?: IdReference;
      }>;
      const transferIdsByOwnerAndInward = new Map<string, string[]>();
      transfers.forEach((transfer) => {
        const ownerId = referenceId(transfer.toClientId);
        const inwardId = referenceId(transfer.newInwardId);
        if (!ownerId || !inwardId) return;
        const key = `${ownerId}:${inwardId}`;
        transferIdsByOwnerAndInward.set(key, [
          ...(transferIdsByOwnerAndInward.get(key) || []),
          String(transfer._id),
        ]);
      });

      for (let index = 0; index < owners.length; index += 8) {
        const ownerBatch = owners.slice(index, index + 8);
        const stockBatch = await Promise.all(ownerBatch.map(async (owner) => {
          const inwards = await getAvailableInwardsForClient(owner.id, owner.isWarehouse) as
            Array<Record<string, unknown> & { _id: string }>;
          return {
            ownerId: owner.id,
            isWarehouse: owner.isWarehouse,
            inwards: inwards.map((inward) => ({
              ...inward,
              _offlineOwnerId: owner.id,
              _offlineOwnerIsWarehouse: owner.isWarehouse,
              _offlineTransferIds:
                transferIdsByOwnerAndInward.get(`${owner.id}:${String(inward._id)}`) || [],
            })),
          };
        }));
        outwardStock.push(...stockBatch);
      }
    }

    return NextResponse.json(
      {
        userId: session.user.id,
        permissions: {
          inward: canCreateInward,
          outward: canCreateOutward,
        },
        warehouses,
        clients,
        commodities,
        inwards: inwardResult.inwards.filter(
          (inward: { quantityKg?: number }) => Number(inward.quantityKg) > 0,
        ),
        outwardStock,
        downloadedAt: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    console.error('Unable to prepare offline cold-storage data:', error);
    return NextResponse.json(
      { error: 'Unable to prepare offline data.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
