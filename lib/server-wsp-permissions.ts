import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { WspModuleId } from './wsp-permissions';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

const WSP_MODULE_PATHS: Record<WspModuleId, string> = {
  dashboard: '/dashboard',
  warehouseMaster: '/dashboard/warehouses',
  clientMaster: '/dashboard/clients',
  commodityMaster: '/dashboard/commodities',
  warehouseInventory: '/dashboard/warehouse',
  inward: '/dashboard/inward',
  outward: '/dashboard/outward',
  transactionReport: '/dashboard/transactions-report',
  bulkUpload: '/dashboard/bulk-transactions',
  invoice: '/dashboard/client-invoices',
  revenueSplit: '/dashboard/revenue',
  ledger: '/dashboard/ledger'
};

export async function requireWspPagePermission(moduleId: WspModuleId) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return redirect('/');

  const user = session.user as any;
  const role = user.role?.toString().toUpperCase();

  // Instant DB check for Dry Storage WSPs
  if (role === 'WSP' && user.storagePlan !== 'COLD' && !user.isStaff) {
    const db = await getDb();
    const dbUser = await db.collection('users').findOne({ _id: new ObjectId(user.id) });
    const perms = dbUser?.wspPermissions || {};
    
    // Explicitly allow clientMaster even if it's set to false in the database
    if (perms[moduleId] === false && moduleId !== 'clientMaster') {
      // Find the first permitted module to avoid redirect loops
      const availableModules = Object.keys(WSP_MODULE_PATHS) as WspModuleId[];
      const firstPermitted = availableModules.find(id => perms[id] !== false);
      
      if (firstPermitted) {
        redirect(WSP_MODULE_PATHS[firstPermitted]);
      } else {
        redirect('/access-denied');
      }
    }
  }
  return session;
}

export async function requireWspActionPermission(moduleId: WspModuleId) {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error('401_UNAUTHORIZED');

  const user = session.user as any;
  const role = user.role?.toString().toUpperCase();

  // Instant DB check for Dry Storage WSPs
  if (role === 'WSP' && user.storagePlan !== 'COLD' && !user.isStaff) {
    const db = await getDb();
    const dbUser = await db.collection('users').findOne({ _id: new ObjectId(user.id) });
    if (dbUser?.wspPermissions && dbUser.wspPermissions[moduleId] === false && moduleId !== 'clientMaster') {
      throw new Error(`403_FORBIDDEN: Unauthorized access to module ${moduleId}`);
    }
  }
}
