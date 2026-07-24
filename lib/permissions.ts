import { Session } from 'next-auth';


export type PermissionModule = 
  | 'dashboard'
  | 'warehouse'
  | 'commodity'
  | 'inward'
  | 'outward'
  | 'ledger'
  | 'invoice'
  | 'reports'
  | 'environment'
  | 'staff' // For WSP only, hidden for staff
  | 'clientMaster'
  | 'floorMapping'
  | 'accounting';

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'print' | 'approve';

type UserPermissionRecord = Record<PermissionModule, Record<PermissionAction, boolean>>;

type AuthUser = {
  role?: string | null;
  isStaff?: boolean;
  permissions?: UserPermissionRecord;
};

export function hasPermission(session: Session | null, module: PermissionModule, action: PermissionAction = 'view'): boolean {
  if (!session?.user) return false;

  const user = session.user as unknown as AuthUser;
  const role = user.role?.toString().toUpperCase();

  if (role === 'ADMIN' || role === 'SUPER_ADMIN') return true;

  if (role === 'WSP' && !user.isStaff) return true;

  if (user.isStaff) {
    const permissions = user.permissions;
    if (!permissions || !permissions[module]) return false;
    return !!permissions[module][action];
  }

  return false;
}

export function canViewMenu(session: Session | null, module: PermissionModule): boolean {
  return hasPermission(session, module, 'view');
}


