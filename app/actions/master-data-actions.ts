'use server';

import { getDb } from '@/lib/mongodb';
import { getTenantFilterForMongo, requireSession } from '@/lib/ownership';
import type { IClient, ICommodity, IWarehouse } from '@/types/schemas';

export async function getMasterData() {
  const session = await requireSession();
  const db = await getDb();
  const tenantFilter = getTenantFilterForMongo(session);

  const [clients, commodities, warehouses] = await Promise.all([
    db.collection('clients').find({ status: 'ACTIVE', ...tenantFilter }).toArray(),
    db.collection('commodities').find({ ...tenantFilter }).toArray(),
    db.collection('warehouses').find({ status: 'ACTIVE', ...tenantFilter }).toArray(),
  ]);

  return {
    clients: clients as IClient[],
    commodities: commodities as ICommodity[],
    warehouses: warehouses as IWarehouse[],
  };
}