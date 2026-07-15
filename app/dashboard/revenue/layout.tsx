import { requireWspPagePermission } from '@/lib/server-wsp-permissions';

export default async function RevenueLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireWspPagePermission('revenueSplit');
  return <>{children}</>;
}
