'use server';

import { getDb } from '@/lib/mongodb';
import { getTenantFilterForMongo, requireSession } from '@/lib/ownership';
import type { IClient, ICommodity, IWarehouse } from '@/types/schemas';
import { ObjectId } from 'mongodb';

export async function getMasterData() {
  const session = await requireSession();
  const db = await getDb();
  const tenantFilter = getTenantFilterForMongo(session);

  const [clients, commodities, warehouses] = await Promise.all([
    db.collection('clients').find({ status: 'ACTIVE', ...tenantFilter }).toArray(),
    db.collection('commodities').find({ ...tenantFilter }).toArray(),
    db.collection('warehouses').find({ status: 'ACTIVE', ...tenantFilter }).toArray(),
    db.collection('warehouse').find({ status: { $in: ['ACTIVE', 'FULL'] }, ...tenantFilter }).toArray(),
  ]);

  const userIds = [
    ...clients.map(c => c.userId),
    ...commodities.map(c => c.userId),
    ...warehouses.map(w => w.userId)
  ].filter((id): id is any => !!id);

  const uniqueUserIds = Array.from(new Set(userIds.map(id => id.toString()))).map(id => {
    try {
      return new ObjectId(id);
    } catch {
      return id;
    }
  });

  const users = uniqueUserIds.length > 0
    ? await db.collection('users').find({ _id: { $in: uniqueUserIds } }).project({ _id: 1, fullName: 1, email: 1, companyName: 1 }).toArray()
    : [];

  const userMap = new Map(users.map(u => [u._id.toString(), { fullName: u.fullName, email: u.email, companyName: u.companyName }]));

  const mapWspName = (item: any) => {
    const userId = item.userId?.toString();
    const userInfo = userId ? userMap.get(userId) : null;
    const wspName = userInfo?.companyName || userInfo?.fullName || userInfo?.email || (item.userId ? 'Unknown' : 'System');
    return {
      ...item,
      wspName
    };
  };

  return JSON.parse(JSON.stringify({
    clients: clients.map(mapWspName) as IClient[],
    commodities: commodities.map(mapWspName) as ICommodity[],
    warehouses: warehouses.map(mapWspName) as IWarehouse[],
  }));
}