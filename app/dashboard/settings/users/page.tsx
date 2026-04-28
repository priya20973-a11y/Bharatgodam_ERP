import { getAllUsers } from '@/app/actions/user-actions';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import UsersManagementClient from './users-client';
import { type User } from '@/app/actions/user-actions';

export const dynamic = 'force-dynamic';

export default async function UsersManagementPage() {
  const session = await getServerSession(authOptions);

  // Only allow ADMIN users
  if (!session?.user || (session.user as any).role !== 'ADMIN') {
    redirect('/dashboard');
  }

  const users = await getAllUsers() as User[];

  return <UsersManagementClient users={users} />;
}
