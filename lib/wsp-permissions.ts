import { Session } from 'next-auth';

export type WspModuleId = 
  | 'dashboard'
  | 'warehouseMaster'
  | 'clientMaster'
  | 'commodityMaster'
  | 'warehouseInventory'
  | 'inward'
  | 'outward'
  | 'transactionReport'
  | 'bulkUpload'
  | 'invoice'
  | 'revenueSplit'
  | 'ledger'; // We'll keep ledger for completeness

export const WSP_MODULE_NAMES: Record<WspModuleId, string> = {
  dashboard: 'Dashboard',
  warehouseMaster: 'Warehouse Master',
  clientMaster: 'Client Master',
  commodityMaster: 'Commodity Master',
  warehouseInventory: 'Warehouse Inventory',
  inward: 'Inward Transaction',
  outward: 'Outward Transaction',
  transactionReport: 'Transactions Report',
  bulkUpload: 'Bulk Upload',
  invoice: 'Client Invoices',
  revenueSplit: 'Revenue split for Storage Charges',
  ledger: 'Client Ledger'
};

/**
 * Checks if a WSP user (Dry Storage) has permission for a specific module.
 * Defaults to true if the permission is not explicitly set to false, ensuring backward compatibility.
 */
export function hasWspPermission(session: Session | null, moduleId: WspModuleId): boolean {
  if (!session?.user) return false;

  const user = session.user as any;
  const role = user.role?.toString().toUpperCase();
  const storagePlan = user.storagePlan;

  // Admins always have access
  if (role === 'ADMIN' || role === 'SUPER_ADMIN') return true;

  // This check is ONLY for Dry Storage WSP users
  if (role === 'WSP' && storagePlan !== 'COLD' && !user.isStaff) {
    const permissions = user.wspPermissions;
    // If permissions object exists and the specific module is explicitly set to false, deny access
    if (permissions && typeof permissions === 'object') {
      if (permissions[moduleId] === false) {
        return false;
      }
    }
  }

  // Allow access by default (Staff logic is handled by lib/permissions.ts, Cold Storage WSPs are unaffected)
  return true;
}
