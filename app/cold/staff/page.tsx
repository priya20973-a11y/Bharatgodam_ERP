import StaffManagement from '@/components/features/cold-staff/staff-management';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { hasPermission } from '@/lib/permissions';

export default async function StaffPage() {
  const session = await getServerSession(authOptions);

  if (!hasPermission(session, 'staff', 'view')) {
    redirect('/cold/dashboard');
  }

  return <StaffManagement />;
}
