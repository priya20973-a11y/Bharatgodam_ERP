import { Suspense } from 'react';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import DashboardContent from './dashboard-content';
import { requireWspPagePermission } from '@/lib/server-wsp-permissions';

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Premium Hero Header Section */}
      <div className="relative overflow-hidden rounded-3xl bg-slate-200 dark:bg-slate-800 h-48 w-full" />

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        <div className="h-40 rounded-3xl bg-slate-200 dark:bg-slate-800" />
        <div className="h-40 rounded-3xl bg-slate-200 dark:bg-slate-800" />
        <div className="h-40 rounded-3xl bg-slate-200 dark:bg-slate-800" />
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* Quick Navigation Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="h-28 rounded-2xl bg-slate-200 dark:bg-slate-800" />
          <div className="h-28 rounded-2xl bg-slate-200 dark:bg-slate-800" />
          <div className="h-28 rounded-2xl bg-slate-200 dark:bg-slate-800" />
          <div className="h-28 rounded-2xl bg-slate-200 dark:bg-slate-800" />
        </div>

        {/* Live Transaction Report wrapper */}
        <div className="rounded-3xl bg-slate-200 dark:bg-slate-800 h-[600px] w-full" />
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  await requireWspPagePermission('dashboard');
  const session = await getServerSession(authOptions);
  
  if (!session) {
    redirect('/');
  }

  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent session={session} />
    </Suspense>
  );
}
