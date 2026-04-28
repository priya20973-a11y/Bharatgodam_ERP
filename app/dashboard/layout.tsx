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
