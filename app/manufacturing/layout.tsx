import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import NextAuthSessionProvider from '@/components/providers/session-provider';

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
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </div>
      </div>
    </NextAuthSessionProvider>
  );
}
