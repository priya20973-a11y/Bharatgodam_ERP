import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ShieldAlert } from 'lucide-react';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function AccessDeniedPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/');
  }

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-slate-50 text-slate-900 p-4">
      <div className="mx-auto flex max-w-[420px] flex-col items-center justify-center text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-100 mb-6">
          <ShieldAlert className="h-10 w-10 text-red-600" />
        </div>
        
        <h1 className="text-3xl font-extrabold tracking-tight mb-2">Access Denied</h1>
        
        <p className="text-sm text-slate-500 mb-8 max-w-[90%]">
          Your account currently does not have access to any modules. Please contact your administrator if you believe this is a mistake.
        </p>

        <form action="/api/auth/signout" method="POST">
          <Button type="submit" variant="default" className="bg-slate-900 hover:bg-slate-800">
            Sign out
          </Button>
        </form>
      </div>
    </div>
  );
}
