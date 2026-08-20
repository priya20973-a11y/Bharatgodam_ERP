import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import NextAuthSessionProvider from '@/components/providers/session-provider';
import ManufacturingSidebar from '@/components/layout/manufacturing-sidebar';

export default async function ManufacturingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/');
  }

  const storagePlan = ((session.user as any).storagePlan || 'DRY').toString().toUpperCase();
  const role = ((session.user as any).role || '').toString().toUpperCase();

  if (storagePlan !== 'MANUFACTURING' && role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
    redirect('/dashboard');
  }

  return (
    <NextAuthSessionProvider>
      <div className="flex h-screen bg-slate-50 overflow-hidden text-slate-900">
        <ManufacturingSidebar session={session} />

        <main className="flex-1 overflow-y-auto p-4 md:p-8 w-full">
          {children}
        </main>
      </div>
    </NextAuthSessionProvider>
  );
}
