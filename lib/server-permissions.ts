import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { PermissionModule, hasPermission } from './permissions';

export async function requirePagePermission(module: PermissionModule) {
  const session = await getServerSession(authOptions);
  
  if (!hasPermission(session, module, 'view')) {
    redirect('/cold/dashboard');
  }
  return session;
}
