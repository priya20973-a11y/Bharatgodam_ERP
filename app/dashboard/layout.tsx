import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import Sidebar from '@/components/layout/sidebar';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Check authentication on server side
  const session = await getServerSession(authOptions);
  
  // Redirect to login if not authenticated
  if (!session) {
    redirect('/');
  }

  // Redirect Cold Storage users to their dedicated layout
  if ((session.user as any).storagePlan === 'COLD') {
    redirect('/cold/dashboard');
  }

  // Inject fresh WSP permissions into the session from DB so the sidebar reflects changes immediately
  const user = session.user as any;
  if (user.role === 'WSP' && user.storagePlan !== 'COLD' && !user.isStaff) {
    const { getDb } = await import('@/lib/mongodb');
    const { ObjectId } = await import('mongodb');
    const db = await getDb();
    const dbUser = await db.collection('users').findOne({ _id: new ObjectId(user.id) });
    if (dbUser) {
      user.wspPermissions = dbUser.wspPermissions || {};
    }
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden text-slate-900">
      {/* Persistent Sidebar */}
      <Sidebar session={session} />
      
      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8 w-full">
        {children}
      </main>
    </div>
  );
}
