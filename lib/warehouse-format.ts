import { Db } from 'mongodb';

export async function getWarehouseFormatter(db: Db, isAdmin: boolean) {
  if (!isAdmin) {
    return (name: string, userId?: string) => name;
  }

  // Fetch all warehouses to count names
  const warehouseDocs = await db.collection('warehouses').find({}).project({ userId: 1, name: 1 }).toArray();
  const nameCounts = new Map<string, number>();
  warehouseDocs.forEach(w => {
    const n = w.name?.toLowerCase() || '';
    nameCounts.set(n, (nameCounts.get(n) || 0) + 1);
  });

  // Fetch users for WSP names
  const uniqueUserIds = [...new Set(warehouseDocs.map(w => w.userId?.toString()).filter(Boolean))];
  const userIds = uniqueUserIds.map(id => {
    try {
      // @ts-ignore - dynamic import of ObjectId if needed, but we can just use strings for $in if they are ObjectIds in the DB they might need proper conversion
      return typeof id === 'string' && id.length === 24 ? new (require('mongodb').ObjectId)(id) : id;
    } catch {
      return id;
    }
  });
  
  const users = userIds.length > 0 ? await db.collection('users').find({ _id: { $in: userIds } }).project({ _id: 1, fullName: 1, email: 1, companyName: 1 }).toArray() : [];
  const userMap = new Map(users.map(u => [u._id.toString(), { fullName: u.fullName, email: u.email, companyName: u.companyName }]));

  return (name: string, userId?: string, warehouseIdStr?: string) => {
    if (!name) return name;
    
    const n = name.toLowerCase();
    const isDuplicate = (nameCounts.get(n) || 0) > 1;
    
    let formattedName = name;
    
    if (isDuplicate && userId) {
      const userInfo = userMap.get(userId.toString());
      const wspName = userInfo?.companyName || userInfo?.fullName || userInfo?.email || 'Unknown';
      formattedName = `${name} (${wspName})`;
    }
    
    if (warehouseIdStr) {
      return `${warehouseIdStr} - ${formattedName}`;
    }
    
    return formattedName;
  };
}
