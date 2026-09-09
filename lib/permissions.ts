import { Session } from 'next-auth';


export type PermissionModule = 
  | 'dashboard'
  | 'warehouse'
  | 'commodity'
  | 'purchase'
  | 'inward'
  | 'outward'
  | 'ledger'
  | 'invoice'
  | 'reports'
  | 'staff' // For WSP only, hidden for staff
  | 'clientMaster'
  | 'floorMapping'
  | 'ownershipTransfer'
  | 'environmentRecords'
  | 'stockShifting'
  | 'bulkUpload'
  | 'receiptConfiguration';

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'print' | 'approve';

export function hasPermission(session: Session | null, module: PermissionModule, action: PermissionAction = 'view'): boolean {
  if (!session?.user) return false;

  const role = session.user.role?.toString().toUpperCase();
  
  // Admins have full access
  if (role === 'ADMIN' || role === 'SUPER_ADMIN') return true;
  
  // WSPs have full access to their own data
  // Since we override Staff role to WSP in auth.ts, we need to check isStaff
  const isStaff = (session.user as any).isStaff;
  
  if (role === 'WSP' && !isStaff) return true;

  // For Staff, check their specific permissions
  if (isStaff) {
    const permissions = (session.user as any).permissions;
    if (!permissions) return false;

    if (permissions[module]) {
      return !!permissions[module][action];
    }

    // Fallback for stockShifting to match ownershipTransfer permission
    if (module === 'stockShifting' && permissions.ownershipTransfer) {
      return !!permissions.ownershipTransfer[action];
    }

    return false;
  }

  return false;
}

export function canViewMenu(session: Session | null, module: PermissionModule): boolean {
  return hasPermission(session, module, 'view');
}


