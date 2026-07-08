import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import ColdSidebar from '@/components/layout/cold-sidebar';
import NextAuthSessionProvider from '@/components/providers/session-provider';

import { ColdLanguageProvider } from '@/components/providers/cold-language-provider';

export default async function ColdLayout({
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

  // Ensure only Cold Storage users or Admin can access this layout
  const storagePlan = (session.user as any).storagePlan;
  if (storagePlan !== 'COLD' && (session.user as any).role !== 'ADMIN') {
    redirect('/dashboard');
  }

  const userLanguage = (session.user as any).coldLanguage || 'en';

  return (
    <NextAuthSessionProvider>
      <ColdLanguageProvider language={userLanguage}>
        <div className="flex h-screen bg-slate-50 overflow-hidden text-slate-900">
          {/* Persistent Sidebar for Cold Storage */}
          <ColdSidebar session={session} />
          
          {/* Main Content Area */}
          <main className="flex-1 overflow-y-auto p-4 md:p-8 w-full">
            {children}
          </main>
        </div>
      </ColdLanguageProvider>
    </NextAuthSessionProvider>
  );
}
