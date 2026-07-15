import { requireWspPagePermission } from '@/lib/server-wsp-permissions';

export default async function ClientInvoicesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireWspPagePermission('invoice');
  return <>{children}</>;
}
