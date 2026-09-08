import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import ActivityLogClient from '@/components/features/cold-admin/activity-log-client';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Activity Log | Cold Storage',
  description: 'View Cold Storage Activity Logs',
};

export default async function ActivityLogPage() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    redirect('/auth/signin');
  }

  // Ensure only Admins can access
  if (session.user.role !== 'SUPERADMIN' && session.user.role !== 'WSP_ADMIN' && session.user.role !== 'ADMIN') {
    redirect('/cold/dashboard'); // Redirect non-admins to dashboard
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Activity Log</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Track and monitor all actions performed in the Cold Storage module.
          </p>
        </div>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <ActivityLogClient />
      </div>
    </div>
  );
}
